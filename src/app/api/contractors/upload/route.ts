import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { parseWorkbook, hashBuffer } from "@/lib/excel/parser";
import { runContractorExtractionPipeline } from "@/lib/validation/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Parses a contractor's quotation workbook through the same deterministic +
 * Claude pipeline used for the tender's own BOQ, matches rows to the tender's
 * committed requirements, and writes draft (uncommitted) bid items. Nothing
 * here is visible in a comparison until it's reviewed and saved.
 */
export async function POST(request: NextRequest) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const formData = await request.formData();
  const tenderId = formData.get("tenderId");
  const contractorId = formData.get("contractorId");
  const file = formData.get("file");

  if (typeof tenderId !== "string" || typeof contractorId !== "string") {
    return NextResponse.json({ error: "tenderId and contractorId are required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is empty or exceeds the 25MB limit" }, { status: 400 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("id, organization_id")
    .eq("id", tenderId)
    .single();
  if (!tender) return NextResponse.json({ error: "Tender not found" }, { status: 404 });

  // Only one quotation is kept per contractor per tender. Once uploaded, use
  // the quotation chat to ask questions or make explicit corrections instead
  // of re-uploading.
  const { data: existingSubmission } = await supabase
    .from("contractor_submissions")
    .select("id, upload_id")
    .eq("tender_id", tenderId)
    .eq("contractor_id", contractorId)
    .maybeSingle();
  if (existingSubmission?.upload_id) {
    return NextResponse.json(
      {
        error: "A quotation has already been uploaded for this contractor. Use the chat to ask questions or request changes.",
        submissionId: existingSubmission.id,
      },
      { status: 409 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = hashBuffer(buffer);

  let manifest;
  try {
    manifest = await parseWorkbook(buffer, file.name);
  } catch (err) {
    return NextResponse.json({ error: `Workbook could not be opened: ${(err as Error).message}` }, { status: 422 });
  }
  if (manifest.sheetCount === 0) {
    return NextResponse.json({ error: "Workbook contains no worksheets." }, { status: 422 });
  }

  const uploadId = randomUUID();
  const storagePath = `${tender.organization_id}/${tenderId}/contractor-${uploadId}/${file.name}`;

  const { error: storageError } = await supabase.storage
    .from("tender-workbooks")
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });
  if (storageError) {
    return NextResponse.json({ error: `Storage upload failed: ${storageError.message}` }, { status: 500 });
  }

  const { data: uploadRow, error: uploadError } = await supabase
    .from("tender_uploads")
    .insert({
      id: uploadId,
      tender_id: tenderId,
      original_filename: file.name,
      storage_path: storagePath,
      file_hash: fileHash,
      file_size_bytes: file.size,
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

  const result = await runContractorExtractionPipeline(supabase, {
    uploadId,
    tenderId,
    submissionId: submission.id,
    manifest,
  });

  return NextResponse.json({
    uploadId,
    submissionId: submission.id,
    ...result,
  });
}
