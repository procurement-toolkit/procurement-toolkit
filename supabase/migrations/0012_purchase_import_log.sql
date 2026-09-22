-- ---------------------------------------------------------------------------
-- Supports the self-service "구매현황 업로드" feature (/admin/purchase-import,
-- src/lib/actions/purchase-import.ts) added 2026-09-17 alongside migration
-- 0011's purchase_records catch-up. Same rationale as ecount_sync_log
-- (migration 0009): an append-only history of every upload attempt, so an
-- admin can see what was actually imported (and what was skipped as
-- duplicate/unparseable) without re-deriving it from purchase_records rows
-- after the fact, and so a bad upload is visible rather than silently
-- absorbed by the on-conflict-do-nothing insert.
-- ---------------------------------------------------------------------------

create table if not exists public.purchase_import_log (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  uploaded_by uuid references public.profiles(id),
  status text not null check (status in ('success', 'error')),
  rows_read integer,
  rows_inserted integer,
  rows_duplicate integer,
  rows_skipped_no_item_code integer,
  rows_parse_failed integer,
  error text,
  detail jsonb,
  run_at timestamptz not null default now()
);

create index if not exists purchase_import_log_run_at_idx
  on public.purchase_import_log (run_at desc);

alter table public.purchase_import_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'purchase_import_log'
      and policyname = 'admins read purchase_import_log'
  ) then
    -- Admin-only read, same reasoning as ecount_sync_log: an operational/
    -- debugging log, not procurement-analytics data meant for every
    -- authenticated user.
    create policy "admins read purchase_import_log"
      on public.purchase_import_log for select
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid() and profiles.role = 'admin'
        )
      );
  end if;
end $$;

-- No insert/update/delete policy for regular roles — every write goes
-- through the upload Server Action's service-role (admin) client, after
-- that action has already verified the caller's profile role is 'admin'.
