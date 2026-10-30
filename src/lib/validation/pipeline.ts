import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/lib/types/database";
import type { WorkbookManifest, SheetManifestEntry } from "@/lib/excel/types";
import { interpretSheet } from "@/lib/claude/interpret";
import { chunkArray, mapWithConcurrency } from "@/lib/concurrency";
import { mapInterpretedRow, requirementToInsert } from "./mapping";
import { matchRequirement, type TenderRequirementForMatch, type MatchedBidRow } from "./bid-matching";
import type { InterpretedRow } from "@/lib/claude/schema";

type Client = SupabaseClient<Database>;
type IssueInsert = TablesInsert<"extraction_issues">;
type UploadStatus = Database["public"]["Enums"]["upload_status"];

const CELL_INSERT_BATCH_SIZE = 500;
const CELL_INSERT_CONCURRENCY = 4;
const ROW_INSERT_BATCH_SIZE = 200;
const ISSUE_INSERT_BATCH_SIZE = 500;

export interface ProcessingSummary {
  status: UploadStatus;
  sheetsProcessed: number;
  sheetsFailed: number;
  requirementsCreated: number;
  bidItemsCreated: number;
  matchedCount: number;
  unmatchedCount: number;
  issuesRaised: number;
}

export interface StepResult {
  done: boolean;
  sheetsDone: number;
  sheetsTotal: number;
  summary?: ProcessingSummary;
}

/**
 * Wipes everything a previous (partial/failed) run of this upload produced —
 * requirements and sections tied to its sheets, its issues, and the sheets
 * themselves (which cascades source_cells) — so a reprocess starts clean
 * instead of layering duplicate rows on top of a stuck attempt.
 */
export async function clearUploadExtractionData(supabase: Client, uploadId: string): Promise<void> {
  const { data: sheets } = await supabase.from("workbook_sheets").select("id").eq("upload_id", uploadId);
  const sheetIds = (sheets ?? []).map((s) => s.id);

  if (sheetIds.length > 0) {
    await supabase.from("tender_requirements").delete().in("sheet_id", sheetIds);
    await supabase.from("tender_sections").delete().in("sheet_id", sheetIds);
  }
  await supabase.from("extraction_issues").delete().eq("upload_id", uploadId);
  await supabase.from("workbook_sheets").delete().eq("upload_id", uploadId);
}

/** Mirrors clearUploadExtractionData, but for a contractor submission's bid items. */
export async function clearSubmissionBidItems(supabase: Client, submissionId: string, uploadId: string): Promise<void> {
  await supabase.from("contractor_bid_items").delete().eq("submission_id", submissionId);
  await supabase.from("extraction_issues").delete().eq("upload_id", uploadId);
  await supabase.from("workbook_sheets").delete().eq("upload_id", uploadId);
}

/** Removes a sheet that was interrupted mid-way so it can be redone from scratch. */
async function discardPartialSheet(supabase: Client, sheetId: string) {
  await supabase.from("tender_requirements").delete().eq("sheet_id", sheetId);
  await supabase.from("tender_sections").delete().eq("sheet_id", sheetId);
  await supabase.from("extraction_issues").delete().eq("sheet_id", sheetId);
  await supabase.from("workbook_sheets").delete().eq("id", sheetId);
}

function issueRow(params: {
  uploadId: string;
  sheetId?: string;
  requirementId?: string | null;
  issueType: string;
  severity: Database["public"]["Enums"]["issue_severity"];
  sourceReference: string | null;
  originalValue: string | null;
  proposedInterpretation: string | null;
  reason: string | null;
}): IssueInsert {
  return {
    upload_id: params.uploadId,
    sheet_id: params.sheetId ?? null,
    requirement_id: params.requirementId ?? null,
    issue_type: params.issueType,
    severity: params.severity,
    source_reference: params.sourceReference,
    original_value: params.originalValue,
    proposed_interpretation: params.proposedInterpretation,
    reason: params.reason,
  };
}

async function insertIssues(supabase: Client, rows: IssueInsert[]) {
  for (const batch of chunkArray(rows, ISSUE_INSERT_BATCH_SIZE)) {
    const { error } = await supabase.from("extraction_issues").insert(batch);
    if (error) throw new Error(`extraction_issues: ${error.message}`);
  }
}

