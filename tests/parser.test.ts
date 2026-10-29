import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseWorkbook } from "@/lib/excel/parser";

async function buildWorkbookBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

test("preserves every worksheet, including hidden and empty ones", async () => {
  const buffer = await buildWorkbookBuffer((wb) => {
    const main = wb.addWorksheet("Main");
    main.getCell("A1").value = "hello";
    wb.addWorksheet("Hidden", { state: "hidden" }).getCell("A1").value = "secret";
    wb.addWorksheet("Empty");
  });

  const manifest = await parseWorkbook(buffer, "test.xlsx");

  assert.equal(manifest.sheetCount, 3);
  const names = manifest.sheets.map((s) => s.sheetName);
  assert.deepEqual(names, ["Main", "Hidden", "Empty"]);

  const hidden = manifest.sheets.find((s) => s.sheetName === "Hidden")!;
  assert.equal(hidden.isHidden, true);
  assert.equal(hidden.populatedCellCount, 1);

  const empty = manifest.sheets.find((s) => s.sheetName === "Empty")!;
  assert.equal(empty.processingStatus, "skipped_empty");
  assert.equal(empty.populatedCellCount, 0);
});

test("preserves original formula text separately from any cached/recalculated result", async () => {
  const buffer = await buildWorkbookBuffer((wb) => {
    const sheet = wb.addWorksheet("BOQ");
    sheet.getCell("D5").value = 120;
    sheet.getCell("E5").value = { formula: "85*10.764" }; // no cached result on purpose
    sheet.getCell("F5").value = { formula: "D5*E5" };
  });

  const manifest = await parseWorkbook(buffer, "test.xlsx");
  const sheet = manifest.sheets[0];
  const e5 = sheet.cells.find((c) => c.address === "E5")!;

  assert.equal(e5.originalFormula, "85*10.764");
  assert.equal(e5.cachedFormulaResult, null, "must not fabricate a cached result that wasn't in the source");
  assert.equal(e5.recalculatedResult, "914.94", "constant arithmetic should still be safely recalculated");
  assert.equal(e5.calculationStatus, "ok");
});

test("never invents a value for a genuinely blank cell", async () => {
  const buffer = await buildWorkbookBuffer((wb) => {
    const sheet = wb.addWorksheet("BOQ");
    sheet.getCell("B7").value = "Disposal of surplus earth";
    sheet.getCell("D7").value = 30;
    // E7 (rate) and F7 (amount) intentionally left blank
  });

  const manifest = await parseWorkbook(buffer, "test.xlsx");
  const sheet = manifest.sheets[0];
  assert.equal(sheet.cells.find((c) => c.address === "E7"), undefined);
  assert.equal(sheet.cells.find((c) => c.address === "F7"), undefined);
  // The populated cells (B7, D7) are still preserved.
  assert.ok(sheet.cells.find((c) => c.address === "B7"));
  assert.ok(sheet.cells.find((c) => c.address === "D7"));
});

test("records merged cell ranges and marks the anchor cell", async () => {
  const buffer = await buildWorkbookBuffer((wb) => {
    const sheet = wb.addWorksheet("BOQ");
    sheet.getCell("A1").value = "SECTION A";
    sheet.mergeCells("A1:F1");
  });

  const manifest = await parseWorkbook(buffer, "test.xlsx");
  const sheet = manifest.sheets[0];
  assert.deepEqual(sheet.mergedCellRanges, ["A1:F1"]);
  const anchor = sheet.cells.find((c) => c.address === "A1")!;
  assert.equal(anchor.isMergedAnchor, true);
  assert.equal(anchor.mergeRange, "A1:F1");
});

test("flags a formula mismatch instead of silently trusting the cached value", async () => {
  const buffer = await buildWorkbookBuffer((wb) => {
    const sheet = wb.addWorksheet("BOQ");
    sheet.getCell("D5").value = 10;
    sheet.getCell("E5").value = 5;
    // Cached result (50) deliberately wrong vs the real D5*E5 recalculation.
    sheet.getCell("F5").value = { formula: "D5*E5", result: 999 };
  });

  const manifest = await parseWorkbook(buffer, "test.xlsx");
  const f5 = manifest.sheets[0].cells.find((c) => c.address === "F5")!;
  assert.equal(f5.cachedFormulaResult, "999");
  assert.equal(f5.recalculatedResult, "50");
  assert.equal(f5.calculationStatus, "mismatch");
});
