"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import type { TablesInsert, Json } from "@/lib/types/database";

export interface CreateTenderInput {
  title: string;
  referenceNumber: string | null;
  clientName: string | null;
  location: string | null;
  currency: string;
  deadline: string | null;
  notes: string | null;
}

export async function createTender(input: CreateTenderInput) {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  if (!input.title || input.title.trim().length === 0) {
    return { error: "Tender title is required." };
  }

  const payload: TablesInsert<"tenders"> = {
    organization_id: user.organizationId,
    title: input.title.trim(),
    reference_number: input.referenceNumber,
    client_name: input.clientName,
    location: input.location,
    currency: input.currency || "INR",
    deadline: input.deadline,
    notes: input.notes,
    status: "draft",
    created_by: user.userId,
  };

  const { data, error } = await supabase.from("tenders").insert(payload).select().single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create tender." };
  }

  await supabase.from("audit_logs").insert({
    organization_id: user.organizationId,
    user_id: user.userId,
    action: "tender.created",
    entity_type: "tender",
    entity_id: data.id,
    after_data: payload as unknown as Json,
  });

  revalidatePath("/tenders");
  return { tenderId: data.id as string };
}
