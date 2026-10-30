-- Extraction now runs as resumable steps (one request handles as many sheets
-- as fit in its time budget; the client keeps calling until done). The lease
-- stops two requests from processing the same upload at once and expires on
-- its own if a request dies mid-step, so a stuck upload can always be resumed.
alter table tender_uploads add column if not exists processing_lease_until timestamptz;
