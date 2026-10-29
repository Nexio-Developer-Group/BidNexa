-- BidNexa canonical schema (migration 0001)
-- Fixed, version-controlled schema per product spec section 6.

create extension if not exists "pgcrypto";

-- ===================================================================
-- IDENTITY & ORGANIZATIONS
-- ===================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type org_role as enum ('owner', 'admin', 'member', 'viewer');

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index idx_org_members_user on organization_members(user_id);
create index idx_org_members_org on organization_members(organization_id);

-- helper: is the current user a member of org X (security-definer to avoid RLS recursion)
create or replace function is_org_member(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function org_role_of(target_org uuid)
returns org_role
language sql
security definer
set search_path = public
stable
as $$
  select role from organization_members m
  where m.organization_id = target_org and m.user_id = auth.uid()
  limit 1;
$$;

-- ===================================================================
-- TENDERS
-- ===================================================================

create type tender_status as enum ('draft', 'processing', 'review_required', 'active', 'completed', 'archived');

create table tenders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  reference_number text,
  client_name text,
  location text,
  currency text not null default 'INR',
  deadline date,
  notes text,
  status tender_status not null default 'draft',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tenders_org on tenders(organization_id);
create index idx_tenders_status on tenders(status);

-- ===================================================================
-- UPLOADS & EXTRACTION PIPELINE
-- ===================================================================

create type upload_status as enum (
  'uploaded', 'queued', 'parsing', 'ai_interpretation', 'validation_required',
  'partially_processed', 'failed', 'ready_for_review', 'approved', 'completed_with_warnings'
);

create table tender_uploads (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  original_filename text not null,
  storage_path text not null,
  file_hash text not null,
  file_size_bytes bigint not null,
  parser_version text not null default '1.0.0',
  status upload_status not null default 'uploaded',
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tender_id, file_hash)
);

create index idx_uploads_tender on tender_uploads(tender_id);

create type sheet_processing_status as enum ('pending', 'processing', 'processed', 'failed', 'skipped_empty');
create type sheet_validation_status as enum ('pending', 'valid', 'warnings', 'invalid');

create table workbook_sheets (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references tender_uploads(id) on delete cascade,
  sheet_name text not null,
  position int not null,
  is_hidden boolean not null default false,
  used_range text,
  populated_cell_count int not null default 0,
  formula_cell_count int not null default 0,
  merged_cell_ranges jsonb not null default '[]'::jsonb,
  extracted_row_count int not null default 0,
  extracted_column_count int not null default 0,
  processed_row_count int not null default 0,
  processed_cell_count int not null default 0,
  processing_status sheet_processing_status not null default 'pending',
  validation_status sheet_validation_status not null default 'pending',
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (upload_id, sheet_name, position)
);

create index idx_sheets_upload on workbook_sheets(upload_id);

-- Immutable source-cell archive: one row per meaningful cell, never mutated after insert.
create table source_cells (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references workbook_sheets(id) on delete cascade,
  cell_address text not null,         -- e.g. "C9"
  row_index int not null,
  column_index int not null,
  value_text text,                    -- original raw value, stringified, never rewritten
  value_type text not null,           -- 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'blank' | 'error'
  original_formula text,
  cached_formula_result text,
  recalculated_result text,
  calculation_status text not null default 'not_applicable', -- not_applicable | ok | mismatch | unavailable
  number_format text,
  is_merged_anchor boolean not null default false,
  merge_range text,
  created_at timestamptz not null default now(),
  unique (sheet_id, cell_address)
);

create index idx_source_cells_sheet on source_cells(sheet_id);
create index idx_source_cells_sheet_row on source_cells(sheet_id, row_index);

create type extraction_stage as enum (
  'manifest', 'deterministic_parse', 'ai_interpretation', 'structural_validation',
  'semantic_validation', 'financial_validation', 'human_review', 'persisted'
);
create type extraction_job_status as enum ('pending', 'running', 'succeeded', 'failed', 'partially_succeeded');

create table extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references tender_uploads(id) on delete cascade,
  stage extraction_stage not null default 'manifest',
  status extraction_job_status not null default 'pending',
  total_chunks int not null default 0,
  processed_chunks int not null default 0,
  failed_chunks int not null default 0,
  retry_count int not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_extraction_jobs_upload on extraction_jobs(upload_id);

create type issue_severity as enum ('info', 'warning', 'error', 'blocking');
create type issue_review_status as enum ('open', 'approved', 'corrected', 'rejected', 'deferred');

