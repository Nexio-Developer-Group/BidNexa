import type { SheetManifestEntry, ExtractedCell } from "@/lib/excel/types";
import { interpretChunk } from "./client";
import { buildChunkUserMessage, type RowForPrompt } from "./prompts";
import type { InterpretedRow } from "./schema";

const ROWS_PER_CHUNK = 35;
const HEADER_CONTEXT_ROWS = 3;

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

  const allRows: InterpretedRow[] = [];
  const chunkErrors: SheetInterpretationResult["chunkErrors"] = [];
  let succeeded = 0;

  for (let i = 0; i < chunks.length; i++) {
    const rowIndexesInChunk = chunks[i];
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

    const result = await interpretChunk(message);

    if (!result.ok || !result.data) {
      chunkErrors.push({
        chunkIndex: i,
        rowRange: [rowIndexesInChunk[0], rowIndexesInChunk[rowIndexesInChunk.length - 1]],
        error: result.error ?? "Unknown interpretation failure",
      });
      continue;
    }

    succeeded++;
    allRows.push(...result.data.rows);

    if (result.data.unresolved_row_indexes.length > 0) {
      chunkErrors.push({
        chunkIndex: i,
        rowRange: [rowIndexesInChunk[0], rowIndexesInChunk[rowIndexesInChunk.length - 1]],
        error: `Model reported ${result.data.unresolved_row_indexes.length} unresolved row(s): ${result.data.unresolved_row_indexes.join(", ")}`,
      });
    }
  }

  return {
    sheetName: sheet.sheetName,
    totalChunks: chunks.length,
    succeededChunks: succeeded,
    failedChunks: chunks.length - succeeded,
    rows: allRows,
    chunkErrors,
  };
}
