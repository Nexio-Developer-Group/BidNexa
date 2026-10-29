import { requireCurrentUser } from "@/lib/org";
import { listContractors } from "@/lib/data/contractors";
import { listTenders } from "@/lib/data/tenders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { AddContractorDialog } from "./add-contractor-dialog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InviteAndUpload } from "./invite-and-upload";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default async function ContractorsPage({ searchParams }: PageProps<"/contractors">) {
  const { tenderId } = await searchParams;
  const user = await requireCurrentUser();
  const [contractors, tenders] = await Promise.all([
    listContractors(user.organizationId),
    listTenders(user.organizationId),
  ]);

  const selectedTenderId = typeof tenderId === "string" ? tenderId : tenders[0]?.id;
  const selectedTender = tenders.find((t) => t.id === selectedTenderId);

  const supabase = await createSupabaseServerClient();
  const submissions = selectedTenderId
    ? (
        await supabase
          .from("contractor_submissions")
          .select("*, contractor_bid_items(quoted_amount, is_excluded)")
          .eq("tender_id", selectedTenderId)
      ).data ?? []
    : [];

  const submissionByContractor = new Map(submissions.map((s) => [s.contractor_id, s]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold sm:text-xl">Contractors</h2>
          <p className="truncate text-sm text-[var(--muted)]">{contractors.length} contractor(s) in {user.organizationName}</p>
        </div>
        <div className="shrink-0">
          <AddContractorDialog />
        </div>
      </div>

      {selectedTender && (
        <Card>
          <CardHeader>
            <CardTitle>Quotations for {selectedTender.title}</CardTitle>
            <CardDescription>Invite a contractor, then upload their quoted BOQ to compare against the tender.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quoted total</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractors.map((c) => {
                  const submission = submissionByContractor.get(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        {submission ? <Badge variant="outline">{submission.status.replace(/_/g, " ")}</Badge> : <Badge variant="default">not invited</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {submission?.total_quoted_amount
                          ? formatCurrency(Number(submission.total_quoted_amount), selectedTender.currency)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <InviteAndUpload
                          tenderId={selectedTender.id}
                          contractorId={c.id}
                          hasSubmission={Boolean(submission)}
                          submissionId={submission?.id}
                          hasUpload={Boolean(submission?.upload_id)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All contractors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {contractors.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">No contractors yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractors.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.contact_name || "—"}</TableCell>
                    <TableCell>{c.contact_email || "—"}</TableCell>
                    <TableCell>{c.contact_phone || "—"}</TableCell>
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
