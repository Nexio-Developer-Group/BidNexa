import type { SheetManifestEntry, ExtractedCell } from "@/lib/excel/types";
import { mapWithConcurrency } from "@/lib/concurrency";
import { interpretChunk } from "./client";
import { buildChunkUserMessage, type RowForPrompt } from "./prompts";
import type { InterpretedRow } from "./schema";

const ROWS_PER_CHUNK = 35;
const HEADER_CONTEXT_ROWS = 3;
// Chunks are independent, so a big sheet is interpreted in parallel rather than
// one Claude round-trip at a time.
const CHUNK_CONCURRENCY = Number(process.env.ANTHROPIC_CONCURRENCY) || 6;

function cellsToRows(cells: ExtractedCell[]): Map<number, ExtractedCell[]> {
  const byRow = new Map<number, ExtractedCell[]>();
  for (const cell of cells) {
    const arr = byRow.get(cell.rowIndex) ?? [];
    arr.push(cell);
    byRow.set(cell.rowIndex, arr);
  }
  return byRow;
}

function toRowForPrompt(rowIndex: number, cells: ExtractedCell[]): RowForPrompt {
  return {
    rowIndex,
    cells: cells.map((c) => ({
      address: c.address,
      value: c.valueText,
      type: c.valueType,
      formula: c.originalFormula,
    })),
  };
}

export interface SheetInterpretationResult {
  sheetName: string;
  totalChunks: number;
  succeededChunks: number;
  failedChunks: number;
  rows: InterpretedRow[];
  chunkErrors: { chunkIndex: number; rowRange: [number, number]; error: string }[];
}

/**
 * Chunks a sheet's rows into bounded windows and runs each through Claude for
 * semantic interpretation, preserving row order and reporting any chunk that
 * could not be classified so the caller can flag it for review rather than
 * dropping it.
 */
export async function interpretSheet(
  uploadId: string,
  sheet: SheetManifestEntry
): Promise<SheetInterpretationResult> {
  const byRow = cellsToRows(sheet.cells);
  const sortedRowIndexes = Array.from(byRow.keys()).sort((a, b) => a - b);

  const chunks: number[][] = [];
  for (let i = 0; i < sortedRowIndexes.length; i += ROWS_PER_CHUNK) {
    chunks.push(sortedRowIndexes.slice(i, i + ROWS_PER_CHUNK));
  }

  const headerContext = sortedRowIndexes
    .slice(0, HEADER_CONTEXT_ROWS)
    .map((r) => toRowForPrompt(r, byRow.get(r)!));

  const outcomes = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (rowIndexesInChunk, i) => {
    const rowsForPrompt = rowIndexesInChunk.map((r) => toRowForPrompt(r, byRow.get(r)!));

    const message = buildChunkUserMessage({
      uploadId,
      sheetName: sheet.sheetName,
      chunkIndex: i,
      headerContext: i === 0 ? [] : headerContext,
      rows: rowsForPrompt,
      isFirstChunk: i === 0,
      isLastChunk: i === chunks.length - 1,
    });

    return { rowIndexesInChunk, result: await interpretChunk(message) };
  });

  const allRows: InterpretedRow[] = [];
  const chunkErrors: SheetInterpretationResult["chunkErrors"] = [];
  let succeeded = 0;

  outcomes.forEach(({ rowIndexesInChunk, result }, i) => {
    const rowRange: [number, number] = [rowIndexesInChunk[0], rowIndexesInChunk[rowIndexesInChunk.length - 1]];

    if (!result.ok || !result.data) {
      chunkErrors.push({ chunkIndex: i, rowRange, error: result.error ?? "Unknown interpretation failure" });
      return;
    }

    succeeded++;
    allRows.push(...result.data.rows);

    if (result.data.unresolved_row_indexes.length > 0) {
      chunkErrors.push({
        chunkIndex: i,
        rowRange,
        error: `Model reported ${result.data.unresolved_row_indexes.length} unresolved row(s): ${result.data.unresolved_row_indexes.join(", ")}`,
      });
    }
  });

  return {
    sheetName: sheet.sheetName,
    totalChunks: chunks.length,
    succeededChunks: succeeded,
    failedChunks: chunks.length - succeeded,
    rows: allRows,
    chunkErrors,
  };
}
