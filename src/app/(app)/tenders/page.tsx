import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { requireCurrentUser } from "@/lib/org";
import { listTenders } from "@/lib/data/tenders";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TenderStatusBadge } from "@/components/tenders/status-badge";
import { formatDate } from "@/lib/utils";

export default async function TendersPage() {
  const user = await requireCurrentUser();
  const tenders = await listTenders(user.organizationId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold sm:text-xl">Tenders</h2>
          <p className="truncate text-sm text-[var(--muted)]">{tenders.length} tender(s) in {user.organizationName}</p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/tenders/new">
            <PlusCircle className="h-4 w-4" /> Create Tender
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {tenders.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--muted)]">
              No tenders yet. Create your first tender to upload a BOQ workbook.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenders.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/tenders/${t.id}`} className="hover:underline">
                        {t.title}
                      </Link>
                    </TableCell>
                    <TableCell>{t.reference_number || "—"}</TableCell>
                    <TableCell>{t.client_name || "—"}</TableCell>
                    <TableCell>{formatDate(t.deadline)}</TableCell>
                    <TableCell>
                      <TenderStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell>{formatDate(t.created_at)}</TableCell>
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
