import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCurrentUser } from "@/lib/org";
import { getSubmission, getChatMessages, getCommittedBidItemsForSubmission } from "@/lib/data/contractors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QuotationChat } from "./quotation-chat";

export default async function ContractorChatPage({
  params,
}: PageProps<"/tenders/[tenderId]/contractors/[submissionId]/chat">) {
  const { tenderId, submissionId } = await params;
  const user = await requireCurrentUser();

  const submission = await getSubmission(submissionId);
  if (!submission || submission.tender_id !== tenderId || submission.tenders?.organization_id !== user.organizationId) {
    notFound();
  }
  if (!submission.upload_id) notFound();

  const [messages, bidItems] = await Promise.all([
    getChatMessages(submissionId),
    getCommittedBidItemsForSubmission(submissionId),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold sm:text-xl">
          Quotation chat — {submission.contractors?.name} on {submission.tenders?.title}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Only one quotation is kept per contractor. Ask questions about this quotation versus the tender
          requirement, or ask to change a specific quoted value — nothing changes unless you explicitly say so.
        </p>
      </div>

      {bidItems.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-[var(--muted)]">
            This quotation hasn&apos;t been saved yet.{" "}
            <Link href={`/tenders/${tenderId}/contractors/${submissionId}/review`} className="font-medium text-[var(--primary)] hover:underline">
              Review and save it
            </Link>{" "}
            first — the chat works off the saved (committed) data.
          </CardContent>
        </Card>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Chat</CardTitle>
          <CardDescription>Claude answers from this contractor&apos;s saved quotation only.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 p-0">
          <QuotationChat
            tenderId={tenderId}
            submissionId={submissionId}
            initialMessages={messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))}
            disabled={bidItems.length === 0}
          />
        </CardContent>
      </Card>
    </div>
  );
}
