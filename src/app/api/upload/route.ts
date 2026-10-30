import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { parseWorkbook, hashBuffer } from "@/lib/excel/parser";
import { runExtractionPipeline, clearUploadExtractionData } from "@/lib/validation/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // some browsers send this for .xlsx
];

export async function POST(request: NextRequest) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const formData = await request.formData();
  const tenderId = formData.get("tenderId");
  const file = formData.get("file");
  const replace = formData.get("replace") === "true";

  if (typeof tenderId !== "string" || !tenderId) {
    return NextResponse.json({ error: "tenderId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const { data: tender, error: tenderError } = await supabase
    .from("tenders")
    .select("id, organization_id")
    .eq("id", tenderId)
    .single();

  if (tenderError || !tender) {
    return NextResponse.json({ error: "Tender not found or not accessible" }, { status: 404 });
  }

  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: `Unsupported file extension: ${ext}` }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 25MB limit" }, { status: 400 });
  }
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported MIME type: ${file.type}` }, { status: 400 });
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

  let existingQuery = supabase.from("tender_uploads").select("id, status").eq("tender_id", tenderId);
  if (contractorUploadIds.length > 0) {
    existingQuery = existingQuery.not("id", "in", `(${contractorUploadIds.join(",")})`);
  }
  const { data: anyExisting } = await existingQuery.limit(1).maybeSingle();

  if (anyExisting && !replace) {
    return NextResponse.json(
      {
        error: "A BOQ workbook has already been uploaded for this tender. Replace it to upload a different file, or use reprocess to retry extraction on the existing one.",
        uploadId: anyExisting.id,
        status: anyExisting.status,
      },
      { status: 409 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileHash = hashBuffer(buffer);

  let manifest;
  try {
    manifest = await parseWorkbook(buffer, file.name);
  } catch (err) {
    return NextResponse.json(
      { error: `Workbook could not be opened: ${(err as Error).message}` },
      { status: 422 }
    );
  }

  if (manifest.sheetCount === 0) {
    return NextResponse.json({ error: "Workbook contains no worksheets." }, { status: 422 });
  }

  // Replacing: wipe the old upload's extracted data (requirements, sections,
  // issues, sheet manifest — committed or not) and the tender_uploads row
  // itself before the new one is inserted, so the new file starts clean.
  if (anyExisting) {
    await clearUploadExtractionData(supabase, anyExisting.id);
    await supabase.from("tender_uploads").delete().eq("id", anyExisting.id);
  }

  const uploadId = randomUUID();
  const storagePath = `${tender.organization_id}/${tenderId}/${uploadId}/${file.name}`;

  const { error: storageError } = await supabase.storage
    .from("tender-workbooks")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json({ error: `Storage upload failed: ${storageError.message}` }, { status: 500 });
  }

  const { data: uploadRow, error: uploadInsertError } = await supabase
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
