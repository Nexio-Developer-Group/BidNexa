import type { Tables } from "@/lib/types/database";

type RequirementRow = Pick<
  Tables<"tender_requirements">,
  "row_type" | "item_number" | "unit" | "quantity" | "rate" | "amount"
>;

/**
 * Rows worth showing in a BOQ grid. Filters out:
 * - "note" rows (letterhead, boilerplate, remarks) — not priced work items.
 * - "item" rows that carry no identifying or priced data at all (item
 *   number, unit, quantity, rate, amount all empty) — almost always a
 *   misclassified letterhead/title row rather than a real line item.
 * Nothing is deleted; this only controls what's rendered in the BOQ views.
 * The review screen still shows every row, unfiltered, since that's where a
 * human confirms or corrects classification before anything is saved.
 */
export function isDisplayableBoqRow(r: RequirementRow): boolean {
  if (r.row_type === "note") return false;
  if (r.row_type === "item") {
    const hasAnyData = r.item_number || r.unit || r.quantity !== null || r.rate !== null || r.amount !== null;
    if (!hasAnyData) return false;
  }
  return true;
}
