import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database";

export interface TenderUploadWithSheets extends Tables<"tender_uploads"> {
  workbook_sheets: Tables<"workbook_sheets">[];
}

export async function listTenders(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenders")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getTender(tenderId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tenders").select("*").eq("id", tenderId).single();
  if (error) throw error;
  return data;
}

export async function getTenderUploads(tenderId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tender_uploads")
    .select("*, workbook_sheets(*)")
    .eq("tender_id", tenderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as TenderUploadWithSheets[];
}

/**
 * The canonical, "real" BOQ — only committed requirements. Draft rows from an
 * upload that hasn't been reviewed and saved yet are deliberately excluded.
 */
export async function getTenderSectionsWithRequirements(tenderId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: sections, error: sErr }, { data: requirements, error: rErr }] = await Promise.all([
    supabase.from("tender_sections").select("*").eq("tender_id", tenderId).order("source_order"),
    supabase
      .from("tender_requirements")
      .select("*")
      .eq("tender_id", tenderId)
      .eq("committed", true)
      .order("source_row", { ascending: true }),
  ]);
  if (sErr) throw sErr;
  if (rErr) throw rErr;
  return { sections: sections ?? [], requirements: requirements ?? [] };
}

/** Draft (not-yet-saved) requirements + their sections for one specific upload, for the review screen. */
export async function getDraftRequirementsForUpload(tenderId: string, uploadId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: requirements, error: rErr }, { data: sheets, error: shErr }] = await Promise.all([
    supabase
      .from("tender_requirements")
      .select("*")
      .eq("tender_id", tenderId)
      .eq("upload_id", uploadId)
      .eq("committed", false)
      .order("source_row", { ascending: true }),
    supabase.from("workbook_sheets").select("id").eq("upload_id", uploadId),
  ]);
  if (rErr) throw rErr;
  if (shErr) throw shErr;

  const sheetIds = (sheets ?? []).map((s) => s.id);
  const { data: sections, error: sErr } = sheetIds.length
    ? await supabase.from("tender_sections").select("*").in("sheet_id", sheetIds).order("source_order")
    : { data: [], error: null };
  if (sErr) throw sErr;

  return { sections: sections ?? [], requirements: requirements ?? [] };
}

export async function getExtractionIssues(uploadIds: string[]) {
  if (uploadIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("extraction_issues")
    .select("*")
    .in("upload_id", uploadIds)
    .order("severity", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDashboardStats(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [{ count: totalTenders }, { count: activeTenders }, { count: reviewRequired }, { count: contractorsCount }, { data: recentTenders }, { count: pendingSubmissions }] =
    await Promise.all([
      supabase.from("tenders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabase
        .from("tenders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("tenders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "review_required"),
      supabase.from("contractors").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabase
        .from("tenders")
        .select("id, title, status, deadline, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("contractor_submissions")
        .select("id, tenders!inner(organization_id)", { count: "exact", head: true })
        .eq("tenders.organization_id", organizationId)
        .in("status", ["invited", "uploaded", "processing"]),
    ]);

  return {
    totalTenders: totalTenders ?? 0,
    activeTenders: activeTenders ?? 0,
    reviewRequired: reviewRequired ?? 0,
    contractorsCount: contractorsCount ?? 0,
    pendingSubmissions: pendingSubmissions ?? 0,
    recentTenders: recentTenders ?? [],
  };
}
