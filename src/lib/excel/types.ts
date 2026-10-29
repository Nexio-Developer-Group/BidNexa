// Types for the deterministic workbook extraction stage.
// These describe exactly what was read from the workbook, before any AI
// interpretation — nothing here is inferred, only observed.

export type RawCellValueType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "formula"
  | "blank"
  | "error";

export type CalculationStatus = "not_applicable" | "ok" | "mismatch" | "unavailable";

export interface ExtractedCell {
  address: string; // e.g. "C9"
  rowIndex: number; // 1-based, matches Excel row number
  columnIndex: number; // 1-based
  valueText: string | null; // original value, stringified verbatim
  valueType: RawCellValueType;
  originalFormula: string | null;
  cachedFormulaResult: string | null;
  recalculatedResult: string | null;
  calculationStatus: CalculationStatus;
  numberFormat: string | null;
  isMergedAnchor: boolean;
  mergeRange: string | null;
}

export interface SheetManifestEntry {
  sheetName: string;
  position: number;
  isHidden: boolean;
  usedRange: string | null;
  populatedCellCount: number;
  formulaCellCount: number;
  mergedCellRanges: string[];
  extractedRowCount: number;
  extractedColumnCount: number;
  processedRowCount: number;
  processedCellCount: number;
  processingStatus: "processed" | "failed" | "skipped_empty";
  warnings: string[];
  errors: string[];
  cells: ExtractedCell[];
}

export interface WorkbookManifest {
  originalFilename: string;
  fileHash: string;
  fileSizeBytes: number;
  sheetCount: number;
  sheets: SheetManifestEntry[];
}

/** A structurally-classified row, before section/item mapping by the LLM. */
export interface ClassifiedRow {
  rowIndex: number;
  cells: ExtractedCell[];
  likelyType: "header" | "section" | "item" | "subtotal" | "grand_total" | "note" | "blank" | "unknown";
}
