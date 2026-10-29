import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/org";
import { getTender, getTenderSectionsWithRequirements } from "@/lib/data/tenders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { EditableCell } from "./editable-cell";
import { isDisplayableBoqRow } from "@/lib/validation/boq-display";

export default async function BoqPage({ params }: PageProps<"/tenders/[tenderId]/boq">) {
  const { tenderId } = await params;
  const user = await requireCurrentUser();

  const tender = await getTender(tenderId);
  if (!tender || tender.organization_id !== user.organizationId) notFound();

  const { sections, requirements: allRequirements } = await getTenderSectionsWithRequirements(tenderId);
  const requirements = allRequirements.filter(isDisplayableBoqRow);

  const bySection = new Map<string | null, typeof requirements>();
  for (const r of requirements) {
    const key = r.section_id;
    bySection.set(key, [...(bySection.get(key) ?? []), r]);
  }

  const sectionGroups = [
    ...sections.map((s) => ({ id: s.id, name: s.original_section_name, rows: bySection.get(s.id) ?? [] })),
    ...(bySection.has(null) ? [{ id: null, name: "Ungrouped", rows: bySection.get(null) ?? [] }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Bill of Quantities — {tender.title}</h2>
        <p className="text-sm text-[var(--muted)]">
          Click any description, unit, quantity, rate or amount to correct it. Corrections are audit-logged; the
          original extracted value is never discarded.
        </p>
      </div>

      {sectionGroups.map((group) => (
        <Card key={group.id ?? "ungrouped"}>
          <CardHeader>
            <CardTitle>{group.name}</CardTitle>
            <CardDescription>{group.rows.length} row(s)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
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
                    <TableCell className="text-xs text-[var(--muted)]">{r.source_row}</TableCell>
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
                      {r.amount !== null ? formatCurrency(r.amount, tender.currency) : (
                        <EditableCell tenderId={tenderId} requirementId={r.id} field="amount" value="" align="right" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs capitalize text-[var(--muted)]">{r.row_type}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.calculation_discrepancy && <Badge variant="danger">formula mismatch</Badge>}
                        {r.mapping_confidence !== null && Number(r.mapping_confidence) < 0.6 && (
                          <Badge variant="warning">low confidence</Badge>
                        )}
                        {r.approved && <Badge variant="success">approved</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