create table extraction_issues (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references tender_uploads(id) on delete cascade,
  sheet_id uuid references workbook_sheets(id) on delete set null,
  requirement_id uuid,  -- set after persistence, nullable FK added below
  source_reference text,          -- e.g. "Sheet1!C9" or "Sheet1!rows 5-6"
  issue_type text not null,       -- 'missing_value' | 'ambiguous_classification' | 'formula_mismatch' | ...
  severity issue_severity not null default 'warning',
  original_value text,
  proposed_interpretation text,
  reason text,
  review_status issue_review_status not null default 'open',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_issues_upload on extraction_issues(upload_id);
create index idx_issues_review_status on extraction_issues(review_status);

-- ===================================================================
-- TENDER STRUCTURE (canonical, stable)
-- ===================================================================

create table tender_sections (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  sheet_id uuid references workbook_sheets(id) on delete set null,
  original_section_name text not null,
  source_order int not null default 0,
  parent_section_id uuid references tender_sections(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_sections_tender on tender_sections(tender_id);

create type requirement_row_type as enum ('item', 'subtotal', 'grand_total', 'note', 'deduction', 'adjustment');
create type field_status as enum ('present', 'missing', 'ambiguous', 'formula_unresolved');

create table tender_requirements (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  section_id uuid references tender_sections(id) on delete set null,
  sheet_id uuid references workbook_sheets(id) on delete set null,
  source_row int,
  source_cell_refs jsonb not null default '{}'::jsonb, -- {item_no: "B9", description: "C9", unit: "D9", qty: "E9", rate: "F9", amount: "G9"}
  row_type requirement_row_type not null default 'item',
  item_number text,                 -- original, preserved as text (leading zeros etc.)
  original_description text not null,
  normalized_description text,
  unit text,
  quantity numeric(18,4),
  quantity_status field_status not null default 'present',
  rate numeric(18,4),
  rate_status field_status not null default 'present',
  amount numeric(18,4),
  amount_status field_status not null default 'present',
  amount_formula text,
  amount_formula_cached_result numeric(18,4),
  amount_recalculated numeric(18,4),
  calculation_discrepancy boolean not null default false,
  mapping_confidence numeric(4,3),
  custom_attributes jsonb not null default '{}'::jsonb,
  approved boolean not null default false,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_requirements_tender on tender_requirements(tender_id);
create index idx_requirements_section on tender_requirements(section_id);

alter table extraction_issues
  add constraint fk_issues_requirement foreign key (requirement_id) references tender_requirements(id) on delete set null;

-- ===================================================================
-- CONTRACTORS & BIDS
-- ===================================================================

create table contractors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index idx_contractors_org on contractors(organization_id);

create type submission_status as enum ('invited', 'uploaded', 'processing', 'review_required', 'approved');

create table contractor_submissions (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  contractor_id uuid not null references contractors(id) on delete cascade,
  upload_id uuid references tender_uploads(id) on delete set null,
  status submission_status not null default 'invited',
  total_quoted_amount numeric(18,2),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tender_id, contractor_id)
);

create index idx_submissions_tender on contractor_submissions(tender_id);

create table contractor_bid_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references contractor_submissions(id) on delete cascade,
  requirement_id uuid references tender_requirements(id) on delete set null,
  quoted_quantity numeric(18,4),
  quoted_rate numeric(18,4),
  quoted_amount numeric(18,4),
  is_excluded boolean not null default false,
  is_deviation boolean not null default false,
  deviation_note text,
  source_cell_refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (submission_id, requirement_id)
);

create index idx_bid_items_submission on contractor_bid_items(submission_id);
create index idx_bid_items_requirement on contractor_bid_items(requirement_id);

-- ===================================================================
-- AUDIT LOG
-- ===================================================================

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_org on audit_logs(organization_id);
create index idx_audit_entity on audit_logs(entity_type, entity_id);

-- ===================================================================
-- updated_at triggers
-- ===================================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger trg_orgs_updated before update on organizations for each row execute function set_updated_at();
create trigger trg_tenders_updated before update on tenders for each row execute function set_updated_at();
create trigger trg_uploads_updated before update on tender_uploads for each row execute function set_updated_at();
create trigger trg_jobs_updated before update on extraction_jobs for each row execute function set_updated_at();
create trigger trg_requirements_updated before update on tender_requirements for each row execute function set_updated_at();
