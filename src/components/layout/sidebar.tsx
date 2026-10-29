"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileSpreadsheet,
  PlusCircle,
  Users,
  GitCompareArrows,
  FileBarChart,
  History,
  Settings,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/tenders", label: "Tenders", icon: FileSpreadsheet },
  { href: "/tenders/new", label: "Create Tender", icon: PlusCircle },
  { href: "/contractors", label: "Contractors", icon: Users },
  { href: "/comparisons", label: "Bid Comparisons", icon: GitCompareArrows },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/activity", label: "Activity & Audit", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  organizationName,
  userName,
  userEmail,
}: {
  organizationName: string;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-[var(--border)] bg-[var(--navy-950)] text-slate-200 md:flex">
      <div className="flex items-center gap-2 px-5 py-5 text-lg font-bold text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--teal-500)] text-[var(--navy-950)]">
          B
        </span>
        BidNexa
      </div>

      <div className="px-5 pb-3 text-xs uppercase tracking-wide text-slate-500">
        {organizationName}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-[var(--teal-500)]/15 text-[var(--teal-400)]" : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-5 py-4">
        <Avatar>
          <AvatarFallback>{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{userName}</p>
          <p className="truncate text-xs text-slate-500">{userEmail}</p>
        </div>
      </div>
    </aside>
  );
}
