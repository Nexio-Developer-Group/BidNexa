import Link from "next/link";
import { PlusCircle, FileSpreadsheet, Users, AlertTriangle, Clock } from "lucide-react";
import { requireCurrentUser } from "@/lib/org";
import { getDashboardStats } from "@/lib/data/tenders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TenderStatusBadge } from "@/components/tenders/status-badge";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const stats = await getDashboardStats(user.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Welcome back, {user.fullName?.split(" ")[0] || "there"}</h2>
          <p className="text-sm text-[var(--muted)]">{user.organizationName}</p>
        </div>
        <Button asChild>
          <Link href="/tenders/new">
            <PlusCircle className="h-4 w-4" /> Create Tender
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard icon={FileSpreadsheet} label="Total tenders" value={stats.totalTenders} />
        <KpiCard icon={FileSpreadsheet} label="Active tenders" value={stats.activeTenders} tone="accent" />
        <KpiCard icon={AlertTriangle} label="Awaiting review" value={stats.reviewRequired} tone="warning" />
        <KpiCard icon={Users} label="Contractors" value={stats.contractorsCount} />
        <KpiCard icon={Clock} label="Pending submissions" value={stats.pendingSubmissions} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent tenders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recentTenders.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--muted)]">
              No tenders yet.{" "}
              <Link href="/tenders/new" className="text-[var(--primary)] hover:underline">
                Create your first one
              </Link>
              .
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {stats.recentTenders.map((t) => (
                <Link
                  key={t.id}
                  href={`/tenders/${t.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[var(--muted-surface)]/60"
                >
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Created {formatDate(t.created_at)}
                      {t.deadline ? ` · Deadline ${formatDate(t.deadline)}` : ""}
                    </p>
                  </div>
                  <TenderStatusBadge status={t.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "accent" | "warning";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] ${
            tone === "warning"
              ? "bg-[var(--warning)]/12 text-[var(--warning)]"
              : tone === "accent"
                ? "bg-[var(--teal-500)]/12 text-[var(--teal-600)]"
                : "bg-[var(--muted-surface)] text-[var(--muted)]"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-xs text-[var(--muted)]">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
