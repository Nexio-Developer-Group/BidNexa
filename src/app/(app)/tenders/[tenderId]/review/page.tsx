import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/org";
import { getTender, getTenderUploads, getExtractionIssues } from "@/lib/data/tenders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SeverityBadge } from "@/components/tenders/status-badge";
import { IssueRowActions } from "./issue-row-actions";
import { ApproveTenderButton } from "./approve-button";

export default async function ReviewPage({ params }: PageProps<"/tenders/[tenderId]/review">) {
  const { tenderId } = await params;
  const user = await requireCurrentUser();

  const tender = await getTender(tenderId);
  if (!tender || tender.organization_id !== user.organizationId) notFound();

  const uploads = await getTenderUploads(tenderId);
  const issues = await getExtractionIssues(uploads.map((u) => u.id));

  const open = issues.filter((i) => i.review_status === "open");
  const resolved = issues.filter((i) => i.review_status !== "open");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Extraction review — {tender.title}</h2>
          <p className="text-sm text-[var(--muted)]">
            Resolve every flagged issue before approving. Manual corrections are made on the BOQ page and are
            audit-logged.
          </p>
        </div>
        <ApproveTenderButton tenderId={tenderId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open issues ({open.length})</CardTitle>
          <CardDescription>Blocking issues must be resolved before the tender can be approved.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {open.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">No open issues. Nice and clean.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Original → Proposed</TableHead>
                  <TableHead>Actions</TableHead>
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
                    <TableCell className="max-w-xs text-sm text-[var(--muted)]">{issue.reason}</TableCell>
                    <TableCell className="text-xs">
                      {issue.original_value ?? "—"} → {issue.proposed_interpretation ?? "—"}
                    </TableCell>
                    <TableCell>
                      <IssueRowActions tenderId={tenderId} issueId={issue.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolved ({resolved.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolved.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="font-mono text-xs">{issue.source_reference}</TableCell>
                    <TableCell>{issue.issue_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="capitalize">{issue.review_status}</TableCell>
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
