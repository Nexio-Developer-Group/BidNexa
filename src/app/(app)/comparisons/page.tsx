import Link from "next/link";
import { requireCurrentUser } from "@/lib/org";
import { listTenders } from "@/lib/data/tenders";
import { getComparisonData } from "@/lib/data/contractors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";

export default async function ComparisonsPage({ searchParams }: PageProps<"/comparisons">) {
  const { tenderId } = await searchParams;
  const user = await requireCurrentUser();
  const tenders = await listTenders(user.organizationId);

  const selectedTenderId = typeof tenderId === "string" ? tenderId : tenders[0]?.id;
  const selectedTender = tenders.find((t) => t.id === selectedTenderId);

  if (!selectedTender) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-[var(--muted)]">
          No tenders available yet.
        </CardContent>
      </Card>
    );
  }

  const { requirements, submissions } = await getComparisonData(selectedTender.id);
  const currency = selectedTender.currency;

  const bidItemsBySubmissionAndReq = new Map<string, Map<string, (typeof submissions)[number]["contractor_bid_items"][number]>>();
  for (const s of submissions) {
    const map = new Map<string, (typeof s.contractor_bid_items)[number]>();
    for (const item of s.contractor_bid_items ?? []) {
      if (item.requirement_id) map.set(item.requirement_id, item);
    }
    bidItemsBySubmissionAndReq.set(s.id, map);
  }

  const totals = submissions.map((s) => {
    const items = s.contractor_bid_items ?? [];
    const total = items.reduce((sum, i) => sum + (i.quoted_amount ? Number(i.quoted_amount) : 0), 0);
    const excludedCount = items.filter((i) => i.is_excluded).length;
    const deviationCount = items.filter((i) => i.is_deviation).length;
    return { submission: s, total, excludedCount, deviationCount };
  });

  const lowest = totals.length > 0 ? Math.min(...totals.filter((t) => t.total > 0).map((t) => t.total)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Bid Comparison — {selectedTender.title}</h2>
          <p className="text-sm text-[var(--muted)]">
            {submissions.length} contractor submission(s) · {requirements.length} priced item(s)
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/reports?tenderId=${selectedTender.id}`}>Export comparison</Link>
        </Button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(totals.length, 4) || 1}, minmax(0, 1fr))` }}>
        {totals.map(({ submission, total, excludedCount, deviationCount }) => (
          <Card key={submission.id}>
            <CardContent className="p-4">
              <p className="text-sm font-medium">{(submission.contractors as unknown as { name: string })?.name}</p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(total, currency)}</p>
              <div className="mt-2 flex gap-1">
                {total === lowest && total > 0 && <Badge variant="success">Lowest</Badge>}
                {excludedCount > 0 && <Badge variant="warning">{excludedCount} unmatched</Badge>}
                {deviationCount > 0 && <Badge variant="danger">{deviationCount} deviation(s)</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Item-wise comparison</CardTitle>
          <CardDescription>
            Financial ranking only — technical compliance and exclusions still need separate review.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Tender Qty</TableHead>
                {submissions.map((s) => (
                  <TableHead key={s.id} className="text-right">
                    {(s.contractors as unknown as { name: string })?.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.item_number || "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.original_description}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(r.quantity)} {r.unit || ""}
                  </TableCell>
                  {submissions.map((s) => {
                    const item = bidItemsBySubmissionAndReq.get(s.id)?.get(r.id);
                    if (!item) {
                      return (
                        <TableCell key={s.id} className="text-right text-[var(--danger)]">
                          not quoted
                        </TableCell>
                      );
                    }
                    const tenderAmount = r.amount ? Number(r.amount) : null;
                    const variancePct =
                      tenderAmount && item.quoted_amount
                        ? ((Number(item.quoted_amount) - tenderAmount) / tenderAmount) * 100
                        : null;
                    return (
                      <TableCell key={s.id} className="text-right">
                        <div>{formatCurrency(item.quoted_amount, currency)}</div>
                        <div
                          className={cn(
                            "text-xs",
                            item.is_deviation ? "text-[var(--danger)]" : "text-[var(--muted)]"
                          )}
                        >
                          {variancePct !== null ? `${variancePct > 0 ? "+" : ""}${variancePct.toFixed(1)}%` : ""}
                          {item.is_deviation ? " · deviation" : ""}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
