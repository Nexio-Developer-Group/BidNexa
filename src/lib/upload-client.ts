import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, WORKBOOK_BUCKET } from "@/lib/upload-limits";

export interface StagedUpload {
  uploadId: string;
  storagePath: string;
}

/**
 * Uploads the file straight to Supabase Storage via a server-issued signed
 * URL. Request bodies to serverless functions are capped (~4.5MB on Vercel),
 * so the file never passes through our API routes — they only receive the
 * storage path and read the file back from the bucket.
 */
export async function stageWorkbookUpload(
  file: File,
  opts: { tenderId: string; kind: "tender" | "contractor" }
): Promise<StagedUpload> {
  if (file.size === 0) throw new Error("File is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File exceeds the ${MAX_UPLOAD_LABEL} limit`);

  const res = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenderId: opts.tenderId, kind: opts.kind, filename: file.name, size: file.size, mimeType: file.type }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Could not start upload");

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(WORKBOOK_BUCKET)
    .uploadToSignedUrl(json.storagePath, json.token, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return { uploadId: json.uploadId, storagePath: json.storagePath };
}
