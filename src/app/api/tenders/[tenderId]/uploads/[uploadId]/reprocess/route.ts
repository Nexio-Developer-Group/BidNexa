import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { parseWorkbook } from "@/lib/excel/parser";
import { runExtractionPipeline, clearUploadExtractionData } from "@/lib/validation/pipeline";
import type { Json } from "@/lib/types/database";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Re-runs the extraction pipeline for an upload that's stuck or failed,
 * reusing the workbook already in storage (no re-upload needed). Clears
 * whatever that attempt partially produced first, so reprocessing is clean
 * rather than additive.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/tenders/[tenderId]/uploads/[uploadId]/reprocess">
) {
  const { tenderId, uploadId } = await params;
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { data: upload, error: uploadError } = await supabase
    .from("tender_uploads")
    .select("id, tender_id, original_filename, storage_path, status")
    .eq("id", uploadId)
    .single();

  if (uploadError || !upload || upload.tender_id !== tenderId) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }
  if (upload.status === "approved") {
    return NextResponse.json(
      { error: "This upload has already been saved to the BOQ and can't be reprocessed — it would wipe saved data." },
      { status: 409 }
    );
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("tender-workbooks")
    .download(upload.storage_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { error: `Could not re-read the stored file: ${downloadError?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  let manifest;
  try {
    manifest = await parseWorkbook(buffer, upload.original_filename);
  } catch (err) {
    return NextResponse.json(
      { error: `Workbook could not be re-parsed: ${(err as Error).message}` },
      { status: 422 }
    );
  }

  await supabase.from("tender_uploads").update({ status: "queued" }).eq("id", uploadId);
  await clearUploadExtractionData(supabase, uploadId);

  const result = await runExtractionPipeline(supabase, { uploadId, tenderId, manifest });

  await supabase.from("audit_logs").insert({
    organization_id: user.organizationId,
    user_id: user.userId,
    action: "upload.reprocessed",
    entity_type: "tender_upload",
    entity_id: uploadId,
    after_data: result as unknown as Json,
  });

  return NextResponse.json({ ok: true, ...result });
}
