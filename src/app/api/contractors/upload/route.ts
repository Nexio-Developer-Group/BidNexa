import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { hashBuffer } from "@/lib/excel/parser";
import {
  ALLOWED_WORKBOOK_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  WORKBOOK_BUCKET,
  looksLikeWorkbook,
  workbookExtension,
} from "@/lib/upload-limits";
import { clearSubmissionBidItems } from "@/lib/validation/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Registers a contractor's already-staged quotation workbook. Parsing, Claude
 * extraction and matching against the tender's committed requirements run as
 * resumable steps (see the process route), which write draft (uncommitted)
 * bid items — nothing is visible in a comparison until reviewed and saved.
 */
export async function POST(request: NextRequest) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  // File is already in Storage (uploaded directly by the browser, see
  // /api/upload/sign) so it never hits the serverless body-size cap.
  const body = await request.json().catch(() => null);
  const { tenderId, contractorId, uploadId, storagePath, filename } = body ?? {};
  const replace = body?.replace === true;

  if (typeof tenderId !== "string" || typeof contractorId !== "string") {
    return NextResponse.json({ error: "tenderId and contractorId are required" }, { status: 400 });
  }
  if (
    typeof uploadId !== "string" ||
    typeof storagePath !== "string" ||
    typeof filename !== "string" ||
    !uploadId ||
    !storagePath ||
    !filename
  ) {
    return NextResponse.json({ error: "uploadId, storagePath and filename are required" }, { status: 400 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("id, organization_id")
    .eq("id", tenderId)
    .single();
  if (!tender) return NextResponse.json({ error: "Tender not found" }, { status: 404 });

  if (!storagePath.startsWith(`${tender.organization_id}/${tenderId}/contractor-${uploadId}/`)) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }

  const discardStaged = () => supabase.storage.from(WORKBOOK_BUCKET).remove([storagePath]);

  const { data: fileBlob, error: downloadError } = await supabase.storage.from(WORKBOOK_BUCKET).download(storagePath);
  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: `Uploaded file not found: ${downloadError?.message}` }, { status: 400 });
  }
  const fileSize = fileBlob.size;

  if (!ALLOWED_WORKBOOK_EXTENSIONS.includes(workbookExtension(filename))) {
    await discardStaged();
    return NextResponse.json({ error: `Unsupported file extension: ${workbookExtension(filename)}` }, { status: 400 });
  }
  if (fileSize === 0 || fileSize > MAX_UPLOAD_BYTES) {
    await discardStaged();
    return NextResponse.json({ error: `File is empty or exceeds the ${MAX_UPLOAD_LABEL} limit` }, { status: 400 });
  }

  const { data: existingSubmission } = await supabase
    .from("contractor_submissions")
    .select("id, upload_id, tender_uploads(storage_path)")
    .eq("tender_id", tenderId)
    .eq("contractor_id", contractorId)
    .maybeSingle();
  if (existingSubmission?.upload_id && !replace) {
    await discardStaged();
    return NextResponse.json(
      {
        error: "A quotation has already been uploaded for this contractor. Re-upload to replace it, or use the chat to ask questions.",
        submissionId: existingSubmission.id,
      },
      { status: 409 }
    );
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const fileHash = hashBuffer(buffer);

  if (!looksLikeWorkbook(buffer)) {
    await discardStaged();
    return NextResponse.json({ error: "This file is not a valid Excel workbook." }, { status: 422 });
  }

  // Replacing an existing quotation: wipe its old bid items, issues, and
  // sheet manifest first so the new upload starts clean instead of layering
  // on top of stale draft/committed rows, and drop the old tender_uploads
  // row itself (contractor_submissions.upload_id is about to move to the
  // new upload; the FK is ON DELETE SET NULL so this is safe) along with
  // its file in storage.
  if (existingSubmission?.upload_id) {
    const oldStoragePath = (existingSubmission.tender_uploads as unknown as { storage_path: string } | null)
      ?.storage_path;
    await clearSubmissionBidItems(supabase, existingSubmission.id, existingSubmission.upload_id);
    if (oldStoragePath) {
      await supabase.storage.from("tender-workbooks").remove([oldStoragePath]);
    }
    await supabase.from("tender_uploads").delete().eq("id", existingSubmission.upload_id);
  }

  const { data: uploadRow, error: uploadError } = await supabase
    .from("tender_uploads")
    .insert({
      id: uploadId,
      tender_id: tenderId,
      original_filename: filename,
      storage_path: storagePath,
      file_hash: fileHash,
      file_size_bytes: fileSize,
      status: "queued",
      uploaded_by: user.userId,
    })
    .select()
    .single();
  if (uploadError || !uploadRow) {
    return NextResponse.json({ error: uploadError?.message ?? "Failed to record upload" }, { status: 500 });
  }

  const { data: submission, error: subError } = await supabase
    .from("contractor_submissions")
    .upsert(
      { tender_id: tenderId, contractor_id: contractorId, upload_id: uploadId, status: "processing", submitted_at: new Date().toISOString() },
      { onConflict: "tender_id,contractor_id" }
    )
    .select()
    .single();
  if (subError || !submission) {
    return NextResponse.json({ error: subError?.message ?? "Failed to record submission" }, { status: 500 });
  }

  return NextResponse.json({ uploadId, submissionId: submission.id });
}
