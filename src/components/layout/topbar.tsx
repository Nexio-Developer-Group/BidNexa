"use client";

import { useRouter, usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function Topbar() {
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
    <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6">
      <h1 className="text-lg font-semibold text-[var(--foreground)]">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted)]" />
          <Input placeholder="Search tenders…" className="w-64 pl-8" />
        </div>
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
