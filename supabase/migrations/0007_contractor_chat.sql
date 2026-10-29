-- Per-contractor-submission chat: once a quotation is uploaded, questions
-- about it (and explicit, user-requested corrections to quoted values) go
-- through this chat instead of a raw re-upload. Messages are append-only;
-- any value change the assistant makes still goes through the existing
-- contractor_bid_items audit trail (audit_logs), not just the chat log.

create table contractor_chat_messages (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references contractor_submissions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_chat_messages_submission on contractor_chat_messages(submission_id, created_at);

alter table contractor_chat_messages enable row level security;

create policy chat_messages_select on contractor_chat_messages for select using (
  exists (
    select 1 from contractor_submissions s join tenders t on t.id = s.tender_id
    where s.id = submission_id and is_org_member(t.organization_id)
  )
);
create policy chat_messages_insert on contractor_chat_messages for insert with check (
  exists (
    select 1 from contractor_submissions s join tenders t on t.id = s.tender_id
    where s.id = submission_id and is_org_member(t.organization_id)
  )
);
