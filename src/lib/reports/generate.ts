import ExcelJS from "exceljs";
import type { Tables } from "@/lib/types/database";

type Tender = Tables<"tenders">;
type Requirement = Tables<"tender_requirements">;
type Section = Tables<"tender_sections">;

export async function buildBoqWorkbook(tender: Tender, sections: Section[], requirements: Requirement[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BidNexa";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("BOQ Export");
  sheet.columns = [
    { header: "Section", key: "section", width: 28 },
    { header: "Item No.", key: "item", width: 12 },
    { header: "Description", key: "desc", width: 50 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Quantity", key: "qty", width: 12 },
    { header: "Rate", key: "rate", width: 12 },
    { header: "Amount", key: "amount", width: 16 },
    { header: "Row Type", key: "type", width: 14 },
    { header: "Source Row", key: "sourceRow", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  const sectionNameById = new Map(sections.map((s) => [s.id, s.original_section_name]));

  for (const r of requirements) {
    sheet.addRow({
      section: r.section_id ? sectionNameById.get(r.section_id) ?? "" : "",
      item: r.item_number ?? "",
      desc: r.original_description,
      unit: r.unit ?? "",
      qty: r.quantity ?? "",
      rate: r.rate ?? "",
      amount: r.amount ?? "",
      type: r.row_type,
      sourceRow: r.source_row ?? "",
    });
  }

  const meta = workbook.addWorksheet("Tender Info");
  meta.addRows([
    ["Tender", tender.title],
    ["Reference", tender.reference_number ?? ""],
    ["Client", tender.client_name ?? ""],
    ["Currency", tender.currency],
    ["Generated at", new Date().toISOString()],
  ]);

  return workbook;
}

export async function buildComparisonWorkbook(
  tender: Tender,
  requirements: Requirement[],
  submissions: Array<{
    id: string;
    contractors: { name: string } | null;
    contractor_bid_items: Array<{
      requirement_id: string | null;
      quoted_quantity: number | null;
      quoted_rate: number | null;
      quoted_amount: number | null;
      is_excluded: boolean;
      is_deviation: boolean;
    }>;
  }>
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BidNexa";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Comparison");
  const baseColumns = [
    { header: "Item No.", key: "item", width: 12 },
    { header: "Description", key: "desc", width: 46 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Tender Qty", key: "qty", width: 12 },
  ];
  const contractorColumns = submissions.flatMap((s) => [
    { header: `${s.contractors?.name ?? "Contractor"} - Rate`, key: `${s.id}_rate`, width: 14 },
    { header: `${s.contractors?.name ?? "Contractor"} - Amount`, key: `${s.id}_amount`, width: 16 },
  ]);
  sheet.columns = [...baseColumns, ...contractorColumns];
  sheet.getRow(1).font = { bold: true };

  const bidByReq = new Map<string, Map<string, (typeof submissions)[number]["contractor_bid_items"][number]>>();
  for (const s of submissions) {
    const m = new Map<string, (typeof s.contractor_bid_items)[number]>();
    for (const item of s.contractor_bid_items) {
      if (item.requirement_id) m.set(item.requirement_id, item);
    }
    bidByReq.set(s.id, m);
  }

  for (const r of requirements) {
    const row: Record<string, unknown> = {
      item: r.item_number ?? "",
      desc: r.original_description,
      unit: r.unit ?? "",
      qty: r.quantity ?? "",
    };
    for (const s of submissions) {
      const item = bidByReq.get(s.id)?.get(r.id);
      row[`${s.id}_rate`] = item?.quoted_rate ?? "";
      row[`${s.id}_amount`] = item?.quoted_amount ?? "";
    }
    sheet.addRow(row);
  }

  const totalsRow: Record<string, unknown> = { desc: "TOTAL" };
  for (const s of submissions) {
    const total = (bidByReq.get(s.id) ? Array.from(bidByReq.get(s.id)!.values()) : []).reduce(
      (sum, i) => sum + (i.quoted_amount ? Number(i.quoted_amount) : 0),
      0
    );
    totalsRow[`${s.id}_amount`] = total;
  }
  const addedRow = sheet.addRow(totalsRow);
  addedRow.font = { bold: true };

  return workbook;
}
