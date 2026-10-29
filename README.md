# BidNexa

AI-assisted tender intelligence, BOQ management, and contractor bid comparison.

> Every Tender. Every Item. Every Detail. Under Control.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS v4
- Supabase (Postgres, Auth, Storage) with Row Level Security
- Groq (via `groq-sdk`) for bounded, schema-validated workbook interpretation
- ExcelJS for deterministic workbook parsing and report generation
- Zod for strict validation of AI output

## Environment variables

See `.env.example`. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are already set in
`.env.local` for the provisioned project. `GROQ_API_KEY` is read from the container/host environment
— it is deliberately not duplicated into a file. `GROQ_MODEL` defaults to `openai/gpt-oss-120b`; check
`GET /v1/models` on your Groq account if that model is later renamed/retired.

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
does **not** hit Groq or Supabase — that was instead verified with a live end-to-end run (sign-in →
create tender → upload a BOQ with merged headers, a hidden notes sheet, an empty sheet, and formulas
with and without cached results → AI interpretation → review → contractor quote upload with a
quantity deviation and an unmatched item → comparison totals → Excel export), which produced correct
amounts, correctly flagged the deviation, and correctly left two formula-dependent cells "unavailable"
rather than inventing a result for an upstream formula with no cached value.

## Architecture notes

- **Extraction pipeline** (`src/lib/excel`, `src/lib/groq`, `src/lib/validation`): deterministic
  ExcelJS parsing → per-sheet chunked Groq interpretation (schema-validated, never trusted blindly) →
  structural/semantic/financial validation → persistence. Every worksheet gets a manifest row even if
  empty, hidden, or failed; nothing is marked "complete" while blocking issues are open.
- **Source fidelity**: `source_cells` is an append-only archive of every populated cell (value, type,
  formula, cached result, independently recalculated result via a constrained formula engine that
  only evaluates arithmetic/SUM over known cells — never arbitrary code). Corrections made in the BOQ
  review UI update `tender_requirements` but are audit-logged and never touch `source_cells`.
- **Contractor bid matching** (`src/lib/validation/bid-matching.ts`) is deterministic, not AI-driven:
  it locates the contractor workbook's header row by keyword, then matches rows to tender requirements
  by item number first, description similarity second. This is a v1 heuristic — it assumes the
  contractor's BOQ roughly mirrors the tender's own item structure, which is the common case but not
  universal.
- **RLS**: every table is organization-scoped via `is_org_member()` / `org_role_of()`; storage objects
  are scoped by the organization ID encoded in the object path.

## Known gaps vs. the full spec

- Contractor bid import is deterministic/header-matched rather than AI-assisted (see above). A future
  pass could route contractor sheets through the same Groq pipeline as tender sheets for looser-shaped
  quotations.
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
