import type { WorkbookManifest, ExtractedCell } from "@/lib/excel/types";

export interface MatchedBidRow {
  sourceCellRefs: Record<string, string | null>;
  itemNumber: string | null;
  description: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
}

const HEADER_KEYWORDS: Record<string, string[]> = {
  item: ["item no", "item number", "sl no", "s.no", "sr no"],
  description: ["description", "particulars", "work description", "item description"],
  unit: ["unit", "uom"],
  quantity: ["qty", "quantity"],
  rate: ["rate", "unit rate", "unit price"],
  amount: ["amount", "total", "value"],
};

function normalize(text: string | null): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function detectHeaderRow(cells: ExtractedCell[]): { rowIndex: number; columnMap: Record<string, number> } | null {
  const byRow = new Map<number, ExtractedCell[]>();
  for (const c of cells) {
    if (c.rowIndex > 40) continue; // headers are always near the top
    byRow.set(c.rowIndex, [...(byRow.get(c.rowIndex) ?? []), c]);
  }

  for (const [rowIndex, rowCells] of byRow) {
    const columnMap: Record<string, number> = {};
    for (const cell of rowCells) {
      const norm = normalize(cell.valueText);
      for (const [field, keywords] of Object.entries(HEADER_KEYWORDS)) {
        if (keywords.some((k) => norm === k || norm.includes(k))) {
          columnMap[field] = cell.columnIndex;
        }
      }
    }
    // Consider it a header row if it identifies at least rate/amount plus one of qty/description.
    if ((columnMap.rate || columnMap.amount) && (columnMap.quantity || columnMap.description)) {
      return { rowIndex, columnMap };
    }
  }
  return null;
}

/**
 * Deterministically extracts contractor-quoted rows from a contractor BOQ
 * workbook by locating the header row and reading quantity/rate/amount from
 * the columns it names — no AI involved, since contractor workbooks are
 * expected to mirror the tender's own BOQ shape with quoted figures added.
 */
export function extractContractorRows(manifest: WorkbookManifest): MatchedBidRow[] {
  const rows: MatchedBidRow[] = [];

  for (const sheet of manifest.sheets) {
    if (sheet.cells.length === 0) continue;
    const header = detectHeaderRow(sheet.cells);
    if (!header) continue;

    const byRow = new Map<number, ExtractedCell[]>();
    for (const c of sheet.cells) {
      if (c.rowIndex <= header.rowIndex) continue;
      byRow.set(c.rowIndex, [...(byRow.get(c.rowIndex) ?? []), c]);
    }

    const cellAt = (rowCells: ExtractedCell[], colIndex: number | undefined) =>
      colIndex ? rowCells.find((c) => c.columnIndex === colIndex) ?? null : null;

    for (const [, rowCells] of byRow) {
      const itemCell = cellAt(rowCells, header.columnMap.item);
      const descCell = cellAt(rowCells, header.columnMap.description);
      const qtyCell = cellAt(rowCells, header.columnMap.quantity);
      const rateCell = cellAt(rowCells, header.columnMap.rate);
      const amountCell = cellAt(rowCells, header.columnMap.amount);

      if (!descCell && !itemCell) continue;
      if (!rateCell && !amountCell) continue; // not a priced item row

      rows.push({
        sourceCellRefs: {
          item_number: itemCell?.address ?? null,
          description: descCell?.address ?? null,
          quantity: qtyCell?.address ?? null,
          rate: rateCell?.address ?? null,
          amount: amountCell?.address ?? null,
        },
        itemNumber: itemCell?.valueText ?? null,
        description: descCell?.valueText ?? null,
        quantity: qtyCell?.valueText ? parseFloatOrNull(qtyCell.valueText) : null,
        rate: rateCell?.valueText ? parseFloatOrNull(rateCell.valueText) : null,
        amount: amountCell?.valueText ? parseFloatOrNull(amountCell.valueText) : null,
      });
    }
  }

  return rows;
}

function parseFloatOrNull(v: string): number | null {
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

export interface TenderRequirementForMatch {
  id: string;
  itemNumber: string | null;
  originalDescription: string;
  quantity: number | null;
}

/** Matches a contractor row to a tender requirement by item number, then description. */
export function matchRequirement(
  bidRow: MatchedBidRow,
  requirements: TenderRequirementForMatch[]
): TenderRequirementForMatch | null {
  if (bidRow.itemNumber) {
    const exact = requirements.find(
      (r) => r.itemNumber && r.itemNumber.trim().toLowerCase() === bidRow.itemNumber!.trim().toLowerCase()
    );
    if (exact) return exact;
  }
  if (bidRow.description) {
    const normBid = normalize(bidRow.description);
    const match = requirements.find((r) => {
      const normReq = normalize(r.originalDescription);
      return normReq.length > 8 && (normReq.includes(normBid) || normBid.includes(normReq));
    });
    if (match) return match;
  }
  return null;
}