/** Inserts the workbook_sheets row + its source_cells archive for one sheet. */
async function persistSheetManifest(supabase: Client, uploadId: string, sheet: SheetManifestEntry) {
  const { data: sheetRow, error: sheetInsertError } = await supabase
    .from("workbook_sheets")
    .insert({
      upload_id: uploadId,
      sheet_name: sheet.sheetName,
      position: sheet.position,
      is_hidden: sheet.isHidden,
      used_range: sheet.usedRange,
      populated_cell_count: sheet.populatedCellCount,
      formula_cell_count: sheet.formulaCellCount,
      merged_cell_ranges: sheet.mergedCellRanges,
      extracted_row_count: sheet.extractedRowCount,
      extracted_column_count: sheet.extractedColumnCount,
      processed_row_count: sheet.processedRowCount,
      processed_cell_count: sheet.processedCellCount,
      processing_status: sheet.processingStatus,
      validation_status: "pending",
      warnings: sheet.warnings,
      errors: sheet.errors,
    })
    .select()
    .single();

  if (sheetRow) await persistSourceCells(supabase, sheetRow.id, sheet);
  return { sheetRow, sheetInsertError };
}

async function persistSourceCells(supabase: Client, sheetId: string, sheet: SheetManifestEntry) {
  const rows: TablesInsert<"source_cells">[] = sheet.cells.map((c) => ({
    sheet_id: sheetId,
    cell_address: c.address,
    row_index: c.rowIndex,
    column_index: c.columnIndex,
    value_text: c.valueText,
    value_type: c.valueType,
    original_formula: c.originalFormula,
    cached_formula_result: c.cachedFormulaResult,
    recalculated_result: c.recalculatedResult,
    calculation_status: c.calculationStatus,
    number_format: c.numberFormat,
    is_merged_anchor: c.isMergedAnchor,
    merge_range: c.mergeRange,
  }));

  // Idempotent: unique(sheet_id, cell_address) means a retried batch after
  // a partial failure just no-ops on already-inserted cells.
  await mapWithConcurrency(chunkArray(rows, CELL_INSERT_BATCH_SIZE), CELL_INSERT_CONCURRENCY, async (batch) => {
    await supabase.from("source_cells").upsert(batch, { onConflict: "sheet_id,cell_address", ignoreDuplicates: true });
  });
}

interface StepParams {
  uploadId: string;
  tenderId: string;
  /** Set when the upload is a contractor quotation rather than the tender's own BOQ. */
  submissionId: string | null;
  manifest: WorkbookManifest;
  /** Stop starting new sheets once this wall-clock time has passed; the caller resumes with another step. */
  deadline: number;
}

/**
 * Runs as many not-yet-processed worksheets as fit in the step's time budget,
 * then either reports `done: false` (call again — progress is durable and a
 * sheet is only marked finished once fully persisted) or finalizes the upload.
 * Because state lives in the database, a step that dies mid-way (timeout,
 * crash, deploy) is simply resumed by the next call; at worst the one sheet in
 * flight is redone.
 */
