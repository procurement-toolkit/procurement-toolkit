-- Supabase's own audit trail (auth.audit_log_entries) turned out to be
-- empty on this project/GoTrue version — the 0003 login_history view over
-- it never returns rows even after confirmed logins. Track logins
-- ourselves instead: a real row the app writes and controls.

drop view if exists public.login_history;

create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_login_events_user on login_events (user_id, created_at desc);

alter table login_events enable row level security;

create policy "insert own login event" on login_events for insert to authenticated
  with check (auth.uid() = user_id);

create policy "admins read login events" on login_events for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
