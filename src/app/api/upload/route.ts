import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { parseWorkbook, hashBuffer } from "@/lib/excel/parser";
import {
  ALLOWED_WORKBOOK_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  WORKBOOK_BUCKET,
  workbookExtension,
} from "@/lib/upload-limits";
import { runExtractionPipeline, clearUploadExtractionData } from "@/lib/validation/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;


export async function POST(request: NextRequest) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  // The browser uploads the file straight to Storage (see /api/upload/sign) so
  // it never hits the serverless body-size cap; this route gets its location.
  const body = await request.json().catch(() => null);
  const { tenderId, uploadId, storagePath, filename } = body ?? {};
  const replace = body?.replace === true;

  if (typeof tenderId !== "string" || !tenderId) {
    return NextResponse.json({ error: "tenderId is required" }, { status: 400 });
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

  const { data: tender, error: tenderError } = await supabase
    .from("tenders")
    .select("id, organization_id")
    .eq("id", tenderId)
    .single();

  if (tenderError || !tender) {
    return NextResponse.json({ error: "Tender not found or not accessible" }, { status: 404 });
  }

  if (!storagePath.startsWith(`${tender.organization_id}/${tenderId}/${uploadId}/`)) {
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
  if (fileSize === 0) {
    await discardStaged();
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    await discardStaged();
    return NextResponse.json({ error: `File exceeds the ${MAX_UPLOAD_LABEL} limit` }, { status: 400 });
  }

  // Only one BOQ workbook per tender. A stuck/failed upload can be retried
  // via reprocess (reuses the stored file) or, if the file itself is the
  // problem (e.g. it fails to parse every time), explicitly replaced — the
  // dedicated "Replace BOQ" flow always sends replace=true; a plain upload
  // call without it is rejected so nothing is overwritten by accident.
  // Contractor quotation uploads share this same table (same tender_id) but
  // aren't the tender's own BOQ, so they're excluded from this check.
  const { data: contractorUploadRows } = await supabase
    .from("contractor_submissions")
    .select("upload_id")
    .eq("tender_id", tenderId)
    .not("upload_id", "is", null);
  const contractorUploadIds = (contractorUploadRows ?? [])
    .map((r) => r.upload_id)
    .filter((id): id is string => id !== null);

  let existingQuery = supabase.from("tender_uploads").select("id, status, storage_path").eq("tender_id", tenderId);
  if (contractorUploadIds.length > 0) {
    existingQuery = existingQuery.not("id", "in", `(${contractorUploadIds.join(",")})`);
  }
  const { data: anyExisting } = await existingQuery.limit(1).maybeSingle();

  if (anyExisting && !replace) {
    await discardStaged();
    return NextResponse.json(
      {
        error: "A BOQ workbook has already been uploaded for this tender. Replace it to upload a different file, or use reprocess to retry extraction on the existing one.",
        uploadId: anyExisting.id,
        status: anyExisting.status,
      },
      { status: 409 }
    );
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileHash = hashBuffer(buffer);

  let manifest;
  try {
    manifest = await parseWorkbook(buffer, filename);
  } catch (err) {
    await discardStaged();
    return NextResponse.json(
      { error: `Workbook could not be opened: ${(err as Error).message}` },
      { status: 422 }
    );
  }

  if (manifest.sheetCount === 0) {
    await discardStaged();
    return NextResponse.json({ error: "Workbook contains no worksheets." }, { status: 422 });
  }

  // Replacing: wipe the old upload's extracted data (requirements, sections,
  // issues, sheet manifest — committed or not), its file in storage, and the
  // tender_uploads row itself before the new one is inserted, so the new
  // file starts clean.
  if (anyExisting) {
    await clearUploadExtractionData(supabase, anyExisting.id);
    if (anyExisting.storage_path) {
      await supabase.storage.from("tender-workbooks").remove([anyExisting.storage_path]);
    }
    await supabase.from("tender_uploads").delete().eq("id", anyExisting.id);
  }

  const { data: uploadRow, error: uploadInsertError } = await supabase
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

  if (uploadInsertError || !uploadRow) {
    return NextResponse.json(
      { error: `Failed to record upload: ${uploadInsertError?.message}` },
      { status: 500 }
    );
  }

  await supabase.from("tenders").update({ status: "processing" }).eq("id", tenderId);

  const result = await runExtractionPipeline(supabase, { uploadId, tenderId, manifest });

  return NextResponse.json({
    uploadId,
    manifestSheetCount: manifest.sheetCount,
    ...result,
  });
}
