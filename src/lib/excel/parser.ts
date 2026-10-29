import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import type {
  ExtractedCell,
  RawCellValueType,
  SheetManifestEntry,
  WorkbookManifest,
} from "./types";
import { evaluateFormula, UnsupportedFormulaError } from "./formula-engine";

export const PARSER_VERSION = "1.0.0";

export function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function classifyValueType(cell: ExcelJS.Cell): RawCellValueType {
  if (cell.formula) return "formula";
  const v = cell.value;
  if (v === null || v === undefined || v === "") return "blank";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (v instanceof Date) return "date";
  if (typeof v === "object" && "error" in (v as object)) return "error";
  return "string";
}

function stringifyRaw(cell: ExcelJS.Cell, valueType: RawCellValueType): string | null {
  if (valueType === "blank") return null;
  if (valueType === "formula") {
    const formulaValue = cell.value as ExcelJS.CellFormulaValue;
    const result = formulaValue.result;
    if (result === undefined || result === null) return null;
    if (typeof result === "object" && "error" in (result as object)) return null;
    return String(result);
  }
  if (valueType === "date") return (cell.value as Date).toISOString();
  if (valueType === "error") return JSON.stringify(cell.value);
  return String(cell.value);
}

function extractFormula(cell: ExcelJS.Cell): { formula: string | null; cachedResult: string | null } {
  if (!cell.formula) return { formula: null, cachedResult: null };
  const formulaValue = cell.value as ExcelJS.CellFormulaValue;
  const result = formulaValue.result;
  let cachedResult: string | null = null;
  if (result !== undefined && result !== null) {
    cachedResult =
      typeof result === "object" && "error" in (result as object)
        ? null
        : String(result);
  }
  return { formula: cell.formula, cachedResult };
}

/**
 * Parses every worksheet of a workbook deterministically: no AI involved.
 * Preserves every populated cell's original value/type/formula verbatim,
 * attempts safe recalculation of a bounded formula subset, and records a
 * manifest entry per sheet (including hidden and empty ones) so nothing is
 * silently skipped.
 */
