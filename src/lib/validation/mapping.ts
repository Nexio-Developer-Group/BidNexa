import type { InterpretedRow } from "@/lib/claude/schema";
import type { SheetManifestEntry } from "@/lib/excel/types";
import type { TablesInsert, Enums } from "@/lib/types/database";

export interface MappedRequirement {
  sourceRow: number;
  rowType: Enums<"requirement_row_type">;
  sectionName: string | null;
  itemNumber: string | null;
  originalDescription: string;
  unit: string | null;
  quantity: number | null;
  quantityStatus: Enums<"field_status">;
  rate: number | null;
  rateStatus: Enums<"field_status">;
  amount: number | null;
  amountStatus: Enums<"field_status">;
  amountFormula: string | null;
  amountFormulaCachedResult: number | null;
  amountRecalculated: number | null;
  calculationDiscrepancy: boolean;
  mappingConfidence: number;
  isAmbiguous: boolean;
  reason: string | null;
  customAttributes: Record<string, string | null>;
  sourceCellRefs: Record<string, string | null>;
}

const CLASSIFICATION_TO_ROW_TYPE: Record<string, Enums<"requirement_row_type"> | "header" | "section" | "skip"> = {
  header: "header",
  section: "section",
  item: "item",
  subtotal: "subtotal",
  grand_total: "grand_total",
  note: "note",
  deduction: "deduction",
  adjustment: "adjustment",
  unknown: "item", // preserved as an item row but flagged ambiguous for review
};

function parseNumeric(value: string | null): { value: number | null; status: Enums<"field_status"> } {
  if (value === null || value.trim() === "") return { value: null, status: "missing" };
  const n = Number(value);
  if (isNaN(n)) return { value: null, status: "ambiguous" };
  return { value: n, status: "present" };
}

function findCellByAddress(sheet: SheetManifestEntry, address: string | null) {
  if (!address) return null;
  return sheet.cells.find((c) => c.address === address) ?? null;
}

/**
 * Converts one AI-interpreted row into a canonical requirement record, or
 * null if the row is a header/section marker that produces no requirement
 * row of its own (sections are persisted separately).
 */
export function mapInterpretedRow(
  row: InterpretedRow,
  sheet: SheetManifestEntry,
  currentSectionName: string | null
): MappedRequirement | null {
  const kind = CLASSIFICATION_TO_ROW_TYPE[row.classification] ?? "item";
  if (kind === "header" || kind === "section") return null;

  const qty = parseNumeric(row.quantity_value);
  const rate = parseNumeric(row.rate_value);
  const amount = parseNumeric(row.amount_value);

  const amountFormulaCell = findCellByAddress(sheet, row.amount_formula_cell ?? row.amount_cell);
  const amountFormula = amountFormulaCell?.originalFormula ?? null;
  const cachedResult =
    amountFormulaCell?.cachedFormulaResult !== null && amountFormulaCell?.cachedFormulaResult !== undefined
      ? Number(amountFormulaCell.cachedFormulaResult)
      : null;
  const recalculated =
    amountFormulaCell?.recalculatedResult !== null && amountFormulaCell?.recalculatedResult !== undefined
      ? Number(amountFormulaCell.recalculatedResult)
      : null;

  const calculationDiscrepancy =
    amountFormulaCell?.calculationStatus === "mismatch" ||
    (amount.value !== null && recalculated !== null && Math.abs(amount.value - recalculated) > 0.01);

  const originalDescription = row.description && row.description.trim() !== "" ? row.description : "";

  return {
    sourceRow: row.row_index,
    rowType: kind as Enums<"requirement_row_type">,
    sectionName: currentSectionName,
    itemNumber: row.item_number,
    originalDescription,
    unit: row.unit,
    quantity: qty.value,
    quantityStatus: qty.status,
    rate: rate.value,
    rateStatus: rate.status,
    amount: amount.value,
    amountStatus: amount.status,
    amountFormula,
    amountFormulaCachedResult: cachedResult !== null && !isNaN(cachedResult) ? cachedResult : null,
    amountRecalculated: recalculated !== null && !isNaN(recalculated) ? recalculated : null,
    calculationDiscrepancy: Boolean(calculationDiscrepancy),
    mappingConfidence: row.mapping_confidence,
    isAmbiguous: row.is_ambiguous || row.classification === "unknown",
    reason: row.reason,
    customAttributes: Object.fromEntries(row.custom_fields.map((f) => [f.name, f.value])),
    sourceCellRefs: {
      item_number: row.item_number_cell,
      description: row.description_cell,
      unit: row.unit_cell,
      quantity: row.quantity_cell,
      rate: row.rate_cell,
      amount: row.amount_cell,
    },
  };
}

export function requirementToInsert(
  tenderId: string,
  sheetId: string,
  sectionId: string | null,
  uploadId: string,
  m: MappedRequirement
): TablesInsert<"tender_requirements"> {
  return {
    tender_id: tenderId,
    sheet_id: sheetId,
    section_id: sectionId,
    upload_id: uploadId,
    committed: false,
    source_row: m.sourceRow,
    source_cell_refs: m.sourceCellRefs,
    row_type: m.rowType,
    item_number: m.itemNumber,
    original_description: m.originalDescription,
    unit: m.unit,
    quantity: m.quantity,
    quantity_status: m.quantityStatus,
    rate: m.rate,
    rate_status: m.rateStatus,
    amount: m.amount,
    amount_status: m.amountStatus,
    amount_formula: m.amountFormula,
    amount_formula_cached_result: m.amountFormulaCachedResult,
    amount_recalculated: m.amountRecalculated,
    calculation_discrepancy: m.calculationDiscrepancy,
    mapping_confidence: m.mappingConfidence,
    custom_attributes: m.customAttributes,
  };
}
