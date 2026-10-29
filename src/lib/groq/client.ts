import Groq from "groq-sdk";
import { ChunkInterpretationSchema, type ChunkInterpretation } from "./schema";
import { TENDER_EXTRACTION_SYSTEM_PROMPT } from "./prompts";

let client: Groq | null = null;

function getClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured on the server");
  }
  if (!client) {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return client;
}

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const MAX_RETRIES = 3;
const TIMEOUT_MS = 45_000;

export interface ChunkInterpretationResult {
  ok: boolean;
  data: ChunkInterpretation | null;
  error: string | null;
  rawResponse: string | null;
}

/**
 * Sends one bounded chunk to Groq for semantic interpretation and validates
 * the response against the strict schema. Never throws for a bad/invalid
 * model response — returns ok: false so the caller can mark the chunk for
 * review instead of silently losing it.
 */
export async function interpretChunk(userMessage: string): Promise<ChunkInterpretationResult> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const completion = await getClient().chat.completions.create(
        {
          model: MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: TENDER_EXTRACTION_SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        },
        { signal: controller.signal as unknown as AbortSignal }
      );
      clearTimeout(timeout);

      const raw = completion.choices[0]?.message?.content ?? "";
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        lastError = "Model response was not valid JSON";
        continue;
      }

      const result = ChunkInterpretationSchema.safeParse(parsedJson);
      if (!result.success) {
        lastError = `Response failed schema validation: ${result.error.message}`;
        continue;
      }

      return { ok: true, data: result.data, error: null, rawResponse: raw };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : "Unknown Groq API error";
      // Exponential backoff before retrying.
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }

  return { ok: false, data: null, error: lastError, rawResponse: null };
}