export async function parseWorkbook(
  buffer: Buffer,
  originalFilename: string
): Promise<WorkbookManifest> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: SheetManifestEntry[] = [];

  workbook.eachSheet((worksheet, sheetId) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const mergedRanges: string[] = collectMergedRanges(worksheet);
    const mergeLookup = buildMergeLookup(mergedRanges);

    let populatedCellCount = 0;
    let formulaCellCount = 0;
    let maxRow = 0;
    let maxCol = 0;
    const cells: ExtractedCell[] = [];
    const cellValueByAddress = new Map<string, number>();

    try {
      worksheet.eachRow({ includeEmpty: true }, (row, rowIndex) => {
        row.eachCell({ includeEmpty: true }, (cell, colIndex) => {
          maxRow = Math.max(maxRow, rowIndex);
          maxCol = Math.max(maxCol, colIndex);

          const valueType = classifyValueType(cell);
          if (valueType === "blank") return;

          populatedCellCount++;
          if (valueType === "formula") formulaCellCount++;

          const address = cell.address;
          const { formula, cachedResult } = extractFormula(cell);
          const valueText = stringifyRaw(cell, valueType);

          if (valueType === "number" && valueText !== null) {
            cellValueByAddress.set(address, parseFloat(valueText));
          } else if (valueType === "formula" && cachedResult !== null && !isNaN(Number(cachedResult))) {
            cellValueByAddress.set(address, Number(cachedResult));
          }

          const merge = mergeLookup.get(address);

          cells.push({
            address,
            rowIndex,
            columnIndex: colIndex,
            valueText,
            valueType,
            originalFormula: formula,
            cachedFormulaResult: cachedResult,
            recalculatedResult: null,
            calculationStatus: formula ? "unavailable" : "not_applicable",
            numberFormat: (cell.numFmt as string) ?? null,
            isMergedAnchor: merge ? merge.isAnchor : false,
            mergeRange: merge ? merge.range : null,
          });
        });
      });
    } catch (err) {
      errors.push(`Failed to iterate rows: ${(err as Error).message}`);
    }

    // Second pass: attempt safe recalculation now that all cell values on
    // this sheet are known.
    for (const cell of cells) {
      if (cell.valueType !== "formula" || !cell.originalFormula) continue;
      try {
        const rawRecalculated = evaluateFormula(cell.originalFormula, (addr) =>
          cellValueByAddress.has(addr) ? cellValueByAddress.get(addr)! : null
        );
        // Round away binary floating-point noise (e.g. 914.9399999999999)
        // without rounding away genuine precision — this never changes which
        // value is authoritative, only how it is displayed/stored.
        const recalculated = Math.round(rawRecalculated * 1e6) / 1e6;
        cell.recalculatedResult = String(recalculated);
        if (cell.cachedFormulaResult === null) {
          cell.calculationStatus = "ok";
        } else {
          const cached = Number(cell.cachedFormulaResult);
          cell.calculationStatus =
            !isNaN(cached) && Math.abs(cached - recalculated) < 0.01 ? "ok" : "mismatch";
        }
      } catch (e) {
        if (e instanceof UnsupportedFormulaError) {
          cell.calculationStatus = cell.cachedFormulaResult !== null ? "not_applicable" : "unavailable";
        } else {
          cell.calculationStatus = "unavailable";
          warnings.push(`Could not recalculate ${cell.address}: ${(e as Error).message}`);
        }
      }
    }

    const isHidden = worksheet.state === "hidden" || worksheet.state === "veryHidden";
    const processingStatus: SheetManifestEntry["processingStatus"] =
      populatedCellCount === 0 ? "skipped_empty" : errors.length > 0 ? "failed" : "processed";

    if (populatedCellCount === 0) {
      warnings.push("Sheet contains no populated cells; preserved in manifest with zero content.");
    }

    sheets.push({
      sheetName: worksheet.name,
      position: sheetId,
      isHidden,
      usedRange: maxRow > 0 && maxCol > 0 ? `A1:${colLetter(maxCol)}${maxRow}` : null,
      populatedCellCount,
      formulaCellCount,
      mergedCellRanges: mergedRanges,
      extractedRowCount: maxRow,
      extractedColumnCount: maxCol,
      processedRowCount: maxRow,
      processedCellCount: cells.length,
      processingStatus,
      warnings,
      errors,
      cells,
    });
  });

  return {
    originalFilename,
    fileHash: hashBuffer(buffer),
    fileSizeBytes: buffer.length,
    sheetCount: sheets.length,
    sheets,
  };
}

function collectMergedRanges(worksheet: ExcelJS.Worksheet): string[] {
  const model = worksheet.model as unknown as { merges?: string[] };
  return model.merges ?? [];
}

function buildMergeLookup(ranges: string[]): Map<string, { isAnchor: boolean; range: string }> {
  const map = new Map<string, { isAnchor: boolean; range: string }>();
  for (const range of ranges) {
    const [start, end] = range.split(":");
    if (!end) {
      map.set(start, { isAnchor: true, range });
      continue;
    }
    const m1 = /^([A-Za-z]+)(\d+)$/.exec(start)!;
    const m2 = /^([A-Za-z]+)(\d+)$/.exec(end)!;
    const c1 = colIndex(m1[1]);
    const r1 = parseInt(m1[2], 10);
    const c2 = colIndex(m2[1]);
    const r2 = parseInt(m2[2], 10);
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        const addr = `${colLetter(c)}${r}`;
        map.set(addr, { isAnchor: addr === start, range });
      }
    }
  }
  return map;
}

function colIndex(col: string): number {
  let idx = 0;
  for (const ch of col) idx = idx * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return idx;
}
function colLetter(idx: number): string {
  let s = "";
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}
