import Anthropic from "@anthropic-ai/sdk";
import { getClient, MODEL } from "./client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { correctBidItemField } from "@/app/(app)/tenders/[tenderId]/contractors/[submissionId]/review/actions";

const TIMEOUT_MS = 45_000;
const MAX_TOOL_ITERATIONS = 4;

const UPDATE_TOOL_NAME = "update_quoted_value";

const SYSTEM_PROMPT_TEMPLATE = (ctx: {
  tenderTitle: string;
  contractorName: string;
  currency: string;
  rowsTable: string;
}) => `You are BidNexa's Quotation Assistant for a single contractor's quotation on a single tender. You are scoped to exactly this one quotation — never discuss or imply data from any other tender or contractor.

Tender: ${ctx.tenderTitle}
Contractor: ${ctx.contractorName}
Currency: ${ctx.currency}

Below is the full, current, authoritative comparison between the tender's requirement and this contractor's saved quotation. Every number in it is already correct and sourced from the database — never contradict it, never recompute it differently, never invent a row that isn't listed.

${ctx.rowsTable}

Your job:
1. Answer questions about this data — item-by-item or total differences (diff = quoted amount − requirement amount), margins in value and percentage ((requirement rate − quoted rate) and that divided by requirement rate), unmatched items, quantity deviations, totals, anything comparing the tender's requirement to this contractor's quote.
2. Only when the user explicitly asks you to change a specific quoted value (quantity, rate, or amount) for a specific item, call the ${UPDATE_TOOL_NAME} tool using that row's exact "id" from the table above.

Hard rules:
- Never call ${UPDATE_TOOL_NAME} unless the user's current message explicitly requests a change to a specific field of a specific item. Never "fix", "correct", or "improve" a value on your own initiative.
- If the user's request could match more than one row (ambiguous item reference), do not guess — ask them to clarify which row, by id or item number, instead of calling the tool.
- Only update the exact field(s) the user asked about. If changing quantity or rate would also change the amount, do not auto-update the amount unless the user explicitly asked for that too — state the implied new amount in your reply and ask if they'd like it updated as well.
- If a value is genuinely missing or ambiguous in the data, say so plainly rather than filling it in yourself.
- Keep replies concise and focused on the quotation data.`;

interface RowForContext {
  id: string;
  itemNumber: string | null;
  description: string;
  unit: string | null;
  reqQty: number | null;
  reqRate: number | null;
  reqAmount: number | null;
  quotedQty: number | null;
  quotedRate: number | null;
  quotedAmount: number | null;
  isExcluded: boolean;
  isDeviation: boolean;
}

function formatNum(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return String(n);
}

function buildRowsTable(rows: RowForContext[]): string {
  if (rows.length === 0) return "(No saved quotation items for this contractor yet.)";
  const header =
    "id | item_number | description | unit | requirement_qty | requirement_rate | requirement_amount | quoted_qty | quoted_rate | quoted_amount | flags";
  const lines = rows.map((r) => {
    const diff = r.reqAmount !== null && r.quotedAmount !== null ? r.quotedAmount - r.reqAmount : null;
    const marginPct =
      r.reqRate !== null && r.reqRate !== 0 && r.quotedRate !== null
        ? (((r.reqRate - r.quotedRate) / r.reqRate) * 100).toFixed(2) + "%"
        : "—";
    const flags = [
      r.isExcluded ? "unmatched" : null,
      r.isDeviation ? "qty_deviation" : null,
      diff !== null ? `diff=${diff.toFixed(2)}` : null,
      `margin%=${marginPct}`,
    ]
      .filter(Boolean)
      .join(",");
    return `${r.id} | ${r.itemNumber ?? "—"} | ${r.description.slice(0, 80)} | ${r.unit ?? "—"} | ${formatNum(
      r.reqQty
    )} | ${formatNum(r.reqRate)} | ${formatNum(r.reqAmount)} | ${formatNum(r.quotedQty)} | ${formatNum(
      r.quotedRate
    )} | ${formatNum(r.quotedAmount)} | ${flags}`;
  });
  return [header, ...lines].join("\n");
}

