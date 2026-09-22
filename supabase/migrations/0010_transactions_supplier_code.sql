-- ---------------------------------------------------------------------------
-- Tier3 PIS dashboard follow-up: Kevin asked for 업체별 구매금액/구매비중,
-- 단일 공급업체 위험, 구매 집중도 — all genuinely blocked until now because
-- IMMS's own transaction ledger (the actual purchasing data source per the
-- 0순위 decision, since E-Count has no 매입 query API) never captured WHO an
-- item was received from. Adds an optional supplier reference to
-- transactions, populated from the mobile 입고(IN) form.
--
-- Nullable and NOT required at the mobile form level on purpose — 입고
-- entry is a field-execution flow meant to take 10-20 seconds (see
-- "Product architecture" at the top of this file), and forcing a supplier
-- pick on every single entry risks people either skipping IMMS entirely or
-- picking the wrong one just to get through the form. A field staying null
-- means "not recorded", which is honest; a wrong value would be worse than
-- a missing one. Analytics built on this column must handle a meaningful
-- fraction of nulls, not assume full coverage.
-- ---------------------------------------------------------------------------

alter table transactions
  add column if not exists supplier_code text references suppliers(code);

create index if not exists transactions_supplier_code_idx on transactions (supplier_code) where supplier_code is not null;
