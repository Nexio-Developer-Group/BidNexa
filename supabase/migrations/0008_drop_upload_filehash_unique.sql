-- The (tender_id, file_hash) uniqueness on tender_uploads was meant to stop
-- re-uploading the tender's own identical BOQ file twice. tender_uploads is
-- also where contractor quotation uploads land (same table, same tender_id),
-- so two different contractors uploading byte-identical quotation files, or
-- a contractor re-uploading the same file to replace their own quotation,
-- collides with this constraint even though both are legitimate. "Only one
-- BOQ per tender" and "only one quotation per contractor" are already
-- enforced at the application layer (existence checks before insert), so
-- this DB-level hash constraint is now redundant and actively wrong.
alter table tender_uploads drop constraint tender_uploads_tender_id_file_hash_key;
