import { requireCurrentUser } from "@/lib/org";
import { listTenders } from "@/lib/data/tenders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { tenderId } = await searchParams;
  const user = await requireCurrentUser();
  const tenders = await listTenders(user.organizationId);
  const selectedId = typeof tenderId === "string" ? tenderId : tenders[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Reports</h2>
        <p className="text-sm text-[var(--muted)]">
          Exports are generated from validated database records, not raw AI output.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select tender</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex gap-2">
            <select
              name="tenderId"
              defaultValue={selectedId}
              className="h-10 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            >
              {tenders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Load
            </Button>
          </form>
        </CardContent>
      </Card>

      {selectedId && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReportCard
            title="BOQ Export"
            description="Full bill of quantities with sections, items, quantities, rates and amounts."
            href={`/api/reports?tenderId=${selectedId}&type=boq`}
          />
          <ReportCard
            title="Contractor Comparison"
            description="Item-wise rates and amounts across every contractor submission, with totals."
            href={`/api/reports?tenderId=${selectedId}&type=comparison`}
          />
        </div>
      )}
    </div>
  );
}

function ReportCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href={href}>
            <Download className="h-4 w-4" /> Download Excel
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
