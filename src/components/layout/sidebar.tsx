"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  LayoutDashboard,
  FileSpreadsheet,
  PlusCircle,
  Users,
  GitCompareArrows,
  History,
  Settings,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/tenders", label: "Tenders", icon: FileSpreadsheet },
  { href: "/tenders/new", label: "Create Tender", icon: PlusCircle },
  { href: "/contractors", label: "Contractors", icon: Users },
  { href: "/comparisons", label: "Bid Comparisons", icon: GitCompareArrows },
  { href: "/activity", label: "Activity & Audit", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function SidebarContents({
  organizationName,
  userName,
  userEmail,
  onNavigate,
}: {
  organizationName: string;
  userName: string;
  userEmail: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-5 py-5 text-lg font-bold text-white">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--teal-500)] text-[var(--navy-950)]">
          B
        </span>
        <span className="truncate">BidNexa</span>
      </div>

      <div className="truncate px-5 pb-3 text-xs uppercase tracking-wide text-slate-500">
        {organizationName}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-[var(--teal-500)]/15 text-[var(--teal-400)]" : "text-slate-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex min-w-0 items-center gap-3 border-t border-white/10 px-5 py-4">
        <Avatar className="shrink-0">
          <AvatarFallback>{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{userName}</p>
          <p className="truncate text-xs text-slate-500">{userEmail}</p>
        </div>
      </div>
    </div>
  );
}

export function Sidebar(props: { organizationName: string; userName: string; userEmail: string }) {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--navy-950)] text-slate-200 md:flex">
      <SidebarContents {...props} />
    </aside>
  );
}

/** Hamburger-triggered slide-over nav, shown only below the md breakpoint. */
export function MobileSidebar(props: { organizationName: string; userName: string; userEmail: string }) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--foreground)] hover:bg-[var(--muted-surface)] md:hidden"
        >
          <span className="flex flex-col gap-1">
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
          </span>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-[var(--navy-950)] text-slate-200 shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Close className="absolute right-3 top-4 rounded-sm p-1 text-slate-400 hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
          <SidebarContents {...props} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