export async function runProcessingStep(supabase: Client, params: StepParams): Promise<StepResult> {
  const { uploadId, tenderId, submissionId, manifest } = params;

  const [{ data: existingSheets }, { data: insertFailures }] = await Promise.all([
    supabase.from("workbook_sheets").select("id, sheet_name, position, validation_status").eq("upload_id", uploadId),
    supabase
      .from("extraction_issues")
      .select("source_reference")
      .eq("upload_id", uploadId)
      .eq("issue_type", "sheet_manifest_insert_failed"),
  ]);

  const existingByKey = new Map((existingSheets ?? []).map((s) => [`${s.position}:${s.sheet_name}`, s]));
  const failedInsertNames = new Set((insertFailures ?? []).map((i) => i.source_reference));

  let requirementsForMatch: TenderRequirementForMatch[] = [];
  if (submissionId) {
    const { data } = await supabase
      .from("tender_requirements")
      .select("id, item_number, original_description, quantity")
      .eq("tender_id", tenderId)
      .eq("committed", true)
      .eq("row_type", "item");
    requirementsForMatch = (data ?? []).map((r) => ({
      id: r.id,
      itemNumber: r.item_number,
      originalDescription: r.original_description,
      quantity: r.quantity,
    }));
  }

  let sheetsDone = 0;
  for (const sheet of manifest.sheets) {
    const existing = existingByKey.get(`${sheet.position}:${sheet.sheetName}`);
    if ((existing && existing.validation_status !== "pending") || failedInsertNames.has(sheet.sheetName)) {
      sheetsDone++;
      continue;
    }
    if (Date.now() > params.deadline) continue;

    if (existing) await discardPartialSheet(supabase, existing.id);

    try {
      await processSheet(supabase, { uploadId, tenderId, submissionId, sheet, requirementsForMatch });
    } catch (err) {
      // One sheet's failure must never stall the whole upload: record it and move on.
      await recordSheetFailure(supabase, uploadId, sheet, (err as Error).message);
    }
    sheetsDone++;
  }

  const sheetsTotal = manifest.sheets.length;
  if (sheetsDone < sheetsTotal) return { done: false, sheetsDone, sheetsTotal };

  const summary = await finalizeUpload(supabase, { uploadId, tenderId, submissionId, sheetsTotal });
  return { done: true, sheetsDone, sheetsTotal, summary };
}

/** Marks a sheet failed (creating its row if it never got one) so it counts as finished-with-errors. */
async function recordSheetFailure(supabase: Client, uploadId: string, sheet: SheetManifestEntry, message: string) {
  const { data: row } = await supabase
    .from("workbook_sheets")
    .select("id")
    .eq("upload_id", uploadId)
    .eq("position", sheet.position)
    .eq("sheet_name", sheet.sheetName)
    .maybeSingle();

  if (row) {
    await supabase.from("workbook_sheets").update({ validation_status: "invalid" }).eq("id", row.id);
  }
  await supabase.from("extraction_issues").insert(
    issueRow({
      uploadId,
      sheetId: row?.id,
      issueType: row ? "sheet_processing_failed" : "sheet_manifest_insert_failed",
      severity: "blocking",
      sourceReference: sheet.sheetName,
      originalValue: null,
      proposedInterpretation: null,
      reason: message || "Processing this worksheet failed.",
    })
  );
}

async function processSheet(
  supabase: Client,
  params: {
    uploadId: string;
    tenderId: string;
    submissionId: string | null;
    sheet: SheetManifestEntry;
    requirementsForMatch: TenderRequirementForMatch[];
  }
) {
  const { uploadId, tenderId, submissionId, sheet, requirementsForMatch } = params;

  const { sheetRow, sheetInsertError } = await persistSheetManifest(supabase, uploadId, sheet);
  if (sheetInsertError || !sheetRow) {
    await supabase.from("extraction_issues").insert(
      issueRow({
        uploadId,
        issueType: "sheet_manifest_insert_failed",
        severity: "blocking",
        sourceReference: sheet.sheetName,
        originalValue: null,
        proposedInterpretation: null,
        reason: sheetInsertError?.message || "Failed to record this worksheet's manifest row (no row returned).",
      })
    );
    return;
  }

  if (sheet.processingStatus === "skipped_empty") {
    await supabase.from("workbook_sheets").update({ validation_status: "valid" }).eq("id", sheetRow.id);
    return;
  }

  if (sheet.processingStatus === "failed") {
    await supabase.from("workbook_sheets").update({ validation_status: "invalid" }).eq("id", sheetRow.id);
    await insertIssues(supabase, [
      issueRow({
        uploadId,
        sheetId: sheetRow.id,
        issueType: "sheet_parse_failed",
        severity: "blocking",
        sourceReference: sheet.sheetName,
        originalValue: null,
        proposedInterpretation: null,
        reason: sheet.errors.join("; ") || "Deterministic parsing failed for this sheet.",
      }),
    ]);
    return;
  }

  const interpretation = await interpretSheet(uploadId, sheet);

  const issues: IssueInsert[] = interpretation.chunkErrors.map((chunkError) =>
    issueRow({
      uploadId,
      sheetId: sheetRow.id,
      issueType: "ai_interpretation_incomplete",
      severity: "error",
      sourceReference: `${sheet.sheetName}!rows ${chunkError.rowRange[0]}-${chunkError.rowRange[1]}`,
      originalValue: null,
      proposedInterpretation: null,
      reason: chunkError.error,
    })
  );

  let hadSemanticIssues = false;
  if (submissionId) {
    issues.push(
      ...(await persistBidItems(supabase, {
        uploadId,
        submissionId,
        sheetId: sheetRow.id,
        sheet,
        rows: interpretation.rows,
        requirementsForMatch,
      }))
    );
  } else {
    const sectionIssues = await persistSectionsAndRequirements(
      supabase,
      tenderId,
      sheetRow.id,
      uploadId,
      sheet,
      interpretation.rows
    );
    hadSemanticIssues = sectionIssues.length > 0;
    issues.push(...sectionIssues);
  }

  await insertIssues(supabase, issues);

  // Marking the sheet finished is the very last write: a crash anywhere above
  // leaves it "pending", so the next step discards and redoes just this sheet.
  const validationStatus =
    interpretation.failedChunks > 0 || (!submissionId && hadSemanticIssues) ? "warnings" : "valid";
  await supabase.from("workbook_sheets").update({ validation_status: validationStatus }).eq("id", sheetRow.id);
}

