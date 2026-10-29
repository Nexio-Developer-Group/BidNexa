-- BidNexa Row Level Security policies (migration 0002)

alter table profiles enable row level security;
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table tenders enable row level security;
alter table tender_uploads enable row level security;
alter table workbook_sheets enable row level security;
alter table source_cells enable row level security;
alter table extraction_jobs enable row level security;
alter table extraction_issues enable row level security;
alter table tender_sections enable row level security;
alter table tender_requirements enable row level security;
alter table contractors enable row level security;
alter table contractor_submissions enable row level security;
alter table contractor_bid_items enable row level security;
alter table audit_logs enable row level security;

-- profiles: users manage their own profile; org members can read each other's basic profile
create policy profiles_self_select on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());
create policy profiles_self_insert on profiles for insert with check (id = auth.uid());
create policy profiles_org_peers_select on profiles for select using (
  exists (
    select 1 from organization_members m1
    join organization_members m2 on m1.organization_id = m2.organization_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  )
);

-- organizations: members can read; owner can update
create policy orgs_member_select on organizations for select using (is_org_member(id));
create policy orgs_owner_update on organizations for update using (owner_id = auth.uid());
create policy orgs_insert_self on organizations for insert with check (owner_id = auth.uid());

-- organization_members: members of the org can see the roster; owner/admin manage membership
create policy org_members_select on organization_members for select using (is_org_member(organization_id));
create policy org_members_manage on organization_members for all using (
  org_role_of(organization_id) in ('owner', 'admin')
) with check (
  org_role_of(organization_id) in ('owner', 'admin')
);
create policy org_members_self_insert on organization_members for insert with check (
  user_id = auth.uid() and not exists (select 1 from organizations o where o.id = organization_id)
);

-- tenders: scoped to org membership
create policy tenders_select on tenders for select using (is_org_member(organization_id));
create policy tenders_insert on tenders for insert with check (
  is_org_member(organization_id) and org_role_of(organization_id) in ('owner','admin','member')
);
create policy tenders_update on tenders for update using (
  is_org_member(organization_id) and org_role_of(organization_id) in ('owner','admin','member')
);
create policy tenders_delete on tenders for delete using (
  org_role_of(organization_id) in ('owner','admin')
);

-- tender_uploads: via parent tender's org
create policy uploads_select on tender_uploads for select using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);
create policy uploads_insert on tender_uploads for insert with check (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);
create policy uploads_update on tender_uploads for update using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);

-- workbook_sheets / source_cells / extraction_jobs / extraction_issues: via upload -> tender -> org
create policy sheets_select on workbook_sheets for select using (
  exists (
    select 1 from tender_uploads u join tenders t on t.id = u.tender_id
    where u.id = upload_id and is_org_member(t.organization_id)
  )
);
create policy sheets_insert on workbook_sheets for insert with check (
  exists (
    select 1 from tender_uploads u join tenders t on t.id = u.tender_id
    where u.id = upload_id and is_org_member(t.organization_id)
  )
);
create policy sheets_update on workbook_sheets for update using (
  exists (
    select 1 from tender_uploads u join tenders t on t.id = u.tender_id
    where u.id = upload_id and is_org_member(t.organization_id)
  )
);

create policy source_cells_select on source_cells for select using (
  exists (
    select 1 from workbook_sheets s
    join tender_uploads u on u.id = s.upload_id
    join tenders t on t.id = u.tender_id
    where s.id = sheet_id and is_org_member(t.organization_id)
  )
);
create policy source_cells_insert on source_cells for insert with check (
  exists (
    select 1 from workbook_sheets s
    join tender_uploads u on u.id = s.upload_id
    join tenders t on t.id = u.tender_id
    where s.id = sheet_id and is_org_member(t.organization_id)
  )
);

create policy jobs_select on extraction_jobs for select using (
  exists (select 1 from tender_uploads u join tenders t on t.id = u.tender_id where u.id = upload_id and is_org_member(t.organization_id))
);
create policy jobs_insert on extraction_jobs for insert with check (
  exists (select 1 from tender_uploads u join tenders t on t.id = u.tender_id where u.id = upload_id and is_org_member(t.organization_id))
);
create policy jobs_update on extraction_jobs for update using (
  exists (select 1 from tender_uploads u join tenders t on t.id = u.tender_id where u.id = upload_id and is_org_member(t.organization_id))
);

create policy issues_select on extraction_issues for select using (
  exists (select 1 from tender_uploads u join tenders t on t.id = u.tender_id where u.id = upload_id and is_org_member(t.organization_id))
);
create policy issues_insert on extraction_issues for insert with check (
  exists (select 1 from tender_uploads u join tenders t on t.id = u.tender_id where u.id = upload_id and is_org_member(t.organization_id))
);
create policy issues_update on extraction_issues for update using (
  exists (select 1 from tender_uploads u join tenders t on t.id = u.tender_id where u.id = upload_id and is_org_member(t.organization_id))
);

-- tender_sections / tender_requirements: via tender -> org
create policy sections_select on tender_sections for select using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);
create policy sections_insert on tender_sections for insert with check (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);
create policy sections_update on tender_sections for update using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);

create policy requirements_select on tender_requirements for select using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);
create policy requirements_insert on tender_requirements for insert with check (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);
create policy requirements_update on tender_requirements for update using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);

-- contractors: org scoped
create policy contractors_select on contractors for select using (is_org_member(organization_id));
create policy contractors_insert on contractors for insert with check (is_org_member(organization_id));
create policy contractors_update on contractors for update using (is_org_member(organization_id));

-- contractor_submissions / bid_items: via tender -> org
create policy submissions_select on contractor_submissions for select using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);
create policy submissions_insert on contractor_submissions for insert with check (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);
create policy submissions_update on contractor_submissions for update using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);

create policy bid_items_select on contractor_bid_items for select using (
  exists (
    select 1 from contractor_submissions s join tenders t on t.id = s.tender_id
    where s.id = submission_id and is_org_member(t.organization_id)
  )
);
create policy bid_items_insert on contractor_bid_items for insert with check (
  exists (
    select 1 from contractor_submissions s join tenders t on t.id = s.tender_id
    where s.id = submission_id and is_org_member(t.organization_id)
  )
);
create policy bid_items_update on contractor_bid_items for update using (
  exists (
    select 1 from contractor_submissions s join tenders t on t.id = s.tender_id
    where s.id = submission_id and is_org_member(t.organization_id)
  )
);

-- audit_logs: readable by org members, insert-only (no update/delete policy -> blocked by default)
create policy audit_select on audit_logs for select using (organization_id is null or is_org_member(organization_id));
create policy audit_insert on audit_logs for insert with check (organization_id is null or is_org_member(organization_id));
