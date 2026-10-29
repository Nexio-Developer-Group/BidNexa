import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/org";
import { getSubmission, getDraftBidItems } from "@/lib/data/contractors";
import { getExtractionIssues } from "@/lib/data/tenders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/tenders/status-badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { EditableBidCell } from "./editable-bid-cell";
import { SaveBidItemsButton } from "./save-button";

export default async function ContractorBidReviewPage({
  params,
}: PageProps<"/tenders/[tenderId]/contractors/[submissionId]/review">) {
  const { tenderId, submissionId } = await params;
  const user = await requireCurrentUser();

  const submission = await getSubmission(submissionId);
  if (!submission || submission.tender_id !== tenderId || submission.tenders?.organization_id !== user.organizationId) {
    notFound();
  }
  if (!submission.upload_id) notFound();

  const currency = submission.tenders?.currency ?? "INR";
  const [bidItems, issues] = await Promise.all([
    getDraftBidItems(submissionId, submission.upload_id),
    getExtractionIssues([submission.upload_id]),
  ]);

  const open = issues.filter((i) => i.review_status === "open");
  const alreadySaved = submission.status === "approved";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Review quotation — {submission.contractors?.name} for {submission.tenders?.title}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Correct anything wrong, then save. Nothing here counts toward the comparison until it&apos;s saved.
          </p>
        </div>
        {!alreadySaved && bidItems.length > 0 && (
          <SaveBidItemsButton tenderId={tenderId} submissionId={submissionId} uploadId={submission.upload_id} />
        )}
      </div>

      {alreadySaved && (
        <Card>
          <CardContent className="p-4 text-sm text-[var(--success)]">
            This quotation has already been saved.{" "}
            <Link href={`/comparisons?tenderId=${tenderId}`} className="font-medium hover:underline">
              View the comparison
            </Link>
            .
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Open issues ({open.length})</CardTitle>
          <CardDescription>Unmatched items and quantity deviations are flagged here, not hidden.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {open.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">No open issues on this quotation.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="font-mono text-xs">{issue.source_reference}</TableCell>
                    <TableCell>{issue.issue_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={issue.severity} />
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted)]">{issue.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!alreadySaved && (
        <Card>
          <CardHeader>
            <CardTitle>Quoted items ({bidItems.length})</CardTitle>
            <CardDescription>Matched against the tender&apos;s own BOQ by item number, then description.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matched item</TableHead>
                  <TableHead className="text-right">Tender qty</TableHead>
                  <TableHead className="text-right">Quoted qty</TableHead>
                  <TableHead className="text-right">Tender rate</TableHead>
                  <TableHead className="text-right">Quoted rate</TableHead>
                  <TableHead className="text-right">Quoted amount</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bidItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-xs">
                      {item.tender_requirements ? (
                        <>
                          <span className="font-mono text-xs text-[var(--muted)]">
                            {item.tender_requirements.item_number || "—"}
                          </span>{" "}
                          {item.tender_requirements.original_description}
                        </>
                      ) : (
                        <span className="text-[var(--danger)]">no match</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(item.tender_requirements?.quantity ?? null)}</TableCell>
                    <TableCell className="text-right">
                      <EditableBidCell
                        tenderId={tenderId}
                        bidItemId={item.id}
                        field="quoted_quantity"
                        value={item.quoted_quantity !== null ? String(item.quoted_quantity) : ""}
                      />
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.tender_requirements?.rate ?? null, currency)}</TableCell>
                    <TableCell className="text-right">
                      <EditableBidCell
                        tenderId={tenderId}
                        bidItemId={item.id}
                        field="quoted_rate"
                        value={item.quoted_rate !== null ? String(item.quoted_rate) : ""}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableBidCell
                        tenderId={tenderId}
                        bidItemId={item.id}
                        field="quoted_amount"
                        value={item.quoted_amount !== null ? String(item.quoted_amount) : ""}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.is_excluded && <Badge variant="warning">unmatched</Badge>}
                        {item.is_deviation && <Badge variant="danger">qty deviation</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
