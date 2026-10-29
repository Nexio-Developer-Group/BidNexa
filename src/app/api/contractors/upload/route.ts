import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { parseWorkbook, hashBuffer } from "@/lib/excel/parser";
import { extractContractorRows, matchRequirement } from "@/lib/validation/bid-matching";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

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

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = hashBuffer(buffer);

  let manifest;
  try {
    manifest = await parseWorkbook(buffer, file.name);
  } catch (err) {
    return NextResponse.json({ error: `Workbook could not be opened: ${(err as Error).message}` }, { status: 422 });
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
      status: "completed_with_warnings",
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

  const { data: requirements } = await supabase
    .from("tender_requirements")
    .select("id, item_number, original_description, quantity")
    .eq("tender_id", tenderId)
    .eq("row_type", "item");

  const reqForMatch = (requirements ?? []).map((r) => ({
    id: r.id,
    itemNumber: r.item_number,
    originalDescription: r.original_description,
    quantity: r.quantity,
  }));

  const bidRows = extractContractorRows(manifest);
  let matchedCount = 0;
  let unmatchedCount = 0;
  let totalQuoted = 0;

  for (const bidRow of bidRows) {
    const match = matchRequirement(bidRow, reqForMatch);
    const isDeviation =
      match !== null &&
      bidRow.quantity !== null &&
      match.quantity !== null &&
      Math.abs(bidRow.quantity - match.quantity) > 0.01;

    if (match) matchedCount++;
    else unmatchedCount++;
    if (bidRow.amount) totalQuoted += bidRow.amount;

    await supabase.from("contractor_bid_items").upsert(
      {
        submission_id: submission.id,
        requirement_id: match?.id ?? null,
        quoted_quantity: bidRow.quantity,
        quoted_rate: bidRow.rate,
        quoted_amount: bidRow.amount,
        is_excluded: match === null,
        is_deviation: isDeviation,
        deviation_note: isDeviation
          ? `Quoted qty ${bidRow.quantity} differs from tender qty ${match?.quantity}`
          : match === null
            ? "No matching tender requirement found for this row."
            : null,
        source_cell_refs: bidRow.sourceCellRefs,
      },
      { onConflict: "submission_id,requirement_id" }
    );
  }

  await supabase
    .from("contractor_submissions")
    .update({ status: "review_required", total_quoted_amount: totalQuoted })
    .eq("id", submission.id);

  return NextResponse.json({
    submissionId: submission.id,
    rowsExtracted: bidRows.length,
    matchedCount,
    unmatchedCount,
    totalQuoted,
  });
}
