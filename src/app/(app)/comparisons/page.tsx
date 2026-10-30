import { Fragment } from "react";
import { requireCurrentUser } from "@/lib/org";
import { listTenders } from "@/lib/data/tenders";
import { getComparisonData } from "@/lib/data/contractors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
    const tenderTotalForMatched = items.reduce((sum, i) => {
      if (!i.requirement_id) return sum;
      const req = requirements.find((r) => r.id === i.requirement_id);
      return sum + (req?.amount ? Number(req.amount) : 0);
    }, 0);
    const diff = total - tenderTotalForMatched;
    const marginPct = tenderTotalForMatched > 0 ? (diff / tenderTotalForMatched) * 100 : null;
    const excludedCount = items.filter((i) => i.is_excluded).length;
    const deviationCount = items.filter((i) => i.is_deviation).length;
    return { submission: s, total, diff, marginPct, excludedCount, deviationCount };
  });

  const lowest = totals.length > 0 ? Math.min(...totals.filter((t) => t.total > 0).map((t) => t.total)) : 0;
  const tenderGrandTotal = requirements.reduce((sum, r) => sum + (r.amount ? Number(r.amount) : 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold sm:text-xl">Bid Comparison — {selectedTender.title}</h2>
        <p className="text-sm text-[var(--muted)]">
          {submissions.length} contractor submission(s) · {requirements.length} priced item(s) · tender total{" "}
          {formatCurrency(tenderGrandTotal, currency)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.map(({ submission, total, diff, marginPct, excludedCount, deviationCount }) => (
          <Card key={submission.id} className="min-w-0">
            <CardContent className="p-4">
              <p className="text-sm font-medium">{(submission.contractors as unknown as { name: string })?.name}</p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(total, currency)}</p>
              <p className={cn("text-xs", diff > 0 ? "text-[var(--danger)]" : diff < 0 ? "text-[var(--success)]" : "text-[var(--muted)]")}>
                {diff > 0 ? "+" : ""}
                {formatCurrency(diff, currency)}
                {marginPct !== null ? ` (${marginPct > 0 ? "+" : ""}${marginPct.toFixed(1)}%)` : ""} vs tender
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
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
            Rate, quantity, amount, diff in value and margin % against the tender&apos;s own requirement, per
            contractor. Financial ranking only — technical compliance and exclusions still need separate review.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2}>Item</TableHead>
                <TableHead rowSpan={2}>Description</TableHead>
                <TableHead rowSpan={2} className="text-right">
                  Req. Qty
                </TableHead>
                <TableHead rowSpan={2} className="text-right">
                  Req. Rate
                </TableHead>
                <TableHead rowSpan={2} className="text-right">
                  Req. Amount
                </TableHead>
                {submissions.map((s) => (
                  <TableHead key={s.id} colSpan={5} className="border-l border-[var(--border)] text-center">
                    {(s.contractors as unknown as { name: string })?.name}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow>
                {submissions.map((s) => (
                  <Fragment key={s.id}>
                    <TableHead className="border-l border-[var(--border)] text-right text-xs">Rate</TableHead>
                    <TableHead className="text-right text-xs">Qty</TableHead>
                    <TableHead className="text-right text-xs">Amount</TableHead>
                    <TableHead className="text-right text-xs">Diff (₹)</TableHead>
                    <TableHead className="text-right text-xs">Margin %</TableHead>
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.map((r) => {
                const reqAmount = r.amount !== null ? Number(r.amount) : null;
                const reqRate = r.rate !== null ? Number(r.rate) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.item_number || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.original_description}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(r.quantity)} {r.unit || ""}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(reqRate, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(reqAmount, currency)}</TableCell>
                    {submissions.map((s) => {
                      const item = bidItemsBySubmissionAndReq.get(s.id)?.get(r.id);
                      if (!item) {
                        return (
                          <TableCell
                            key={s.id}
                            colSpan={5}
                            className="border-l border-[var(--border)] text-center text-xs text-[var(--danger)]"
                          >
                            not quoted
                          </TableCell>
                        );
                      }
                      const quotedAmount = item.quoted_amount !== null ? Number(item.quoted_amount) : null;
                      const diff = quotedAmount !== null && reqAmount !== null ? quotedAmount - reqAmount : null;
                      const marginPct = diff !== null && reqAmount ? (diff / reqAmount) * 100 : null;
                      return (
                        <Fragment key={s.id}>
                          <TableCell className="border-l border-[var(--border)] text-right">
                            {formatCurrency(item.quoted_rate, currency)}
                          </TableCell>
                          <TableCell className={cn("text-right", item.is_deviation && "text-[var(--danger)]")}>
                            {formatNumber(item.quoted_quantity)}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(quotedAmount, currency)}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right",
                              diff !== null && diff > 0 ? "text-[var(--danger)]" : diff !== null && diff < 0 ? "text-[var(--success)]" : ""
                            )}
                          >
                            {diff !== null ? `${diff > 0 ? "+" : ""}${formatCurrency(diff, currency)}` : "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right",
                              marginPct !== null && marginPct > 0 ? "text-[var(--danger)]" : marginPct !== null && marginPct < 0 ? "text-[var(--success)]" : ""
                            )}
                          >
                            {marginPct !== null ? `${marginPct > 0 ? "+" : ""}${marginPct.toFixed(1)}%` : "—"}
                          </TableCell>
                        </Fragment>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
            <tfoot>
              <TableRow className="font-semibold">
                <TableCell colSpan={3}>TOTAL</TableCell>
                <TableCell />
                <TableCell className="text-right">{formatCurrency(tenderGrandTotal, currency)}</TableCell>
                {totals.map(({ submission, total, diff, marginPct }) => (
                  <TableCell key={submission.id} colSpan={5} className="border-l border-[var(--border)] text-right">
                    {formatCurrency(total, currency)}{" "}
                    <span className={cn("text-xs font-normal", diff > 0 ? "text-[var(--danger)]" : "text-[var(--success)]")}>
                      ({diff > 0 ? "+" : ""}
                      {formatCurrency(diff, currency)}, {marginPct !== null ? `${marginPct.toFixed(1)}%` : "—"})
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            </tfoot>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
