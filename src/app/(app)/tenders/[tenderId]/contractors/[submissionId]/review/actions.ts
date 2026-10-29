"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import type { Json, TablesUpdate } from "@/lib/types/database";

export async function correctBidItemField(
  tenderId: string,
  bidItemId: string,
  field: "quoted_quantity" | "quoted_rate" | "quoted_amount",
  value: string
) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const parsedValue = value.trim() === "" ? null : Number(value);
  if (parsedValue !== null && isNaN(parsedValue)) {
    return { error: "Value must be numeric." };
  }

  const { data: before } = await supabase.from("contractor_bid_items").select("*").eq("id", bidItemId).single();

  const { error } = await supabase
    .from("contractor_bid_items")
    .update({ [field]: parsedValue } as unknown as TablesUpdate<"contractor_bid_items">)
    .eq("id", bidItemId);
  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: user.organizationId,
    user_id: user.userId,
    action: "bid_item.manual_correction",
    entity_type: "contractor_bid_item",
    entity_id: bidItemId,
    before_data: before as unknown as Json,
    after_data: { [field]: parsedValue } as unknown as Json,
  });

  revalidatePath(`/tenders/${tenderId}`);
  return { ok: true };
}

/** The contractor-side "Save to DB" button: commits every draft bid item for this upload. */
export async function saveBidItemsToDb(tenderId: string, submissionId: string, uploadId: string) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { data: openBlocking } = await supabase
    .from("extraction_issues")
    .select("id")
    .eq("upload_id", uploadId)
    .eq("severity", "blocking")
    .eq("review_status", "open");

  if ((openBlocking ?? []).length > 0) {
    return { error: `${openBlocking!.length} blocking issue(s) must be resolved before saving.` };
  }

  const { data: committedRows, error } = await supabase
    .from("contractor_bid_items")
    .update({ committed: true })
    .eq("submission_id", submissionId)
    .eq("upload_id", uploadId)
    .eq("committed", false)
    .select("quoted_amount");

  if (error) return { error: error.message };

  const total = (committedRows ?? []).reduce((sum, r) => sum + (r.quoted_amount ? Number(r.quoted_amount) : 0), 0);

  await supabase
    .from("contractor_submissions")
    .update({ status: "approved", total_quoted_amount: total })
    .eq("id", submissionId);
  await supabase.from("tender_uploads").update({ status: "approved" }).eq("id", uploadId);

  await supabase.from("audit_logs").insert({
    organization_id: user.organizationId,
    user_id: user.userId,
    action: "bid_items.saved_to_db",
    entity_type: "contractor_submission",
    entity_id: submissionId,
    after_data: { committedCount: committedRows?.length ?? 0, total } as unknown as Json,
  });

  revalidatePath(`/tenders/${tenderId}`);
  revalidatePath(`/contractors`);
  revalidatePath(`/comparisons`);
  return { ok: true, committedCount: committedRows?.length ?? 0 };
}
