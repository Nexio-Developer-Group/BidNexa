-- Draft/commit staging: extraction writes draft rows; nothing is "real" (shown
-- in the BOQ, comparisons, or reports) until the user explicitly reviews and
-- saves. Existing rows are backfilled to committed so already-active tenders
-- keep working.

alter table tender_requirements add column committed boolean not null default false;
alter table contractor_bid_items add column committed boolean not null default false;

update tender_requirements set committed = true;
update contractor_bid_items set committed = true;

create index idx_requirements_upload_commit on tender_requirements(sheet_id, committed);
create index idx_bid_items_submission_commit on contractor_bid_items(submission_id, committed);

alter table tender_requirements add column upload_id uuid references tender_uploads(id) on delete set null;
alter table contractor_bid_items add column upload_id uuid references tender_uploads(id) on delete set null;

create index idx_requirements_upload on tender_requirements(upload_id);
create index idx_bid_items_upload on contractor_bid_items(upload_id);

alter type submission_status add value if not exists 'draft_review';
