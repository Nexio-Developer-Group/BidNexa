-- Lock search_path on trigger function; keep RLS-helper functions executable
-- by anon/authenticated since RLS policies evaluate as the querying role.
alter function set_updated_at() set search_path = public;

revoke execute on function handle_new_auth_user() from anon, authenticated;
revoke execute on function create_organization_for_self(text) from anon;
grant execute on function create_organization_for_self(text) to authenticated;
