import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentUser } from "@/lib/org";
import { getSubmission, getChatMessages } from "@/lib/data/contractors";
import { runQuotationChatTurn } from "@/lib/claude/quotation-chat";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenderId: string; submissionId: string }> }
) {
  const { tenderId, submissionId } = await params;
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `message exceeds ${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });
  }

  const submission = await getSubmission(submissionId);
  if (!submission || submission.tender_id !== tenderId || submission.tenders?.organization_id !== user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!submission.upload_id) {
    return NextResponse.json({ error: "No quotation has been uploaded yet for this contractor." }, { status: 409 });
  }

  const priorMessages = await getChatMessages(submissionId);
  const history = priorMessages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const { error: insertUserError } = await supabase
    .from("contractor_chat_messages")
    .insert({ submission_id: submissionId, role: "user", content: message });
  if (insertUserError) {
    return NextResponse.json({ error: insertUserError.message }, { status: 500 });
  }

  let result;
  try {
    result = await runQuotationChatTurn({
      tenderId,
      submissionId,
      tenderTitle: submission.tenders?.title ?? "this tender",
      contractorName: submission.contractors?.name ?? "this contractor",
      currency: submission.tenders?.currency ?? "INR",
      history,
      userMessage: message,
    });
  } catch (err) {
    return NextResponse.json({ error: `Chat failed: ${(err as Error).message}` }, { status: 502 });
  }

  await supabase
    .from("contractor_chat_messages")
    .insert({ submission_id: submissionId, role: "assistant", content: result.reply });

  return NextResponse.json({ reply: result.reply, actionsApplied: result.actionsApplied });
}
