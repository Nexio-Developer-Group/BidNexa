import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/org";
import { getTender, getTenderSectionsWithRequirements } from "@/lib/data/tenders";
import { getComparisonData } from "@/lib/data/contractors";
import { buildBoqWorkbook, buildComparisonWorkbook } from "@/lib/reports/generate";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireCurrentUser();
  const { searchParams } = request.nextUrl;
  const tenderId = searchParams.get("tenderId");
  const type = searchParams.get("type") || "boq";

  if (!tenderId) return NextResponse.json({ error: "tenderId is required" }, { status: 400 });

  const tender = await getTender(tenderId);
  if (!tender || tender.organization_id !== user.organizationId) {
    return NextResponse.json({ error: "Tender not found" }, { status: 404 });
  }

  let workbook;
  let filename: string;

  if (type === "comparison") {
    const { requirements, submissions } = await getComparisonData(tenderId);
    workbook = await buildComparisonWorkbook(
      tender,
      requirements,
      submissions as unknown as Parameters<typeof buildComparisonWorkbook>[2]
    );
    filename = `${tender.reference_number || tender.title}-comparison.xlsx`;
  } else {
    const { sections, requirements } = await getTenderSectionsWithRequirements(tenderId);
    workbook = await buildBoqWorkbook(tender, sections, requirements);
    filename = `${tender.reference_number || tender.title}-boq.xlsx`;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const safeFilename = filename.replace(/[^a-zA-Z0-9.\- ]/g, "_");

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
    },
  });
}
