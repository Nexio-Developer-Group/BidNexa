import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/lib/types/database";
import type { WorkbookManifest, SheetManifestEntry } from "@/lib/excel/types";
import { interpretSheet } from "@/lib/groq/interpret";
import { mapInterpretedRow, requirementToInsert } from "./mapping";
import type { InterpretedRow } from "@/lib/groq/schema";

type Client = SupabaseClient<Database>;

const CELL_INSERT_BATCH_SIZE = 500;

export interface PipelineResult {
  status: Database["public"]["Enums"]["upload_status"];
  sheetsProcessed: number;
  sheetsFailed: number;
  requirementsCreated: number;
  issuesRaised: number;
}

/**
 * Runs the full extraction pipeline for an already-uploaded workbook:
 * manifest persistence -> AI interpretation per sheet -> structural/semantic/
 * financial validation -> canonical persistence. Every stage records its own
 * outcome so a partial failure is visible rather than silently swallowed.
 */
export async function runExtractionPipeline(
  supabase: Client,
  params: { uploadId: string; tenderId: string; manifest: WorkbookManifest }
): Promise<PipelineResult> {
  const { uploadId, tenderId, manifest } = params;

  const { data: job } = await supabase
    .from("extraction_jobs")
    .insert({ upload_id: uploadId, stage: "manifest", status: "running", started_at: new Date().toISOString() })
    .select()
    .single();

  await supabase.from("tender_uploads").update({ status: "parsing" }).eq("id", uploadId);

  let totalIssues = 0;
  let totalRequirements = 0;
  let sheetsFailed = 0;

  for (const sheet of manifest.sheets) {
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

    if (sheetInsertError || !sheetRow) {
      sheetsFailed++;
      continue;
    }

    await persistSourceCells(supabase, sheetRow.id, sheet);

    if (sheet.processingStatus === "skipped_empty") {
      await supabase
        .from("workbook_sheets")
        .update({ validation_status: "valid" })
        .eq("id", sheetRow.id);
      continue;
    }

    if (sheet.processingStatus === "failed") {
      sheetsFailed++;
      await supabase.from("workbook_sheets").update({ validation_status: "invalid" }).eq("id", sheetRow.id);
      await raiseIssue(supabase, {
        uploadId,
        sheetId: sheetRow.id,
        issueType: "sheet_parse_failed",
        severity: "blocking",
        sourceReference: sheet.sheetName,
        originalValue: null,
        proposedInterpretation: null,
        reason: sheet.errors.join("; ") || "Deterministic parsing failed for this sheet.",
      });
      continue;
    }

    // --- AI interpretation ---
    const interpretation = await interpretSheet(uploadId, sheet);

    for (const chunkError of interpretation.chunkErrors) {
      totalIssues++;
      await raiseIssue(supabase, {
        uploadId,
        sheetId: sheetRow.id,
        issueType: "ai_interpretation_incomplete",
        severity: "error",
        sourceReference: `${sheet.sheetName}!rows ${chunkError.rowRange[0]}-${chunkError.rowRange[1]}`,
        originalValue: null,
        proposedInterpretation: null,
        reason: chunkError.error,
      });
    }

    // --- Build sections + requirements from interpreted rows (Stage B) ---
    const { requirementsCreated, issuesRaised } = await persistSectionsAndRequirements(
      supabase,
      tenderId,
      sheetRow.id,
      uploadId,
      sheet,
      interpretation.rows
    );
    totalRequirements += requirementsCreated;
    totalIssues += issuesRaised;

    const sheetValidationStatus =
      interpretation.failedChunks > 0 || issuesRaised > 0 ? "warnings" : "valid";
    await supabase
      .from("workbook_sheets")
      .update({ validation_status: sheetValidationStatus })
      .eq("id", sheetRow.id);

    if (interpretation.failedChunks > 0) sheetsFailed++;
  }

  const finalStatus: Database["public"]["Enums"]["upload_status"] =
    sheetsFailed > 0
      ? "partially_processed"
      : totalIssues > 0
        ? "ready_for_review"
        : "completed_with_warnings"; // still requires human approval before "approved"

  await supabase.from("tender_uploads").update({ status: finalStatus }).eq("id", uploadId);
  await supabase.from("tenders").update({ status: "review_required" }).eq("id", tenderId);

  if (job) {
    await supabase
      .from("extraction_jobs")
      .update({
        stage: "human_review",
        status: sheetsFailed > 0 ? "partially_succeeded" : "succeeded",
        finished_at: new Date().toISOString(),
        total_chunks: manifest.sheets.length,
        processed_chunks: manifest.sheets.length - sheetsFailed,
        failed_chunks: sheetsFailed,
      })
      .eq("id", job.id);
  }

  return {
    status: finalStatus,
    sheetsProcessed: manifest.sheets.length - sheetsFailed,
    sheetsFailed,
    requirementsCreated: totalRequirements,
    issuesRaised: totalIssues,
  };
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

  for (let i = 0; i < rows.length; i += CELL_INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + CELL_INSERT_BATCH_SIZE);
    // Idempotent: unique(sheet_id, cell_address) means a retried batch after
    // a partial failure just no-ops on already-inserted cells.
    await supabase.from("source_cells").upsert(batch, { onConflict: "sheet_id,cell_address", ignoreDuplicates: true });
  }
}

