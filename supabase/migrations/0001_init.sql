-- HKIMMS core schema (Phase 1 MVP)
-- Mirrors the design in the IMMS 설계서 (item_master / location_master / department / user /
-- transaction / transaction_detail / shipment). Stock-on-hand is never stored directly —
-- it is always derived from the transaction_detail ledger.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- departments (부서) — IMMS-managed, independent of E-Count
-- ---------------------------------------------------------------------------
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_location_code text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles (사용자) — one row per auth.users, extends Supabase auth
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  department_id uuid references departments (id),
  role text not null default 'field' check (role in ('field', 'admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- locations (창고 마스터) — mirrors E-Count warehouse codes (synced later; seeded by hand for now)
-- ---------------------------------------------------------------------------
create table if not exists locations (
  code text primary key,
  name text not null,
  location_type text not null default 'warehouse' check (location_type in ('warehouse', 'factory', 'external')),
  is_active boolean not null default true,
  synced_at timestamptz
);

-- ---------------------------------------------------------------------------
-- items (품목 마스터) — mirrors E-Count 품목조회, migrated from the existing Excel
-- ---------------------------------------------------------------------------
create table if not exists items (
  item_code text primary key,
  item_name text not null,
  spec text,
  unit text not null default 'EA',
  purchase_type text not null default 'general' check (purchase_type in ('foreign', 'domestic', 'general')),
  supplier text,
  lead_time_days integer,
  moq numeric,
  safety_stock numeric,
  ecount_item_code text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- shipments (택배 전표) — groups multiple transactions under one waybill
-- ---------------------------------------------------------------------------
create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  carrier text,
  tracking_no text,
  dest_location_code text references locations (code),
  recipient text,
  shipped_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- transactions (거래 헤더)
-- txn_type: IN(입고) / PRD(생산불출) / MOV(창고이동) / SHP(택배발송) / RET(반납)
-- Convention: IN has to_location_code only. PRD has from_location_code only.
--             MOV / SHP / RET have both from_location_code and to_location_code.
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  txn_type text not null check (txn_type in ('IN', 'PRD', 'MOV', 'SHP', 'RET')),
  txn_date timestamptz not null default now(),
  from_location_code text references locations (code),
  to_location_code text references locations (code),
  department_id uuid references departments (id),
  requested_by uuid references profiles (id),
  processed_by uuid references profiles (id),
  reason text,
  note text,
  shipment_id uuid references shipments (id),
  ecount_sync_status text not null default 'PENDING' check (ecount_sync_status in ('PENDING', 'SYNCED', 'FAILED', 'SKIPPED')),
  ecount_ref_no text,
  created_at timestamptz not null default now(),
  constraint txn_location_shape check (
    (txn_type = 'IN'  and from_location_code is null     and to_location_code is not null) or
    (txn_type = 'PRD' and from_location_code is not null and to_location_code is null) or
    (txn_type in ('MOV', 'SHP', 'RET') and from_location_code is not null and to_location_code is not null)
  )
);

create index if not exists idx_transactions_txn_date on transactions (txn_date desc);
create index if not exists idx_transactions_type on transactions (txn_type);

-- ---------------------------------------------------------------------------
-- transaction_details (거래 상세 — 품목별 라인, 재고 계산의 원장(ledger))
-- ---------------------------------------------------------------------------
create table if not exists transaction_details (
  id uuid primary key default gen_random_uuid(),
  txn_id uuid not null references transactions (id) on delete cascade,
  item_code text not null references items (item_code),
  qty numeric not null check (qty > 0),
  process text
);

create index if not exists idx_txn_details_txn on transaction_details (txn_id);
create index if not exists idx_txn_details_item on transaction_details (item_code);

-- ---------------------------------------------------------------------------
-- stock ledger + on-hand views — never store stock directly, always derive it
-- ---------------------------------------------------------------------------
create or replace view stock_ledger as
  select td.item_code, t.from_location_code as location_code, -td.qty as delta, t.txn_date
  from transaction_details td
  join transactions t on t.id = td.txn_id
  where t.from_location_code is not null
  union all
  select td.item_code, t.to_location_code as location_code, td.qty as delta, t.txn_date
  from transaction_details td
  join transactions t on t.id = td.txn_id
  where t.to_location_code is not null;

create or replace view stock_by_location as
  select item_code, location_code, sum(delta)::numeric as qty_on_hand
  from stock_ledger
  group by item_code, location_code;

create or replace view stock_total as
  select item_code, sum(delta)::numeric as qty_on_hand
  from stock_ledger
  group by item_code;

-- ---------------------------------------------------------------------------
-- seed: core Icheon-factory locations (matches 설계서 §02)
-- ---------------------------------------------------------------------------
insert into locations (code, name, location_type) values
  ('M2000', '자재창고(이천공장)', 'warehouse'),
  ('2000',  '이천공장', 'factory'),
  ('M2020', '이천공장(원판)', 'factory'),
  ('M2010', '외주공장(고려에스티)', 'factory'),
  ('M2011', '외주공장(우일레이저)', 'factory'),
  ('M2012', '외주공장(성실타공)', 'factory'),
  ('D2000', '불량품창고', 'warehouse'),
  ('A2000', '공장서비스센터', 'warehouse')
on conflict (code) do nothing;

insert into departments (name, default_location_code) values
  ('자재팀', 'M2000'),
  ('생산팀', '2000'),
  ('유통팀', null),
  ('AS팀', 'A2000')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security — single-company internal tool: any signed-in employee
-- can read everything and record transactions; master data (items/locations)
-- is edited by admins only.
-- ---------------------------------------------------------------------------
alter table departments enable row level security;
alter table profiles enable row level security;
alter table locations enable row level security;
alter table items enable row level security;
alter table shipments enable row level security;
alter table transactions enable row level security;
alter table transaction_details enable row level security;

create policy "read all - departments" on departments for select to authenticated using (true);
create policy "read all - locations" on locations for select to authenticated using (true);
create policy "read all - items" on items for select to authenticated using (true);
create policy "read all - shipments" on shipments for select to authenticated using (true);
create policy "read all - transactions" on transactions for select to authenticated using (true);
create policy "read all - transaction_details" on transaction_details for select to authenticated using (true);

create policy "read own profile" on profiles for select to authenticated using (true);
create policy "update own profile" on profiles for update to authenticated using (auth.uid() = id);
create policy "insert own profile" on profiles for insert to authenticated with check (auth.uid() = id);

create policy "field users create transactions" on transactions for insert to authenticated with check (true);
create policy "field users create transaction lines" on transaction_details for insert to authenticated with check (true);
create policy "field users create shipments" on shipments for insert to authenticated with check (true);

-- item/location master: admin-only writes
create policy "admins manage items" on items for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins manage locations" on locations for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admins manage departments" on departments for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
