import { z } from "zod";

// Structured output contract for the Groq interpretation service.
// Every field is either a direct copy of source data (with its coordinates)
// or an explicit classification/confidence — nothing is allowed to silently
// invent a value. Unknown/missing fields must be null, never fabricated.

export const RowClassification = z.enum([
  "header",
  "section",
  "item",
  "subtotal",
  "grand_total",
  "note",
  "deduction",
  "adjustment",
  "unknown",
]);

export const CustomFieldSchema = z.object({
  name: z.string(),
  value: z.string().nullable(),
  source_cell: z.string().nullable(),
});

export const InterpretedRowSchema = z.object({
  row_index: z.number().int(),
  classification: RowClassification,
  section_name: z.string().nullable(),
  item_number: z.string().nullable(),
  item_number_cell: z.string().nullable(),
  description: z.string().nullable(),
  description_cell: z.string().nullable(),
  unit: z.string().nullable(),
  unit_cell: z.string().nullable(),
  quantity_value: z.string().nullable(),
  quantity_cell: z.string().nullable(),
  rate_value: z.string().nullable(),
  rate_cell: z.string().nullable(),
  amount_value: z.string().nullable(),
  amount_cell: z.string().nullable(),
  amount_formula_cell: z.string().nullable(),
  mapping_confidence: z.number().min(0).max(1),
  is_ambiguous: z.boolean(),
  reason: z.string().nullable(),
  custom_fields: z.array(CustomFieldSchema).default([]),
});

export const ChunkInterpretationSchema = z.object({
  upload_id: z.string(),
  sheet_name: z.string(),
  chunk_index: z.number().int(),
  rows: z.array(InterpretedRowSchema),
  unresolved_row_indexes: z.array(z.number().int()).default([]),
  notes: z.string().nullable().default(null),
  // Advisory only: some models omit this field even on an otherwise valid,
  // fully-classified response. Defaulting to true (rather than requiring it)
  // avoids rejecting an entire chunk over missing metadata — the operative
  // incompleteness signal is unresolved_row_indexes, not this flag.
  complete: z.boolean().default(true),
});

export type ChunkInterpretation = z.infer<typeof ChunkInterpretationSchema>;
export type InterpretedRow = z.infer<typeof InterpretedRowSchema>;