async function persistSectionsAndRequirements(
  supabase: Client,
  tenderId: string,
  sheetId: string,
  uploadId: string,
  sheet: SheetManifestEntry,
  rows: InterpretedRow[]
): Promise<IssueInsert[]> {
  const sectionIdByName = new Map<string, string>();
  const sectionRows: TablesInsert<"tender_sections">[] = [];
  const requirementRows: TablesInsert<"tender_requirements">[] = [];
  const issues: IssueInsert[] = [];
  let sourceOrder = 0;
  let currentSectionName: string | null = null;

  const sorted = [...rows].sort((a, b) => a.row_index - b.row_index);

  for (const row of sorted) {
    if (row.classification === "section") {
      currentSectionName = row.section_name || row.description || `Section @row ${row.row_index}`;
      if (!sectionIdByName.has(currentSectionName)) {
        const id = randomUUID();
        sectionIdByName.set(currentSectionName, id);
        sectionRows.push({
          id,
          tender_id: tenderId,
          sheet_id: sheetId,
          original_section_name: currentSectionName,
          source_order: sourceOrder++,
        });
      }
      continue;
    }
    if (row.classification === "header") continue;

    const mapped = mapInterpretedRow(row, sheet, row.section_name ?? currentSectionName);
    if (!mapped) continue;

    const sectionId = mapped.sectionName ? sectionIdByName.get(mapped.sectionName) ?? null : null;
    const requirementId = randomUUID();
    requirementRows.push({ ...requirementToInsert(tenderId, sheetId, sectionId, uploadId, mapped), id: requirementId });

    const ref = `${sheet.sheetName}!row ${mapped.sourceRow}`;
    const base = { uploadId, sheetId, requirementId, sourceReference: ref };

    // Quantity/rate are only meaningful for priced rows; a note/section/header
    // naturally has neither, so flagging them there would just be noise.
    const expectsPricing = mapped.rowType === "item" || mapped.rowType === "deduction" || mapped.rowType === "adjustment";

    // Stage C (financial) + Stage B (semantic) issues, tied to the persisted requirement.
    if (expectsPricing && mapped.quantityStatus !== "present") {
      issues.push(
        issueRow({
          ...base,
          issueType: "missing_quantity",
          severity: "warning",
          originalValue: null,
          proposedInterpretation: null,
          reason: "Quantity could not be established from the source cell.",
        })
      );
    }
    if (expectsPricing && mapped.rateStatus !== "present") {
      issues.push(
        issueRow({
          ...base,
          issueType: "missing_rate",
          severity: "warning",
          originalValue: null,
          proposedInterpretation: null,
          reason: "Rate could not be established from the source cell.",
        })
      );
    }
    if (mapped.originalDescription === "") {
      const isTotalsRow = mapped.rowType === "subtotal" || mapped.rowType === "grand_total";
      issues.push(
        issueRow({
          ...base,
          issueType: "missing_description",
          severity: isTotalsRow ? "warning" : "error",
          originalValue: null,
          proposedInterpretation: null,
          reason: "No description text was found for this row.",
        })
      );
    }
    if (mapped.calculationDiscrepancy) {
      issues.push(
        issueRow({
          ...base,
          issueType: "formula_mismatch",
          severity: "error",
          originalValue: mapped.amountFormulaCachedResult !== null ? String(mapped.amountFormulaCachedResult) : null,
          proposedInterpretation: mapped.amountRecalculated !== null ? String(mapped.amountRecalculated) : null,
          reason: "Recalculated amount differs from the cached formula result in the source workbook.",
        })
      );
    }
    if (mapped.isAmbiguous) {
      issues.push(
        issueRow({
          ...base,
          issueType: "ambiguous_classification",
          severity: "warning",
          originalValue: mapped.originalDescription || null,
          proposedInterpretation: mapped.rowType,
          reason: mapped.reason || "Row classification confidence was low; needs human confirmation.",
        })
      );
    }
    if (mapped.hasUnresolvedCellRefs) {
      issues.push(
        issueRow({
          ...base,
          issueType: "cell_reference_unresolved",
          severity: "warning",
          originalValue: null,
          proposedInterpretation: null,
          reason:
            "The AI pointed at a cell address for one or more fields that doesn't match a populated cell in the source workbook; the value was left blank rather than trusted.",
        })
      );
    }
  }

  for (const batch of chunkArray(sectionRows, ROW_INSERT_BATCH_SIZE)) {
    const { error } = await supabase.from("tender_sections").insert(batch);
    if (error) throw new Error(`tender_sections: ${error.message}`);
  }
  for (const batch of chunkArray(requirementRows, ROW_INSERT_BATCH_SIZE)) {
    const { error } = await supabase.from("tender_requirements").insert(batch);
    if (error) throw new Error(`tender_requirements: ${error.message}`);
  }

  return issues;
}

