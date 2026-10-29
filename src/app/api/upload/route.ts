import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { parseWorkbook, hashBuffer } from "@/lib/excel/parser";
import { runExtractionPipeline } from "@/lib/validation/pipeline";

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

  // Only one BOQ workbook per tender. A stuck/failed upload is retried via
  // the reprocess endpoint (reuses the stored file), not by uploading again.
  const { data: anyExisting } = await supabase
    .from("tender_uploads")
    .select("id, status")
    .eq("tender_id", tenderId)
    .limit(1)
    .maybeSingle();

  if (anyExisting) {
    return NextResponse.json(
      {
        error: "A BOQ workbook has already been uploaded for this tender. Only one BOQ per tender is allowed — use reprocess to retry extraction on the existing upload.",
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
