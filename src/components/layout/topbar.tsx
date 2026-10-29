"use client";

import { useRouter, usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileSidebar } from "@/components/layout/sidebar";

const TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/tenders": "Tenders",
  "/tenders/new": "Create Tender",
  "/contractors": "Contractors",
  "/comparisons": "Bid Comparisons",
  "/reports": "Reports",
  "/activity": "Activity & Audit",
  "/settings": "Settings",
};

function titleFor(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname];
  const segment = Object.keys(TITLES).find((p) => p !== "/" && pathname.startsWith(p));
  return segment ? TITLES[segment] : "BidNexa";
}

export function Topbar({
  organizationName,
  userName,
  userEmail,
}: {
  organizationName: string;
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const title = titleFor(pathname || "");

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar organizationName={organizationName} userName={userName} userEmail={userEmail} />
        <h1 className="truncate text-base font-semibold text-[var(--foreground)] sm:text-lg">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted)]" />
          <Input placeholder="Search tenders…" className="w-48 pl-8 lg:w-64" />
        </div>
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
