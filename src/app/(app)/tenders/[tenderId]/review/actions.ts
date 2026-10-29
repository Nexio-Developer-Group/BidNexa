"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import type { Enums, Json, TablesUpdate } from "@/lib/types/database";

export async function setIssueReviewStatus(
  tenderId: string,
  issueId: string,
  status: Enums<"issue_review_status">
) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("extraction_issues")
    .update({ review_status: status, reviewed_by: user.userId, reviewed_at: new Date().toISOString() })
    .eq("id", issueId);

  if (error) return { error: error.message };

  revalidatePath(`/tenders/${tenderId}/review`);
  revalidatePath(`/tenders/${tenderId}`);
  return { ok: true };
}

export async function correctRequirementField(
  tenderId: string,
  requirementId: string,
  field: "original_description" | "unit" | "quantity" | "rate" | "amount" | "item_number",
  value: string
) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { data: before } = await supabase
    .from("tender_requirements")
    .select("*")
    .eq("id", requirementId)
    .single();

  const isNumericField = field === "quantity" || field === "rate" || field === "amount";
  const parsedValue = isNumericField ? (value.trim() === "" ? null : Number(value)) : value;

  if (isNumericField && parsedValue !== null && isNaN(parsedValue as number)) {
    return { error: "Value must be numeric." };
  }

  const statusField = `${field}_status` as "quantity_status" | "rate_status" | "amount_status";
  const update: Record<string, unknown> = { [field]: parsedValue };
  if (isNumericField) {
    update[statusField] = parsedValue === null ? "missing" : "present";
  }

  const { error } = await supabase
    .from("tender_requirements")
    .update(update as unknown as TablesUpdate<"tender_requirements">)
    .eq("id", requirementId);
  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    organization_id: user.organizationId,
    user_id: user.userId,
    action: "requirement.manual_correction",
    entity_type: "tender_requirement",
    entity_id: requirementId,
    before_data: before as unknown as Json,
    after_data: update as unknown as Json,
  });

  revalidatePath(`/tenders/${tenderId}/boq`);
  revalidatePath(`/tenders/${tenderId}/review`);
  revalidatePath(`/tenders/${tenderId}`);
  return { ok: true };
}

/**
 * The "Save to DB" button: commits every draft requirement from this specific
 * upload into the real BOQ. Blocked while a blocking issue is still open on
 * that upload — everything else (warnings/errors) can be saved with known
 * issues still flagged for later follow-up.
 */
export async function saveRequirementsToDb(tenderId: string, uploadId: string) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { data: openIssues } = await supabase
    .from("extraction_issues")
    .select("id, severity")
    .eq("upload_id", uploadId)
    .eq("review_status", "open");

  const blocking = (openIssues ?? []).filter((i) => i.severity === "blocking");
  if (blocking.length > 0) {
    return { error: `${blocking.length} blocking issue(s) must be resolved before saving.` };
  }

  const { data: committedRows, error } = await supabase
    .from("tender_requirements")
    .update({ committed: true, approved: true, approved_by: user.userId, approved_at: new Date().toISOString() })
    .eq("tender_id", tenderId)
    .eq("upload_id", uploadId)
    .eq("committed", false)
    .select("id");

  if (error) return { error: error.message };

  await supabase.from("tenders").update({ status: "active" }).eq("id", tenderId);
  await supabase.from("tender_uploads").update({ status: "approved" }).eq("id", uploadId);

  await supabase.from("audit_logs").insert({
    organization_id: user.organizationId,
    user_id: user.userId,
    action: "requirements.saved_to_db",
    entity_type: "tender_upload",
    entity_id: uploadId,
    after_data: { committedCount: committedRows?.length ?? 0 } as unknown as Json,
  });

  revalidatePath(`/tenders/${tenderId}`);
  revalidatePath(`/tenders/${tenderId}/boq`);
  revalidatePath(`/tenders/${tenderId}/review`);
  return { ok: true, committedCount: committedRows?.length ?? 0 };
}
