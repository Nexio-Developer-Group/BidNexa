-- Several tables had RLS enabled with select/insert/update policies but no
-- delete policy. Postgres RLS defaults to deny when no policy exists for the
-- action, so every app-level .delete() call against these tables has been
-- silently matching zero rows (no error — delete "succeeds" but nothing is
-- removed). This broke: removing a contractor from a tender
-- (contractor_submissions), clearing a stuck/replaced upload's prior data
-- (workbook_sheets, tender_requirements, tender_sections, extraction_issues,
-- contractor_bid_items), and deleting the superseded tender_uploads row on
-- replace/re-upload. The last one also explains repeated reprocess failures:
-- old workbook_sheets rows for the same upload_id were never actually
-- cleared, so re-inserting a sheet with the same (upload_id, sheet_name,
-- position) hit the unique constraint and surfaced as a silent sheet
-- failure with no useful error.

create policy uploads_delete on tender_uploads for delete using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);

create policy sheets_delete on workbook_sheets for delete using (
  exists (
    select 1 from tender_uploads u join tenders t on t.id = u.tender_id
    where u.id = upload_id and is_org_member(t.organization_id)
  )
);

create policy issues_delete on extraction_issues for delete using (
  exists (select 1 from tender_uploads u join tenders t on t.id = u.tender_id where u.id = upload_id and is_org_member(t.organization_id))
);

create policy sections_delete on tender_sections for delete using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);

create policy requirements_delete on tender_requirements for delete using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);

create policy submissions_delete on contractor_submissions for delete using (
  exists (select 1 from tenders t where t.id = tender_id and is_org_member(t.organization_id))
);

create policy bid_items_delete on contractor_bid_items for delete using (
  exists (
    select 1 from contractor_submissions s join tenders t on t.id = s.tender_id
    where s.id = submission_id and is_org_member(t.organization_id)
  )
);

create policy chat_messages_delete on contractor_chat_messages for delete using (
  exists (
    select 1 from contractor_submissions s join tenders t on t.id = s.tender_id
    where s.id = submission_id and is_org_member(t.organization_id)
  )
);