async function persistSectionsAndRequirements(
  supabase: Client,
  tenderId: string,
  sheetId: string,
  uploadId: string,
  sheet: SheetManifestEntry,
  rows: InterpretedRow[]
): Promise<{ requirementsCreated: number; issuesRaised: number }> {
  const sectionIdByName = new Map<string, string>();
  let sourceOrder = 0;
  let currentSectionName: string | null = null;
  let requirementsCreated = 0;
  let issuesRaised = 0;

  const sorted = [...rows].sort((a, b) => a.row_index - b.row_index);

  for (const row of sorted) {
    if (row.classification === "section") {
      currentSectionName = row.section_name || row.description || `Section @row ${row.row_index}`;
      if (!sectionIdByName.has(currentSectionName)) {
        const { data } = await supabase
          .from("tender_sections")
          .insert({
            tender_id: tenderId,
            sheet_id: sheetId,
            original_section_name: currentSectionName,
            source_order: sourceOrder++,
          })
          .select()
          .single();
        if (data) sectionIdByName.set(currentSectionName, data.id);
      }
      continue;
    }
    if (row.classification === "header") continue;

    const mapped = mapInterpretedRow(row, sheet, row.section_name ?? currentSectionName);
    if (!mapped) continue;

    const sectionId = mapped.sectionName ? sectionIdByName.get(mapped.sectionName) ?? null : null;
    const insertPayload = requirementToInsert(tenderId, sheetId, sectionId, mapped);

    const { data: reqRow } = await supabase
      .from("tender_requirements")
      .insert(insertPayload)
      .select()
      .single();

    if (!reqRow) continue;
    requirementsCreated++;

    // Quantity/rate are only meaningful for priced rows; a note/section/header
    // naturally has neither, so flagging them there would just be noise.
    const expectsPricing = mapped.rowType === "item" || mapped.rowType === "deduction" || mapped.rowType === "adjustment";

    // Stage C (financial) + Stage B (semantic) issues, tied to the persisted requirement.
    if (expectsPricing && mapped.quantityStatus !== "present") {
      issuesRaised++;
      await raiseIssue(supabase, {
        uploadId,
        sheetId,
        requirementId: reqRow.id,
        issueType: "missing_quantity",
        severity: "warning",
        sourceReference: `${sheet.sheetName}!row ${mapped.sourceRow}`,
        originalValue: null,
        proposedInterpretation: null,
        reason: "Quantity could not be established from the source cell.",
      });
    }
    if (expectsPricing && mapped.rateStatus !== "present") {
      issuesRaised++;
      await raiseIssue(supabase, {
        uploadId,
        sheetId,
        requirementId: reqRow.id,
        issueType: "missing_rate",
        severity: "warning",
        sourceReference: `${sheet.sheetName}!row ${mapped.sourceRow}`,
        originalValue: null,
        proposedInterpretation: null,
        reason: "Rate could not be established from the source cell.",
      });
    }
    if (mapped.originalDescription === "") {
      issuesRaised++;
      const isTotalsRow = mapped.rowType === "subtotal" || mapped.rowType === "grand_total";
      await raiseIssue(supabase, {
        uploadId,
        sheetId,
        requirementId: reqRow.id,
        issueType: "missing_description",
        severity: isTotalsRow ? "warning" : "error",
        sourceReference: `${sheet.sheetName}!row ${mapped.sourceRow}`,
        originalValue: null,
        proposedInterpretation: null,
        reason: "No description text was found for this row.",
      });
    }
    if (mapped.calculationDiscrepancy) {
      issuesRaised++;
      await raiseIssue(supabase, {
        uploadId,
        sheetId,
        requirementId: reqRow.id,
        issueType: "formula_mismatch",
        severity: "error",
        sourceReference: `${sheet.sheetName}!row ${mapped.sourceRow}`,
        originalValue: mapped.amountFormulaCachedResult !== null ? String(mapped.amountFormulaCachedResult) : null,
        proposedInterpretation: mapped.amountRecalculated !== null ? String(mapped.amountRecalculated) : null,
        reason: "Recalculated amount differs from the cached formula result in the source workbook.",
      });
    }
    if (mapped.isAmbiguous) {
      issuesRaised++;
      await raiseIssue(supabase, {
        uploadId,
        sheetId,
        requirementId: reqRow.id,
        issueType: "ambiguous_classification",
        severity: "warning",
        sourceReference: `${sheet.sheetName}!row ${mapped.sourceRow}`,
        originalValue: mapped.originalDescription || null,
        proposedInterpretation: mapped.rowType,
        reason: mapped.reason || "Row classification confidence was low; needs human confirmation.",
      });
    }
  }

  return { requirementsCreated, issuesRaised };
}

async function raiseIssue(
  supabase: Client,
  params: {
    uploadId: string;
    sheetId?: string;
    requirementId?: string;
    issueType: string;
    severity: Database["public"]["Enums"]["issue_severity"];
    sourceReference: string | null;
    originalValue: string | null;
    proposedInterpretation: string | null;
    reason: string | null;
  }
) {
  await supabase.from("extraction_issues").insert({
    upload_id: params.uploadId,
    sheet_id: params.sheetId ?? null,
    requirement_id: params.requirementId ?? null,
    issue_type: params.issueType,
    severity: params.severity,
    source_reference: params.sourceReference,
    original_value: params.originalValue,
    proposed_interpretation: params.proposedInterpretation,
    reason: params.reason,
  });
}
