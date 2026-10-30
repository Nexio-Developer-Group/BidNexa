import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { parseWorkbook } from "@/lib/excel/parser";
import {
  runProcessingStep,
  clearUploadExtractionData,
  clearSubmissionBidItems,
} from "@/lib/validation/pipeline";
import { WORKBOOK_BUCKET } from "@/lib/upload-limits";

export const runtime = "nodejs";
export const maxDuration = 300;

// A step stops starting new sheets after this long, leaving headroom under
// maxDuration for the sheet in flight; the client simply calls again.
const STEP_BUDGET_MS = 150_000;
// If a step dies mid-way its lease expires on its own and the next call takes over.
const LEASE_MS = (maxDuration + 20) * 1000;

/**
 * Resumable extraction. Each call processes as many worksheets as fit in the
 * step budget and reports progress; the client keeps calling until `done`.
 * Progress lives in the database, so a timeout, crash or closed tab never
 * loses work — calling again (or "Reprocess") continues where it stopped.
 *
 * `{ reset: true }` discards prior extraction output and starts over.
 *
 * tender_uploads is shared by both the tender's own BOQ and every
 * contractor's quotation upload (same tender_id); the matching pipeline is
 * chosen via contractor_submissions.upload_id.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/tenders/[tenderId]/uploads/[uploadId]/process">
) {
  const { tenderId, uploadId } = await params;
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const body = await request.json().catch(() => null);
  const reset = body?.reset === true;

  const { data: upload, error: uploadError } = await supabase
    .from("tender_uploads")
    .select("id, tender_id, original_filename, storage_path, status, processing_lease_until")
    .eq("id", uploadId)
    .single();

  if (uploadError || !upload || upload.tender_id !== tenderId) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  if (upload.status === "approved") {
    return NextResponse.json(
      { error: "This upload has already been saved and can't be reprocessed — it would wipe saved data." },
      { status: 409 }
    );
  }

  const { data: submission } = await supabase
    .from("contractor_submissions")
    .select("id")
    .eq("upload_id", uploadId)
    .maybeSingle();
  const submissionId = submission?.id ?? null;

  // Already finished and nobody asked to redo it: report instead of re-running.
  const FINISHED = ["ready_for_review", "partially_processed", "completed_with_warnings"];
  if (!reset && FINISHED.includes(upload.status)) {
    return NextResponse.json({ done: true, finished: true, status: upload.status });
  }

  // Claim the upload. The conditional update is atomic, so concurrent callers
  // (double click, two tabs, auto-resume) can't process the same upload twice.
  const now = new Date();
  const { data: claimed } = await supabase
    .from("tender_uploads")
    .update({
      processing_lease_until: new Date(now.getTime() + LEASE_MS).toISOString(),
      status: "parsing",
    })
    .eq("id", uploadId)
    .or(`processing_lease_until.is.null,processing_lease_until.lt.${now.toISOString()}`)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json({ done: false, busy: true });
  }

  const releaseLease = () =>
    supabase.from("tender_uploads").update({ processing_lease_until: null }).eq("id", uploadId);
  const failUpload = async () => {
    await supabase.from("tender_uploads").update({ status: "failed", processing_lease_until: null }).eq("id", uploadId);
    if (!submissionId) await supabase.from("tenders").update({ status: "draft" }).eq("id", tenderId);
  };

  try {
    if (reset) {
      if (submissionId) await clearSubmissionBidItems(supabase, submissionId, uploadId);
      else await clearUploadExtractionData(supabase, uploadId);
      await supabase.from("audit_logs").insert({
        organization_id: user.organizationId,
        user_id: user.userId,
        action: "upload.reprocessed",
        entity_type: submissionId ? "contractor_submission" : "tender_upload",
        entity_id: submissionId ?? uploadId,
      });
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(WORKBOOK_BUCKET)
      .download(upload.storage_path);
    if (downloadError || !fileBlob) {
      await releaseLease();
      return NextResponse.json(
        { error: `Could not re-read the stored file: ${downloadError?.message ?? "unknown error"}` },
        { status: 500 }
      );
    }

    let manifest;
    try {
      manifest = await parseWorkbook(Buffer.from(await fileBlob.arrayBuffer()), upload.original_filename);
    } catch (err) {
      await failUpload();
      return NextResponse.json({ error: `Workbook could not be parsed: ${(err as Error).message}` }, { status: 422 });
    }
    if (manifest.sheetCount === 0) {
      await failUpload();
      return NextResponse.json({ error: "Workbook contains no worksheets." }, { status: 422 });
    }

    const result = await runProcessingStep(supabase, {
      uploadId,
      tenderId,
      submissionId,
      manifest,
      deadline: now.getTime() + STEP_BUDGET_MS,
    });

    await releaseLease();
    return NextResponse.json({ ok: true, submissionId, ...result });
  } catch (err) {
    // Unexpected failure: free the lease so an immediate retry can resume.
    await releaseLease();
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
