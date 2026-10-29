import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ChunkInterpretationSchema, type ChunkInterpretation } from "./schema";
import { TENDER_EXTRACTION_SYSTEM_PROMPT } from "./prompts";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server");
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_RETRIES = 3;
const TIMEOUT_MS = 45_000;

// Forced tool_choice ("any"/"tool") is rejected on Claude Sonnet 5.5, so the
// response schema is declared as a tool and the model is instructed (not
// forced) to call it — `interpretChunk` still fully re-validates the result
// against the Zod schema below, so an off-script response is caught either
// way rather than trusted blindly.
const RESPONSE_TOOL_NAME = "report_extraction";
const RESPONSE_SCHEMA = z.toJSONSchema(ChunkInterpretationSchema, {
  target: "draft-7",
}) as Record<string, unknown>;

export interface ChunkInterpretationResult {
  ok: boolean;
  data: ChunkInterpretation | null;
  error: string | null;
  rawResponse: string | null;
}

/**
 * Sends one bounded chunk to Claude for semantic interpretation and validates
 * the response against the strict schema. Never throws for a bad/invalid
 * model response — returns ok: false so the caller can mark the chunk for
 * review instead of silently losing it.
 */
export async function interpretChunk(userMessage: string): Promise<ChunkInterpretationResult> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getClient().messages.create(
        {
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: "low" },
          system: TENDER_EXTRACTION_SYSTEM_PROMPT,
          tools: [
            {
              name: RESPONSE_TOOL_NAME,
              description:
                "Reports the structured interpretation of this workbook chunk. Always call this tool with the complete result — never reply with plain text.",
              input_schema: RESPONSE_SCHEMA as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "auto" },
          messages: [
            {
              role: "user",
              content: `${userMessage}\n\nRespond by calling the ${RESPONSE_TOOL_NAME} tool with your complete structured result. Do not reply with plain text.`,
            },
          ],
        },
        { timeout: TIMEOUT_MS }
      );

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (!toolUse) {
        lastError = "Model did not call the extraction tool";
        continue;
      }

      const result = ChunkInterpretationSchema.safeParse(toolUse.input);
      if (!result.success) {
        lastError = `Response failed schema validation: ${result.error.message}`;
        continue;
      }

      return { ok: true, data: result.data, error: null, rawResponse: JSON.stringify(toolUse.input) };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        lastError = `Authentication failed: ${err.message}`;
        break; // retrying won't help a bad key
      } else if (err instanceof Anthropic.RateLimitError) {
        lastError = `Rate limited: ${err.message}`;
      } else if (err instanceof Anthropic.APIError) {
        lastError = `API error (${err.status}): ${err.message}`;
      } else {
        lastError = err instanceof Error ? err.message : "Unknown Claude API error";
      }
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }

  return { ok: false, data: null, error: lastError, rawResponse: null };
}
