-- ---------------------------------------------------------------------------
-- Adjusts the Phase 3 schema (0007) to match what E-Count's Open API
-- actually returns, confirmed by live-testing against real HK Co. data on
-- 2026-09-10 (see CLAUDE.md "Product architecture" section for the full
-- writeup):
--
-- 1. 발주서조회 (GetPurchasesOrderList) returns ONE ROW PER PO DOCUMENT, not
--    per line — there is no PROD_CD in the response at all, and QTY/BUY_AMT
--    are sums across every item on that PO. purchase_orders therefore moves
--    from "one row per po_no+item_code" to "one row per po_no" (header
--    level). item_code stays as a column (nullable) for a possible future
--    line-level source (e.g. if PO entry ever moves into IMMS itself and
--    pushes to E-Count via SavePurchaseOrder, which DOES have line detail),
--    but the E-Count pull job populates only header fields.
--
-- 2. 거래처조회 doesn't exist (insert-only 거래처등록). Since 발주서조회
--    responses carry CUST(거래처코드)/CUST_DES(거래처명) per PO, the pull job
--    opportunistically upserts a minimal supplier row (code+name only) for
--    every supplier it sees on a PO, instead of a dedicated supplier sync.
--
-- 3. 품목조회 (GetBasicProductsList, already used for the item master sync)
--    carries IN_PRICE (current registered receiving price) on the item
--    record. There's no per-PO price, but this current-value snapshot is a
--    usable (coarser) substitute for a price trend line if pulled and
--    stored periodically — hence the new 'item_master' price_history source.
-- ---------------------------------------------------------------------------

alter table purchase_orders
  drop constraint purchase_orders_po_no_item_code_key;

alter table purchase_orders
  add constraint purchase_orders_po_no_key unique (po_no);

-- No per-line price at header level.
alter table purchase_orders
  alter column unit_price drop not null;

-- P_FLAG from GetPurchasesOrderList: '1' = 진행중, '9' = 종결. Stored as text
-- rather than the raw code so a UI doesn't need to know E-Count's encoding.
alter table purchase_orders
  add column if not exists status text check (status is null or status in ('in_progress', 'closed'));

-- TTL_CTT (제목) from the API — human-readable summary of the PO, e.g.
-- "2026/09/09 -31 엠케이씨 수세미/96다목적(3M)5개/팩 외 8건". Not structured
-- data, just useful for a UI to show something meaningful per row without a
-- line-item breakdown.
alter table purchase_orders
  add column if not exists item_summary text;

alter table purchase_orders
  add column if not exists warehouse_code text,
  add column if not exists warehouse_name text;

comment on column purchase_orders.qty is 'PO-level total quantity across all lines (QTY/발주수량합계 from GetPurchasesOrderList) — not a single item''s quantity.';
comment on column purchase_orders.amount is 'PO-level total supply amount across all lines (BUY_AMT/발주공급가액합계) — not a single item''s amount.';
comment on column purchase_orders.item_code is 'Not populated by the E-Count pull job (발주서조회 has no PROD_CD) — reserved for a future line-level source.';

alter table price_history
  drop constraint price_history_source_check;

alter table price_history
  add constraint price_history_source_check check (source in ('po', 'receipt', 'item_master'));

-- Keep the daily item-master price snapshot idempotent: re-running the pull
-- job the same day updates the existing snapshot instead of duplicating it.
create unique index if not exists uq_price_history_item_snapshot
  on price_history (item_code, effective_date, source);
