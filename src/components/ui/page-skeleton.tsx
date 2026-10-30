import { Card, CardContent, CardHeader } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--muted-surface)] ${className}`} />;
}

/**
 * Generic app-page skeleton, shown instantly by Next.js (via loading.tsx)
 * the moment navigation starts, before the destination's server component
 * has resolved its data — so a click never just sits on the old page with
 * no feedback until the new one jumps in all at once.
 */
export function PageSkeleton({ statCards = 0, tableRows = 6 }: { statCards?: number; tableRows?: number }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Bar className="h-6 w-48" />
          <Bar className="h-3 w-64" />
        </div>
        <Bar className="h-9 w-32" />
      </div>

      {statCards > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: statCards }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-2 p-4">
                <Bar className="h-3 w-20" />
                <Bar className="h-6 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <Bar className="h-4 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: tableRows }).map((_, i) => (
            <Bar key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
