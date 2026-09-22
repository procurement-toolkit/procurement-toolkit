-- ---------------------------------------------------------------------------
-- Phase 3 (schema step 1 of the "IMMS Web 구매분석 데이터 설계표"):
-- suppliers / purchase_orders / price_history, plus the items-table fields
-- needed to support ABC/reorder-point calculations.
--
-- IMPORTANT — direction of sync is the opposite of transactions.ecount_sync_*:
-- transactions push IMMS-originated events OUT to E-Count (SaveLocationTran).
-- purchase_orders and price_history are IMMS-side CACHES of data that lives
-- authoritatively in E-Count (발주서조회 등) — IMMS reads them in, it doesn't
-- write them back. Hence ecount_synced_at (last successful pull), not a
-- sync-status/ref-no pair.
--
-- The exact E-Count API field names below are our best guess from the
-- "구매/발주/입고" design tab, NOT yet confirmed against E-Count's actual
-- 발주서조회 response — see IMMS_Web_구매분석_데이터설계표.xlsx tab 10.
-- Expect to adjust column names once that API is actually called.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- suppliers (업체 마스터)
-- ---------------------------------------------------------------------------
create table if not exists suppliers (
  code text primary key,
  name text not null,
  is_domestic boolean not null default true,
  country text,
  contact text,
  payment_terms text,
  min_order_amount numeric,
  is_contracted boolean not null default false,
  contract_start date,
  contract_end date,
  ecount_supplier_code text,
  created_at timestamptz not null default now()
);

alter table suppliers enable row level security;

create policy "read all - suppliers"
  on suppliers for select
  using (true);

-- Supplier master is maintained by admins only (mirrors profiles/departments
-- write pattern elsewhere in the app going through the admin service-role
-- client, not a broad authenticated-write policy).
create policy "admins write suppliers"
  on suppliers for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- items: new fields for categorization / ABC / reorder-point support, and a
-- structured link to suppliers alongside the existing free-text column
-- (kept for backward compatibility — see design tab "1_품목마스터").
-- ---------------------------------------------------------------------------
alter table items
  add column if not exists item_category text,
  add column if not exists is_key_item boolean not null default false,
  add column if not exists reorder_point numeric,
  add column if not exists primary_supplier_code text references suppliers (code);

-- ---------------------------------------------------------------------------
-- purchase_orders (구매·발주·입고) — one row per PO line, pulled from
-- E-Count's 발주서조회 (+ receipt data once that API is confirmed).
--
-- *** 2026-09-10 UPDATE — read this before writing a pull job ***
-- Verified live against 발주서조회 (GetPurchasesOrderList) with real HK Co.
-- data (589 POs / 30 days). It works, but it returns ONE ROW PER PO
-- DOCUMENT, not one row per line: qty/amount below (QTY/BUY_AMT/VAT_AMT in
-- the API) are sums across every item on that PO, and the API has no
-- PROD_CD field at all (only a "first item + 외 N건" text summary). So
-- item_code/unit_price on this table CANNOT be filled from this endpoint as
-- currently modeled — only po_no/po_date/supplier_code/amount(as PO total)/
-- requested_delivery_date/buyer are reliably available per PO.
-- See CLAUDE.md "Product architecture" section for the full writeup and
-- options (header-level redesign vs. sourcing item detail some other way).
-- Don't populate item_code/unit_price with guessed/parsed values from
-- PROD_DES — ask Kevin how he wants to resolve this before building the
-- pull job for real.
-- ---------------------------------------------------------------------------
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null,
  po_date date not null,
  supplier_code text references suppliers (code),
  item_code text references items (item_code),
  qty numeric not null check (qty > 0),
  unit_price numeric not null,
  amount numeric not null,
  currency text not null default 'KRW',
  exchange_rate numeric,
  requested_delivery_date date,
  confirmed_delivery_date date,
  actual_receipt_date date,
  receipt_qty numeric,
  purpose text check (purpose is null or purpose in ('생산', 'AS', '지사', '프로젝트', '재고보충', '긴급')),
  buyer text,
  ecount_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (po_no, item_code)
);

create index if not exists idx_po_date on purchase_orders (po_date desc);
create index if not exists idx_po_supplier on purchase_orders (supplier_code);
create index if not exists idx_po_item on purchase_orders (item_code);

alter table purchase_orders enable row level security;

create policy "read all - purchase_orders"
  on purchase_orders for select
  using (true);

-- Written only by the server-side E-Count pull job (service-role client),
-- same pattern as admin user-management writes in src/lib/actions/users.ts.
create policy "admins write purchase_orders"
  on purchase_orders for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- price_history (가격 이력) — one row per observed price point, built from
-- purchase_orders so Price Trend / PPV can query a simple time series
-- without re-deriving it from PO lines every time.
-- ---------------------------------------------------------------------------
create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  item_code text not null references items (item_code),
  supplier_code text references suppliers (code),
  effective_date date not null,
  unit_price numeric not null,
  source text not null default 'po' check (source in ('po', 'receipt')),
  created_at timestamptz not null default now()
);

create index if not exists idx_price_history_item on price_history (item_code, effective_date desc);

alter table price_history enable row level security;

create policy "read all - price_history"
  on price_history for select
  using (true);

create policy "admins write price_history"
  on price_history for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
