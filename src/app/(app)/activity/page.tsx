import { requireCurrentUser } from "@/lib/org";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

export default async function ActivityPage() {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("organization_id", user.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Activity & Audit</h2>
        <p className="text-sm text-[var(--muted)]">Every mutation to tender, requirement and review data is logged here.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!logs || logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">No activity recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-[var(--muted)]">{formatDateTime(log.created_at)}</TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.entity_type}
                      {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ""}
                    </TableCell>
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
