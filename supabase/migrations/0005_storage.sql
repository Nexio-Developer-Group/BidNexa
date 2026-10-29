insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tender-workbooks', 'tender-workbooks', false, 26214400,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Storage path convention: {organization_id}/{tender_id}/{upload_id}/{filename}
-- so org membership can be checked straight from the path.

create policy storage_tender_workbooks_select on storage.objects for select using (
  bucket_id = 'tender-workbooks'
  and is_org_member((storage.foldername(name))[1]::uuid)
);

create policy storage_tender_workbooks_insert on storage.objects for insert with check (
  bucket_id = 'tender-workbooks'
  and is_org_member((storage.foldername(name))[1]::uuid)
);

create policy storage_tender_workbooks_delete on storage.objects for delete using (
  bucket_id = 'tender-workbooks'
  and org_role_of((storage.foldername(name))[1]::uuid) in ('owner', 'admin')
);
