import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import {
  ALLOWED_WORKBOOK_EXTENSIONS,
  ALLOWED_WORKBOOK_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  WORKBOOK_BUCKET,
  safeStorageName,
  workbookExtension,
} from "@/lib/upload-limits";

export const runtime = "nodejs";

/**
 * Issues a signed Storage upload URL so the browser can send the workbook
 * directly to Supabase, bypassing the serverless request-body size cap.
 */
export async function POST(request: NextRequest) {
  await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const body = await request.json().catch(() => null);
  const { tenderId, kind, filename, size, mimeType } = body ?? {};

  if (typeof tenderId !== "string" || !tenderId || typeof filename !== "string" || !filename) {
    return NextResponse.json({ error: "tenderId and filename are required" }, { status: 400 });
  }
  if (!ALLOWED_WORKBOOK_EXTENSIONS.includes(workbookExtension(filename))) {
    return NextResponse.json({ error: `Unsupported file extension: ${workbookExtension(filename)}` }, { status: 400 });
  }
  if (typeof size !== "number" || size <= 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File exceeds the ${MAX_UPLOAD_LABEL} limit` }, { status: 400 });
  }
  if (typeof mimeType === "string" && mimeType && !ALLOWED_WORKBOOK_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: `Unsupported MIME type: ${mimeType}` }, { status: 400 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("id, organization_id")
    .eq("id", tenderId)
    .single();
  if (!tender) return NextResponse.json({ error: "Tender not found or not accessible" }, { status: 404 });

  const uploadId = randomUUID();
  const folder = kind === "contractor" ? `contractor-${uploadId}` : uploadId;
  const storagePath = `${tender.organization_id}/${tenderId}/${folder}/${safeStorageName(filename)}`;

  const { data, error } = await supabase.storage.from(WORKBOOK_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) {
    return NextResponse.json({ error: `Could not create upload URL: ${error?.message}` }, { status: 500 });
  }

  return NextResponse.json({ uploadId, storagePath, token: data.token });
}
