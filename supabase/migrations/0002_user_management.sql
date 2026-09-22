-- HKIMMS user management (Phase 1 add-on)
-- Adds an admin-managed employee directory on top of Supabase Auth:
--   - email column so the admin dashboard can list/search users without
--     needing service-role access to auth.users
--   - is_active flag so an admin can revoke access ("assign 해제") without
--     deleting the account/losing the audit trail on past transactions
--     (transactions.requested_by / processed_by reference profiles(id)
--     with no cascade, so hard-deleting a profile with history would fail)

alter table profiles add column if not exists email text;
alter table profiles add column if not exists is_active boolean not null default true;

-- backfill email for any profile created before this column existed
-- (e.g. the admin account created directly in the Supabase dashboard)
update profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

alter table profiles alter column email set not null;

create unique index if not exists idx_profiles_email on profiles (email);

-- allow admins to update ANY profile (existing "update own profile" policy
-- only covers auth.uid() = id; this adds the admin-toggle case used by the
-- admin dashboard's activate/deactivate control)
create policy "admins update any profile" on profiles for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
