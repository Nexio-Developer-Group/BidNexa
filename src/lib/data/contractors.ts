import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database";

export interface SubmissionWithJoins extends Tables<"contractor_submissions"> {
  contractors: { name: string; contact_email?: string | null } | null;
  contractor_bid_items: Tables<"contractor_bid_items">[];
}

export async function listContractors(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contractors")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function listSubmissionsForTender(tenderId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contractor_submissions")
    .select("*, contractors(name, contact_email), contractor_bid_items(id, is_excluded, is_deviation, quoted_amount)")
    .eq("tender_id", tenderId);
  if (error) throw error;
  return data as unknown as SubmissionWithJoins[];
}

export async function getComparisonData(tenderId: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: requirements, error: rErr }, { data: submissions, error: sErr }] = await Promise.all([
    supabase
      .from("tender_requirements")
      .select("*")
      .eq("tender_id", tenderId)
      .eq("row_type", "item")
      .order("source_row"),
    supabase
      .from("contractor_submissions")
      .select("*, contractors(name), contractor_bid_items(*)")
      .eq("tender_id", tenderId),
  ]);

  if (rErr) throw rErr;
  if (sErr) throw sErr;

  return {
    requirements: requirements ?? [],
    submissions: (submissions ?? []) as unknown as SubmissionWithJoins[],
  };
}
