"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";

export async function createContractor(input: { name: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null }) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  if (!input.name.trim()) return { error: "Contractor name is required." };

  const { data, error } = await supabase
    .from("contractors")
    .insert({
      organization_id: user.organizationId,
      name: input.name.trim(),
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to create contractor." };

  revalidatePath("/contractors");
  return { contractorId: data.id as string };
}

export async function inviteContractorToTender(tenderId: string, contractorId: string) {
  await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("contractor_submissions")
    .upsert({ tender_id: tenderId, contractor_id: contractorId, status: "invited" }, { onConflict: "tender_id,contractor_id" });

  if (error) return { error: error.message };

  revalidatePath(`/contractors`);
  return { ok: true };
}

export async function updateContractor(
  contractorId: string,
  input: { name: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null }
) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  if (!input.name.trim()) return { error: "Contractor name is required." };

  const { error } = await supabase
    .from("contractors")
    .update({
      name: input.name.trim(),
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone,
    })
    .eq("id", contractorId)
    .eq("organization_id", user.organizationId);

  if (error) return { error: error.message };

  revalidatePath("/contractors");
  return { ok: true };
}

/**
 * Removes a contractor from one tender only (their invite/quotation for that
 * tender) — the contractor record itself, and their involvement in any other
 * tender, is untouched. Cascades to that submission's bid items and chat
 * history via FK.
 */
export async function removeContractorFromTender(tenderId: string, contractorId: string) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { data: tender } = await supabase
    .from("tenders")
    .select("id")
    .eq("id", tenderId)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (!tender) return { error: "Tender not found." };

  const { error } = await supabase
    .from("contractor_submissions")
    .delete()
    .eq("tender_id", tenderId)
    .eq("contractor_id", contractorId);

  if (error) return { error: error.message };

  revalidatePath("/contractors");
  return { ok: true };
}