async function persistBidItems(
  supabase: Client,
  params: {
    uploadId: string;
    submissionId: string;
    sheetId: string;
    sheet: SheetManifestEntry;
    rows: InterpretedRow[];
    requirementsForMatch: TenderRequirementForMatch[];
  }
): Promise<IssueInsert[]> {
  const { uploadId, submissionId, sheetId, sheet, rows, requirementsForMatch } = params;
  const bidRows: TablesInsert<"contractor_bid_items">[] = [];
  const issues: IssueInsert[] = [];

  for (const row of rows) {
    if (row.classification === "header" || row.classification === "section") continue;

    const mapped = mapInterpretedRow(row, sheet, null);
    if (!mapped) continue;
    // Rows with neither a rate nor an amount aren't priced quotation lines.
    if (mapped.rate === null && mapped.amount === null) continue;

    const bidRow: MatchedBidRow = {
      sourceCellRefs: mapped.sourceCellRefs,
      itemNumber: mapped.itemNumber,
      description: mapped.originalDescription || null,
      quantity: mapped.quantity,
      rate: mapped.rate,
      amount: mapped.amount,
    };
    const match = matchRequirement(bidRow, requirementsForMatch);
    const isDeviation =
      match !== null && mapped.quantity !== null && match.quantity !== null && Math.abs(mapped.quantity - match.quantity) > 0.01;

    bidRows.push({
      submission_id: submissionId,
      upload_id: uploadId,
      requirement_id: match?.id ?? null,
      quoted_quantity: mapped.quantity,
      quoted_rate: mapped.rate,
      quoted_amount: mapped.amount,
      is_excluded: match === null,
      is_deviation: isDeviation,
      deviation_note: isDeviation
        ? `Quoted qty ${mapped.quantity} differs from tender qty ${match?.quantity}`
        : match === null
          ? "No matching tender requirement found for this row."
          : null,
      source_cell_refs: mapped.sourceCellRefs,
      committed: false,
    });

    const ref = `${sheet.sheetName}!row ${row.row_index}`;
    if (match === null) {
      issues.push(
        issueRow({
          uploadId,
          sheetId,
          issueType: "unmatched_bid_item",
          severity: "warning",
          sourceReference: ref,
          originalValue: mapped.originalDescription || mapped.itemNumber,
          proposedInterpretation: null,
          reason: "Could not match this quoted row to a tender requirement by item number or description.",
        })
      );
    }
    if (mapped.hasUnresolvedCellRefs) {
      issues.push(
        issueRow({
          uploadId,
          sheetId,
          requirementId: match?.id,
          issueType: "cell_reference_unresolved",
          severity: "warning",
          sourceReference: ref,
          originalValue: null,
          proposedInterpretation: null,
          reason:
            "The AI pointed at a cell address for one or more fields that doesn't match a populated cell in the source workbook; the value was left blank rather than trusted.",
        })
      );
    }
    if (match !== null && isDeviation) {
      issues.push(
        issueRow({
          uploadId,
          sheetId,
          requirementId: match.id,
          issueType: "quantity_deviation",
          severity: "warning",
          sourceReference: ref,
          originalValue: String(match.quantity),
          proposedInterpretation: mapped.quantity !== null ? String(mapped.quantity) : null,
          reason: "Quoted quantity differs from the tender's requirement quantity.",
        })
      );
    }
  }

  for (const batch of chunkArray(bidRows, ROW_INSERT_BATCH_SIZE)) {
    const { error } = await supabase.from("contractor_bid_items").insert(batch);
    if (error) throw new Error(`contractor_bid_items: ${error.message}`);
  }
  return issues;
}

