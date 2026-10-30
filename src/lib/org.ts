import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUserContext {
  userId: string;
  email: string | null;
  fullName: string | null;
  organizationId: string;
  organizationName: string;
  role: "owner" | "admin" | "member" | "viewer";
}

/**
 * Resolves the signed-in user's organization context for server components
 * and route handlers. Redirects to /login if unauthenticated, or if the
 * user has no organization yet — there's no public signup; accounts and
 * their organization are provisioned by an admin.
 */
export async function requireCurrentUser(): Promise<CurrentUserContext> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    fullName: profile?.full_name ?? null,
    organizationId: membership.organization_id,
    organizationName: (membership.organizations as unknown as { name: string } | null)?.name ?? "Organization",
    role: membership.role,
  };
}
