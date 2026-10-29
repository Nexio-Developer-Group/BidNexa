import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/org";
import {
  getTender,
  getTenderUploads,
  getTenderSectionsWithRequirements,
  getExtractionIssues,
} from "@/lib/data/tenders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UploadWorkbook } from "@/components/tenders/upload-workbook";
import { ReprocessUploadButton } from "@/components/tenders/reprocess-upload-button";
import { TenderStatusBadge, UploadStatusBadge, SeverityBadge } from "@/components/tenders/status-badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate, formatDateTime, formatNumber, formatCurrency } from "@/lib/utils";

const STUCK_UPLOAD_STATUSES = new Set(["failed", "partially_processed", "queued", "parsing", "ai_interpretation"]);

export default async function TenderDetailPage({ params }: PageProps<"/tenders/[tenderId]">) {
  const { tenderId } = await params;
  const user = await requireCurrentUser();

  let tender;
  try {
    tender = await getTender(tenderId);
  } catch {
    notFound();
  }
  if (!tender || tender.organization_id !== user.organizationId) notFound();

  const [uploads, { sections, requirements }] = await Promise.all([
    getTenderUploads(tenderId),
    getTenderSectionsWithRequirements(tenderId),
  ]);

  const uploadIds = uploads.map((u) => u.id);
  const issues = await getExtractionIssues(uploadIds);
  const openIssues = issues.filter((i) => i.review_status === "open");

  const totalAmount = requirements
    .filter((r) => r.row_type === "item" && r.amount !== null)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{tender.title}</h2>
            <TenderStatusBadge status={tender.status} />
          </div>
          <p className="text-sm text-[var(--muted)]">
            {tender.reference_number ? `${tender.reference_number} · ` : ""}
            {tender.client_name || "No client set"} · Deadline {formatDate(tender.deadline)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/contractors?tenderId=${tenderId}`}>Manage contractors</Link>
          </Button>
          <Button asChild>
            <Link href={`/comparisons?tenderId=${tenderId}`}>View comparison</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Sections" value={sections.length} />
        <StatCard label="BOQ items" value={requirements.filter((r) => r.row_type === "item").length} />
        <StatCard label="Open issues" value={openIssues.length} tone={openIssues.length > 0 ? "warning" : "success"} />
        <StatCard label="Tender total (from source)" value={formatCurrency(totalAmount, tender.currency)} isText />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workbook upload</CardTitle>
          <CardDescription>
            Upload the tender BOQ workbook. Every worksheet is parsed and interpreted before anything is marked
            complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <UploadWorkbook tenderId={tenderId} />

          {uploads.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Worksheets</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.original_filename}</TableCell>
                    <TableCell>{formatDateTime(u.created_at)}</TableCell>
                    <TableCell>
                      <UploadStatusBadge status={u.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(u.workbook_sheets ?? []).map((s) => (
                          <Badge key={s.id} variant={s.validation_status === "valid" ? "success" : s.validation_status === "warnings" ? "warning" : "danger"}>
                            {s.sheet_name} ({s.processed_cell_count})
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {STUCK_UPLOAD_STATUSES.has(u.status) && (
                        <ReprocessUploadButton tenderId={tenderId} uploadId={u.id} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {openIssues.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Extraction review required</CardTitle>
                <CardDescription>
                  {openIssues.length} issue(s) need confirmation before this tender can be marked approved.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/tenders/${tenderId}/review`}>Open review screen</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openIssues.slice(0, 8).map((issue) => (
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Bill of Quantities</CardTitle>
              <CardDescription>Extracted sections and items, grouped in source order.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/tenders/${tenderId}/boq`}>Open full BOQ</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {requirements.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">
              No BOQ items extracted yet. Upload a workbook above to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.slice(0, 12).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.item_number || "—"}</TableCell>
                    <TableCell className="max-w-md truncate">{r.original_description || "(missing)"}</TableCell>
                    <TableCell>{r.unit || "—"}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.quantity)}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.rate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.amount, tender.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  isText,
}: {
  label: string;
  value: number | string;
  tone?: "warning" | "success";
  isText?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <p
          className={`mt-1 ${isText ? "text-lg" : "text-2xl"} font-semibold ${
            tone === "warning" ? "text-[var(--warning)]" : tone === "success" ? "text-[var(--success)]" : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
