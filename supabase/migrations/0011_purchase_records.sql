-- ---------------------------------------------------------------------------
-- Backfills this migration file to match a table that has existed in
-- production since 2026-09-17 but was never captured as a migration.
--
-- Context: Kevin asked (2026-09-07) "구매현황을 지속적으로 반영하려면 어떻게
-- 해야하나" — i.e. how does HK PIS get REAL purchase data, not the
-- estimate-based figures `pis-dashboard.ts` computes from IMMS's own
-- inbound ledger x E-Count's current registered price (see CLAUDE.md
-- 2026-09-11 PIS MVP entry). The real source turned out to be E-Count's own
-- "구매현황" (Purchase Status) UI report — NOT reachable via E-Count's Open
-- API v2 (see the exhaustive endpoint audits in CLAUDE.md, 2026-09-10/11:
-- there is no 매입조회/구매현황조회 endpoint at all) — so Kevin exported it
-- by hand from the ERP as yearly xlsx files (2023–2026, warehouse
-- M2000/자재창고(이천공장)) and this table was built to hold that real,
-- historical purchase data once and for all.
--
-- The table itself (and its RLS policies) was actually created via
-- `mcp__Supabase__apply_migration` on 2026-09-14 under the tool-generated
-- name `purchase_records_from_ecount_purchase_status` (schema_migrations
-- version 20260914003740) — but that call's SQL was never written back into
-- this repo's supabase/migrations/ folder, unlike every other migration
-- here (0001-0010), which is exactly the gap this file fixes. The
-- 18,309-row historical backfill itself ran separately as ~112 chunked
-- `execute_sql` calls against the live DB (this sandbox has no outbound
-- access to *.supabase.co for a bulk client), verified chunk by chunk
-- against a row_hash-existence check — see CLAUDE.md for the full
-- methodology and the chunk 23-25 data-completeness bug found and fixed
-- during that backfill.
--
-- This file's DDL is written to be byte-for-byte equivalent to what's
-- already live (confirmed 2026-09-17 by querying information_schema and
-- pg_policies directly), wrapped defensively (`if not exists` / existence
-- checks) so it is a safe no-op against the production database it's
-- describing, while still being the real, from-scratch definition for a
-- fresh environment (e.g. local `supabase start`). It is intentionally NOT
-- re-applied via apply_migration against the live project (that would just
-- register a redundant duplicate entry in schema_migrations) — this is a
-- repo-parity file only.
--
-- row_hash is what makes this table safely re-importable: every insert (the
-- original backfill AND the new self-service `/admin/purchase-import`
-- upload feature added alongside this migration) ends with
-- `on conflict (row_hash) do nothing`, so re-uploading a period that
-- overlaps already-loaded data is a no-op for those rows rather than a
-- duplicate. See src/lib/purchase-import-parse.ts for the exact hash
-- algorithm (must stay byte-for-byte identical to the original backfill's
-- Python implementation, or new uploads will silently double-count rows
-- that were already loaded).
--
-- item_code carries a hard FK to items(item_code) (confirmed live) — a
-- purchase row for an item E-Count's item master doesn't know about will
-- fail to insert. The upload feature checks for this up front and reports
-- it as a distinct failure reason rather than a bare FK-violation error.
-- ---------------------------------------------------------------------------

create table if not exists public.purchase_records (
  id uuid primary key default gen_random_uuid(),
  item_code text not null references public.items(item_code),
  item_name text not null,
  purchase_date date not null,
  voucher_seq integer not null,
  qty numeric not null,
  unit_price numeric not null,
  supply_amount numeric not null,
  vat_amount numeric not null default 0,
  total_amount numeric not null,
  supplier_name text not null,
  supplier_code text references public.suppliers(code),
  department text,
  note text,
  source_year integer not null,
  row_hash text not null,
  imported_at timestamptz not null default now(),
  constraint purchase_records_row_hash_key unique (row_hash)
);

create index if not exists idx_purchase_records_item_date
  on public.purchase_records (item_code, purchase_date desc);

create index if not exists idx_purchase_records_date
  on public.purchase_records (purchase_date desc);

create index if not exists idx_purchase_records_supplier
  on public.purchase_records (supplier_code)
  where supplier_code is not null;

create index if not exists idx_purchase_records_supplier_name
  on public.purchase_records (supplier_name);

alter table public.purchase_records enable row level security;

-- Same read-all / admin-write shape as suppliers/purchase_orders/price_history
-- (migration 0007) — this is procurement-analytics data every authenticated
-- user can read, but only an admin can write (writes go through the
-- self-service upload feature's service-role action, which checks
-- profiles.role = 'admin' itself before ever touching this table).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'purchase_records'
      and policyname = 'read all - purchase_records'
  ) then
    create policy "read all - purchase_records"
      on public.purchase_records for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'purchase_records'
      and policyname = 'admins write purchase_records'
  ) then
    create policy "admins write purchase_records"
      on public.purchase_records for all
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid() and profiles.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid() and profiles.role = 'admin'
        )
      );
  end if;
end $$;

-- The temporary bulk-backfill RPC function
-- (`bulk_insert_purchase_records_tmp`, created by migration
-- `temp_bulk_insert_purchase_records_rpc` / version 20260914004733) is
-- formally removed by migration 0013_drop_bulk_insert_purchase_records_tmp.sql,
-- not here — see that file for why and its own repo-parity note.
