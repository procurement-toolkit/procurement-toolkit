-- ---------------------------------------------------------------------------
-- Tier1 #4 (PIS/IMMS roadmap, ① Data Integrity): an append-only history of
-- every E-Count sync attempt.
--
-- Until now, sync "history" was a single mutable field
-- (transactions.ecount_sync_status: PENDING/SYNCED/FAILED/SKIPPED) with no
-- record of *when* a flush ran, whether it ran at all, or what happened on
-- runs where nothing needed syncing. This is exactly the shape of gap that
-- caused the 2026-09-10 incident documented in CLAUDE.md: a GitHub Actions
-- cron job reported "Success" for weeks while every single call was
-- actually being redirected to /login before it ever reached the flush
-- logic — there was no independent log to notice from, only the workflow's
-- own (misleading) green checkmark. This table exists so that kind of
-- silent failure is visible from inside the app itself, not just from
-- re-reading GitHub Actions logs by hand.
--
-- Scope: logs attempts from src/lib/ecount-flush.ts's scheduled batch push
-- today (`job = 'transfer_flush'`). The `job` column is free text (not an
-- enum) specifically so a future pull-side job (e.g. runEcountPull,
-- runStockReconciliation) can start writing here too without a migration.
-- ---------------------------------------------------------------------------

create table if not exists ecount_sync_log (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null check (status in ('success', 'error', 'skipped')),
  attempted int,
  synced int,
  failed int,
  error text,
  detail jsonb,
  run_at timestamptz not null default now()
);

create index if not exists ecount_sync_log_job_run_at_idx on ecount_sync_log (job, run_at desc);

alter table ecount_sync_log enable row level security;

-- Admin-only read (this is an operational/debugging log, not
-- procurement-analytics data meant for every authenticated user, unlike
-- suppliers/purchase_orders/price_history's "read all" policy).
create policy "admins read ecount_sync_log"
  on ecount_sync_log for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- No insert/update/delete policy for regular authenticated roles at all —
-- every write goes through the admin (service-role) client from the cron
-- route, which bypasses RLS entirely, exactly like transactions.ecount_*
-- fields are only ever written by that same service-role path today.
