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