async function countRows(
  query: PromiseLike<{ count: number | null }>
): Promise<number> {
  return (await query).count ?? 0;
}

/** Every sheet is finished: derive the outcome from what was actually persisted and release the upload for review. */
async function finalizeUpload(
  supabase: Client,
  params: { uploadId: string; tenderId: string; submissionId: string | null; sheetsTotal: number }
): Promise<ProcessingSummary> {
  const { uploadId, tenderId, submissionId, sheetsTotal } = params;
  const head = { count: "exact", head: true } as const;

  const { data: issueRows } = await supabase
    .from("extraction_issues")
    .select("issue_type, sheet_id")
    .eq("upload_id", uploadId);
  const issues = issueRows ?? [];

  const failedSheetKeys = new Set<string>();
  for (const i of issues) {
    if (
      i.issue_type === "sheet_manifest_insert_failed" ||
      i.issue_type === "sheet_parse_failed" ||
      i.issue_type === "sheet_processing_failed" ||
      i.issue_type === "ai_interpretation_incomplete"
    ) {
      failedSheetKeys.add(i.sheet_id ?? `none:${i.issue_type}:${failedSheetKeys.size}`);
    }
  }
  const sheetsFailed = Math.min(failedSheetKeys.size, sheetsTotal);

  const [requirementsCreated, bidItemsCreated, matchedCount] = await Promise.all([
    submissionId ? 0 : countRows(supabase.from("tender_requirements").select("id", head).eq("upload_id", uploadId)),
    submissionId ? countRows(supabase.from("contractor_bid_items").select("id", head).eq("upload_id", uploadId)) : 0,
    submissionId
      ? countRows(
          supabase.from("contractor_bid_items").select("id", head).eq("upload_id", uploadId).not("requirement_id", "is", null)
        )
      : 0,
  ]);

  // Every upload lands in draft, awaiting an explicit "Save to DB" regardless
  // of whether issues were raised — ready_for_review covers both; a failed
  // sheet still surfaces as partially_processed so it's distinguishable.
  const status: UploadStatus = sheetsFailed > 0 ? "partially_processed" : "ready_for_review";

  await supabase.from("tender_uploads").update({ status }).eq("id", uploadId);
  if (submissionId) {
    await supabase.from("contractor_submissions").update({ status: "draft_review" }).eq("id", submissionId);
  } else {
    await supabase.from("tenders").update({ status: "review_required" }).eq("id", tenderId);
  }

  await supabase.from("extraction_jobs").insert({
    upload_id: uploadId,
    stage: "human_review",
    status: sheetsFailed > 0 ? "partially_succeeded" : "succeeded",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    total_chunks: sheetsTotal,
    processed_chunks: sheetsTotal - sheetsFailed,
    failed_chunks: sheetsFailed,
  });

  return {
    status,
    sheetsProcessed: sheetsTotal - sheetsFailed,
    sheetsFailed,
    requirementsCreated,
    bidItemsCreated,
    matchedCount,
    unmatchedCount: bidItemsCreated - matchedCount,
    issuesRaised: issues.length,
  };
}
