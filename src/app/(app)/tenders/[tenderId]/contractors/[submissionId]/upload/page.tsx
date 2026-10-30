import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/org";
import { getSubmission } from "@/lib/data/contractors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ContractorUploadScreen } from "./contractor-upload-screen";

export default async function ContractorUploadPage({
  params,
}: PageProps<"/tenders/[tenderId]/contractors/[submissionId]/upload">) {
  const { tenderId, submissionId } = await params;
  const user = await requireCurrentUser();

  const submission = await getSubmission(submissionId);
  if (!submission || submission.tender_id !== tenderId || submission.tenders?.organization_id !== user.organizationId) {
    notFound();
  }

  const hasExistingUpload = Boolean(submission.upload_id);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold sm:text-xl">
          {hasExistingUpload ? "Re-upload quotation" : "Upload quotation"} — {submission.contractors?.name} for{" "}
          {submission.tenders?.title}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Every worksheet is parsed and interpreted before anything is marked complete. Nothing changes in the
          comparison until you review and save it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quotation workbook</CardTitle>
          <CardDescription>
            {hasExistingUpload
              ? "Uploading a new file replaces the current quotation entirely — the old extracted data is cleared."
              : "Upload the contractor's quoted BOQ workbook."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContractorUploadScreen
            tenderId={tenderId}
            contractorId={submission.contractor_id}
            submissionId={submissionId}
            hasExistingUpload={hasExistingUpload}
          />
        </CardContent>
      </Card>
    </div>
  );
}
