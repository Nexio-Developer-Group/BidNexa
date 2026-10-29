import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/org";
import { getTender, getTenderUploads, getExtractionIssues, getDraftRequirementsForUpload } from "@/lib/data/tenders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/tenders/status-badge";
import { IssueRowActions } from "./issue-row-actions";
import { SaveToDbButton } from "./approve-button";
import { EditableCell } from "../boq/editable-cell";

export default async function ReviewPage({
  params,
  searchParams,
}: PageProps<"/tenders/[tenderId]/review">) {
  const { tenderId } = await params;
  const { uploadId: uploadIdParam } = await searchParams;
  const user = await requireCurrentUser();

  const tender = await getTender(tenderId);
  if (!tender || tender.organization_id !== user.organizationId) notFound();

  const uploads = await getTenderUploads(tenderId);
  if (uploads.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-[var(--muted)]">
          No workbook uploaded yet for {tender.title}.{" "}
          <Link href={`/tenders/${tenderId}`} className="text-[var(--primary)] hover:underline">
            Upload one
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  const selectedUploadId = typeof uploadIdParam === "string" ? uploadIdParam : uploads[0].id;
  const selectedUpload = uploads.find((u) => u.id === selectedUploadId) ?? uploads[0];

  const [{ sections, requirements }, issues] = await Promise.all([
    getDraftRequirementsForUpload(tenderId, selectedUpload.id),
    getExtractionIssues([selectedUpload.id]),
  ]);

  const open = issues.filter((i) => i.review_status === "open");
  const resolved = issues.filter((i) => i.review_status !== "open");
  const alreadySaved = selectedUpload.status === "approved";

  const bySection = new Map<string | null, typeof requirements>();
  for (const r of requirements) {
    bySection.set(r.section_id, [...(bySection.get(r.section_id) ?? []), r]);
  }
  const sectionGroups = [
    ...sections.map((s) => ({ id: s.id, name: s.original_section_name, rows: bySection.get(s.id) ?? [] })),
    ...(bySection.has(null) ? [{ id: null, name: "Ungrouped", rows: bySection.get(null) ?? [] }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold sm:text-xl">Review extracted data — {tender.title}</h2>
          <p className="text-sm text-[var(--muted)]">
            {selectedUpload.original_filename} · review every row below, correct anything wrong, then save.
          </p>
        </div>
        {!alreadySaved && requirements.length > 0 && (
          <div className="shrink-0">
            <SaveToDbButton tenderId={tenderId} uploadId={selectedUpload.id} />
          </div>
        )}
      </div>

      {uploads.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {uploads.map((u) => (
            <Link
              key={u.id}
              href={`/tenders/${tenderId}/review?uploadId=${u.id}`}
              className={`rounded-full px-3 py-1 text-xs ${
                u.id === selectedUpload.id
                  ? "bg-[var(--navy-900)] text-white"
                  : "bg-[var(--muted-surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {u.original_filename}
            </Link>
          ))}
        </div>
      )}

      {alreadySaved && (
        <Card>
          <CardContent className="p-4 text-sm text-[var(--success)]">
            This upload has already been saved to the BOQ.{" "}
            <Link href={`/tenders/${tenderId}/boq`} className="font-medium hover:underline">
              View it there
            </Link>
            .
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Open issues ({open.length})</CardTitle>
          <CardDescription>Blocking issues must be resolved before saving to the BOQ.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {open.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">No open issues on this upload.</div>
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

      {!alreadySaved && (
        <Card>
          <CardHeader>
            <CardTitle>Extracted rows awaiting save ({requirements.length})</CardTitle>
            <CardDescription>
              Click any description, unit, quantity, rate or amount to correct it before saving.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!alreadySaved &&
        sectionGroups.map((group) => (
          <Card key={group.id ?? "ungrouped"}>
            <CardHeader>
              <CardTitle>{group.name}</CardTitle>
              <CardDescription>{group.rows.length} row(s)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        <EditableCell tenderId={tenderId} requirementId={r.id} field="item_number" value={r.item_number || ""} />
                      </TableCell>
                      <TableCell className="min-w-64">
                        <EditableCell
                          tenderId={tenderId}
                          requirementId={r.id}
                          field="original_description"
                          value={r.original_description}
                        />
                      </TableCell>
                      <TableCell>
                        <EditableCell tenderId={tenderId} requirementId={r.id} field="unit" value={r.unit || ""} />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell
                          tenderId={tenderId}
                          requirementId={r.id}
                          field="quantity"
                          value={r.quantity !== null ? String(r.quantity) : ""}
                          align="right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell
                          tenderId={tenderId}
                          requirementId={r.id}
                          field="rate"
                          value={r.rate !== null ? String(r.rate) : ""}
                          align="right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell
                          tenderId={tenderId}
                          requirementId={r.id}
                          field="amount"
                          value={r.amount !== null ? String(r.amount) : ""}
                          align="right"
                        />
                      </TableCell>
                      <TableCell className="text-xs capitalize text-[var(--muted)]">{r.row_type}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.calculation_discrepancy && <Badge variant="danger">formula mismatch</Badge>}
                          {r.mapping_confidence !== null && Number(r.mapping_confidence) < 0.6 && (
                            <Badge variant="warning">low confidence</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

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
