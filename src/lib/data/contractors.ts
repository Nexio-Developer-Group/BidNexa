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
      .eq("committed", true)
      .order("source_row"),
    supabase
      .from("contractor_submissions")
      .select("*, contractors(name), contractor_bid_items(*)")
      .eq("tender_id", tenderId),
  ]);

  if (rErr) throw rErr;
  if (sErr) throw sErr;

  // Only committed bid items count toward the comparison.
  const submissionsWithCommittedItems = ((submissions ?? []) as unknown as SubmissionWithJoins[]).map((s) => ({
    ...s,
    contractor_bid_items: (s.contractor_bid_items ?? []).filter((i) => i.committed),
  }));

  return {
    requirements: requirements ?? [],
    submissions: submissionsWithCommittedItems as unknown as SubmissionWithJoins[],
  };
}

export async function getSubmission(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contractor_submissions")
    .select("*, contractors(name), tenders(id, title, organization_id, currency)")
    .eq("id", submissionId)
    .single();
  if (error) throw error;
  return data as unknown as Tables<"contractor_submissions"> & {
    contractors: { name: string } | null;
    tenders: { id: string; title: string; organization_id: string; currency: string } | null;
  };
}

export interface DraftBidItem extends Tables<"contractor_bid_items"> {
  tender_requirements: { item_number: string | null; original_description: string; quantity: number | null; rate: number | null } | null;
}

/** Draft (not-yet-saved) bid items for a submission's current upload, with the matched requirement for comparison. */
export async function getDraftBidItems(submissionId: string, uploadId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contractor_bid_items")
    .select("*, tender_requirements(item_number, original_description, quantity, rate)")
    .eq("submission_id", submissionId)
    .eq("upload_id", uploadId)
    .eq("committed", false);
  if (error) throw error;
  return (data ?? []) as unknown as DraftBidItem[];
}

/** Committed (saved) bid items for a submission, with the matched requirement — the chat's comparison context. */
export async function getCommittedBidItemsForSubmission(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contractor_bid_items")
    .select("*, tender_requirements(item_number, original_description, unit, quantity, rate, amount)")
    .eq("submission_id", submissionId)
    .eq("committed", true)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as (Tables<"contractor_bid_items"> & {
    tender_requirements: {
      item_number: string | null;
      original_description: string;
      unit: string | null;
      quantity: number | null;
      rate: number | null;
      amount: number | null;
    } | null;
  })[];
}

export async function getChatMessages(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contractor_chat_messages")
    .select("*")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
