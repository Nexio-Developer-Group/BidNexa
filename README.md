# BidNexa

AI-assisted tender intelligence, BOQ management, and contractor bid comparison.

> Every Tender. Every Item. Every Detail. Under Control.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4
- Supabase (Postgres, Auth, Storage) with Row Level Security
- Claude (via `@anthropic-ai/sdk`) for bounded, schema-validated workbook interpretation
- ExcelJS for deterministic workbook parsing
- Zod for strict validation of AI output

## Environment variables

See `.env.example`. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `ANTHROPIC_API_KEY`
are already set in `.env.local` for this project (that file is gitignored — never commit it).
`ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5`; check the Anthropic docs if that model is later
renamed/retired.

## Running locally

```bash
npm install
npm run dev
```

## Tests

```bash
npm test    # unit tests for the deterministic parser + formula engine (no network/DB required)
npm run build  # also runs the full TypeScript check
```

`npm test` covers the highest-risk, hand-written logic: formula evaluation (precedence, SUM ranges,
division-by-zero, unsupported functions), worksheet manifesting (hidden/empty sheets never silently
dropped), merged-cell handling, and the "never fabricate a missing value" guarantee. It intentionally
does **not** hit Claude or Supabase — that was instead verified with a live end-to-end run (sign-in →
create tender → upload a BOQ with merged headers, a hidden notes sheet, an empty sheet, and formulas
with and without cached results → AI interpretation → review → contractor quote upload with a
quantity deviation and an unmatched item → comparison totals), which produced correct
amounts, correctly flagged the deviation, and correctly left two formula-dependent cells "unavailable"
rather than inventing a result for an upstream formula with no cached value.

## Architecture notes

- **Extraction pipeline** (`src/lib/excel`, `src/lib/claude`, `src/lib/validation`): deterministic
  ExcelJS parsing → per-sheet chunked Claude interpretation (schema-validated, never trusted blindly) →
  structural/semantic/financial validation → **draft persistence**. Every worksheet gets a manifest
  row even if empty, hidden, or failed; nothing is marked "complete" while blocking issues are open.
- **Draft/commit staging**: extraction never writes directly into the "real" BOQ or comparison. Both
  `tender_requirements` and `contractor_bid_items` carry a `committed` flag (default `false`) plus the
  `upload_id` that produced them. A dedicated review screen — `/tenders/[id]/review` for the tender's
  own requirement sheet, `/tenders/[id]/contractors/[submissionId]/review` for a contractor's quoted
  sheet — shows only that upload's draft rows next to any flagged issues, lets the user correct fields
  inline, and only an explicit **Save to DB** action flips `committed = true`. The BOQ page, the
  comparison dashboard, and reports all filter on `committed = true`, so nothing counts until a human
  has reviewed and saved it.
- **Contractor sheets go through the same AI pipeline as the tender sheet** (`runContractorExtractionPipeline`
  in `src/lib/validation/pipeline.ts`): deterministic parse → Claude interpretation → row mapping, then
  matched against the tender's own *committed* requirements by item number first, description second
  (`src/lib/validation/bid-matching.ts`). Unmatched rows and quantity deviations are raised as
  `extraction_issues` exactly like the tender side, not silently dropped.
- **Source fidelity**: `source_cells` is an append-only archive of every populated cell (value, type,
  formula, cached result, independently recalculated result via a constrained formula engine that
  only evaluates arithmetic/SUM over known cells — never arbitrary code). Corrections made in a review
  screen update the draft row but are audit-logged and never touch `source_cells`.
- **RLS**: every table is organization-scoped via `is_org_member()` / `org_role_of()`; storage objects
  are scoped by the organization ID encoded in the object path.

## Known gaps vs. the full spec

- Anthropic enforces per-account rate limits; a sheet (tender or contractor) that fails interpretation
  because of one is correctly flagged as an `extraction_issue` / `partially_processed` upload rather
  than silently producing nothing. Reprocessing (`/api/tenders/[id]/uploads/[uploadId]/process` with `reset`)
  picks it back up once the limit clears, reusing the stored file.
- PDF export is not implemented — only Excel (BOQ export, contractor comparison). Excel covers the
  spec's reporting requirement; PDF would be an additive follow-up.
- The automated adversarial-workbook test suite in the spec (16 named cases) is covered in spirit by
  the unit tests plus the live smoke run above, not as 16 discrete fixture files. Hidden sheets, empty
  sheets, merged headers, missing values, and formula/cached-result mismatches are explicitly tested;
  malicious-instruction-in-cell-text and LLM-timeout/invalid-JSON paths are handled in code (Rule 9 of
  the system prompt; `interpretChunk`'s retry/validation loop) but not yet exercised by a dedicated
  fixture.
- No background job queue — large workbook processing runs synchronously inside the upload request
  (bounded by `maxDuration` on the route handler). Fine for the workbook sizes tested; a genuinely
  huge BOQ would want a queue.
