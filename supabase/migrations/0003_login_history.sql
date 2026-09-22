-- Expose Supabase Auth's login/logout audit trail through a plain view in the
-- public schema, so the admin dashboard's service-role client can query it
-- like any other table. auth.audit_log_entries itself lives in a schema that
-- isn't exposed to PostgREST; this view re-shapes just the fields we need.
--
-- Views default to running with their owner's privileges (not the querying
-- role's), which is what lets a view here read the auth schema at all.
create or replace view public.login_history as
select
  (payload ->> 'actor_id')::uuid as user_id,
  payload ->> 'actor_username' as email,
  payload ->> 'action' as action,
  created_at
from auth.audit_log_entries
where payload ->> 'action' in ('login', 'logout')
order by created_at desc;