const UPDATE_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    bid_item_id: { type: "string", description: "The exact 'id' of the row from the comparison table." },
    field: {
      type: "string",
      enum: ["quoted_quantity", "quoted_rate", "quoted_amount"],
      description: "Which quoted field to change.",
    },
    new_value: { type: "string", description: "The new numeric value, as a string (e.g. \"450\"). Empty string clears it." },
    reason: { type: "string", description: "One sentence describing why, quoting what the user asked for." },
  },
  required: ["bid_item_id", "field", "new_value", "reason"],
};

export interface ChatTurnResult {
  reply: string;
  actionsApplied: string[];
}

/**
 * Runs one chat turn: loads the current committed comparison data fresh (so
 * the model always sees up-to-date numbers, never a stale cached snapshot),
 * replays recent history, lets Claude call the update tool at most a few
 * times per turn, and returns the final text reply. Every tool call that
 * actually executes goes through the same correctBidItemField() used by the
 * manual review screen, so it's audit-logged exactly the same way.
 */
export async function runQuotationChatTurn(params: {
  tenderId: string;
  submissionId: string;
  tenderTitle: string;
  contractorName: string;
  currency: string;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
}): Promise<ChatTurnResult> {
  const { tenderId, submissionId, tenderTitle, contractorName, currency, history, userMessage } = params;

  const supabase = await createSupabaseServerClient();
  const { data: bidItems } = await supabase
    .from("contractor_bid_items")
    .select("*, tender_requirements(item_number, original_description, unit, quantity, rate, amount)")
    .eq("submission_id", submissionId)
    .eq("committed", true);

  const rows: RowForContext[] = (bidItems ?? []).map((b) => {
    const req = b.tender_requirements as unknown as {
      item_number: string | null;
      original_description: string;
      unit: string | null;
      quantity: number | null;
      rate: number | null;
      amount: number | null;
    } | null;
    return {
      id: b.id,
      itemNumber: req?.item_number ?? null,
      description: req?.original_description ?? "(unmatched row — no tender requirement)",
      unit: req?.unit ?? null,
      reqQty: req?.quantity ?? null,
      reqRate: req?.rate ?? null,
      reqAmount: req?.amount ?? null,
      quotedQty: b.quoted_quantity,
      quotedRate: b.quoted_rate,
      quotedAmount: b.quoted_amount,
      isExcluded: b.is_excluded,
      isDeviation: b.is_deviation,
    };
  });

  const system = SYSTEM_PROMPT_TEMPLATE({
    tenderTitle,
    contractorName,
    currency,
    rowsTable: buildRowsTable(rows),
  });

  const validIds = new Set(rows.map((r) => r.id));
  const actionsApplied: string[] = [];

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content }) as Anthropic.MessageParam),
    { role: "user", content: userMessage },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await getClient().messages.create(
      {
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: "low" },
        system,
        tools: [
          {
            name: UPDATE_TOOL_NAME,
            description: "Changes one quoted field of one bid item. Only call when the user explicitly asked for this exact change.",
            input_schema: UPDATE_TOOL_SCHEMA,
          },
        ],
        tool_choice: { type: "auto" },
        messages,
      },
      { timeout: TIMEOUT_MS }
    );

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");

    if (toolUses.length === 0) {
      return { reply: textBlocks.map((t) => t.text).join("\n").trim() || "(No response.)", actionsApplied };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const input = call.input as { bid_item_id?: string; field?: string; new_value?: string; reason?: string };
      const { bid_item_id, field, new_value, reason } = input;

      if (!bid_item_id || !validIds.has(bid_item_id)) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: "Error: bid_item_id does not match any row in the current comparison table. Do not guess an id — ask the user to clarify which item.",
          is_error: true,
        });
        continue;
      }
      if (field !== "quoted_quantity" && field !== "quoted_rate" && field !== "quoted_amount") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: "Error: field must be one of quoted_quantity, quoted_rate, quoted_amount.",
          is_error: true,
        });
        continue;
      }

      const result = await correctBidItemField(tenderId, bid_item_id, field, new_value ?? "");
      if (result?.error) {
        toolResults.push({ type: "tool_result", tool_use_id: call.id, content: `Error: ${result.error}`, is_error: true });
      } else {
        actionsApplied.push(`${field} on ${bid_item_id} -> ${new_value ?? "(cleared)"} (${reason ?? "no reason given"})`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Updated. ${field} is now ${new_value || "(cleared)"}.`,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply: "I made the changes you asked for but hit the per-turn action limit — ask me to continue if there's more.",
    actionsApplied,
  };
}
