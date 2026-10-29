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
  /**
   * True when the AI pointed at a cell address for some field that doesn't
   * exist in the deterministic parse (wrong/invented coordinate). The field's
   * value is then dropped rather than trusted, and this flag drives an
   * extraction issue so a human confirms it — the AI never gets to supply a
   * value that isn't independently verifiable against the source workbook.
   */
  hasUnresolvedCellRefs: boolean;
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

function findCellByAddress(sheet: SheetManifestEntry, address: string | null) {
  if (!address) return null;
  return sheet.cells.find((c) => c.address === address) ?? null;
}

interface ResolvedField {
  text: string | null;
  /** The AI gave a coordinate but no populated cell exists there — can't be trusted. */
  unresolved: boolean;
}

/**
 * The single point where a field's displayed value is decided. The AI is
 * only ever trusted to say *where* a value lives (a cell address) and *what
 * kind* of row this is — never what the value itself is. The actual text
 * always comes back out of the deterministic parse, by address, so the AI
 * cannot introduce, reword, or silently correct anything. No address given
 * means no value (never fabricated); an address given that doesn't resolve
 * to a real populated cell is flagged `unresolved` for human review instead
 * of falling back to whatever text the model happened to say.
 */
function resolveField(sheet: SheetManifestEntry, cellAddress: string | null): ResolvedField {
  if (!cellAddress) return { text: null, unresolved: false };
  const cell = findCellByAddress(sheet, cellAddress);
  if (!cell) return { text: null, unresolved: true };
  return { text: cell.valueText, unresolved: false };
}

function parseNumeric(value: string | null): { value: number | null; status: Enums<"field_status"> } {
  if (value === null || value.trim() === "") return { value: null, status: "missing" };
  const n = Number(value);
  if (isNaN(n)) return { value: null, status: "ambiguous" };
  return { value: n, status: "present" };
}

function resolveNumericField(
  sheet: SheetManifestEntry,
  cellAddress: string | null
): { value: number | null; status: Enums<"field_status">; unresolved: boolean } {
  const field = resolveField(sheet, cellAddress);
  if (field.unresolved) return { value: null, status: "ambiguous", unresolved: true };
  return { ...parseNumeric(field.text), unresolved: false };
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

  const itemNumberField = resolveField(sheet, row.item_number_cell);
  const descriptionField = resolveField(sheet, row.description_cell);
  const unitField = resolveField(sheet, row.unit_cell);
  const qty = resolveNumericField(sheet, row.quantity_cell);
  const rate = resolveNumericField(sheet, row.rate_cell);
  const amount = resolveNumericField(sheet, row.amount_cell);

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

  const originalDescription = descriptionField.text && descriptionField.text.trim() !== "" ? descriptionField.text : "";

  const customAttributes: Record<string, string | null> = {};
  let customFieldsUnresolved = false;
  for (const f of row.custom_fields) {
    const resolved = resolveField(sheet, f.source_cell);
    if (resolved.unresolved) customFieldsUnresolved = true;
    customAttributes[f.name] = resolved.text;
  }

  const hasUnresolvedCellRefs =
    itemNumberField.unresolved ||
    descriptionField.unresolved ||
    unitField.unresolved ||
    qty.unresolved ||
    rate.unresolved ||
    amount.unresolved ||
    customFieldsUnresolved;

  return {
    sourceRow: row.row_index,
    rowType: kind as Enums<"requirement_row_type">,
    sectionName: currentSectionName,
    itemNumber: itemNumberField.text,
    originalDescription,
    unit: unitField.text,
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
    customAttributes,
    sourceCellRefs: {
      item_number: row.item_number_cell,
      description: row.description_cell,
      unit: row.unit_cell,
      quantity: row.quantity_cell,
      rate: row.rate_cell,
      amount: row.amount_cell,
    },
    hasUnresolvedCellRefs,
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
