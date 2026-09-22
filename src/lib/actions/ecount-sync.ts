"use server";

// Admin-triggered pull from E-Count into IMMS's procurement-analytics tables
// (suppliers/purchase_orders/price_history + a few items columns). This is
// the PULL direction — opposite of src/lib/ecount-flush.ts's scheduled
// batch flush, which PUSHES IMMS transfer events out to E-Count. See
// CLAUDE.md "Product architecture" for the full writeup of what each
// E-Count endpoint does and doesn't give us; the short version:
//
// - 발주서조회 (GetPurchasesOrderList) is PO-HEADER level — no item code, no
//   per-line price. We can only populate po_no/po_date/supplier/status/
//   totals/requested delivery date per PO, plus opportunistically build up
//   the suppliers table from CUST/CUST_DES on each PO (there is no
//   dedicated 거래처조회 endpoint at all).
// - 품목조회 (GetBasicProductsList) is now the ONLY source that creates rows
//   in `items` at all (2026-09-10 — see CLAUDE.md for why: there was no
//   other path, mobile IMMS's item pickers were silently empty until this
//   ran). It upserts identity (item_code/item_name) first so every E-Count
//   SKU exists locally, then layers on MIN_QTY/IN_TERM (safe, unambiguous
//   numeric fields) and IN_PRICE (current registered receiving price, which
//   we snapshot into price_history as a coarser substitute for real PPV).
//   Its CUST ("구매처") field is NOT used here — unlike 발주서조회's CUST,
//   which is documented as the actual 거래처코드, 품목조회's 구매처 is a
//   free-text field on the item master with no guarantee it matches a real
//   supplier code, so wiring it into items.primary_supplier_code risks
//   polluting the supplier list with inconsistent free text. Leave that for
//   a future decision instead of guessing.
//
// 2026-09-11 (Tier2 #5): the actual pull logic now lives in
// src/lib/ecount-pull.ts (runEcountPullCore), NOT here — this file is just
// the authenticated wrapper the admin "지금 동기화" button calls. It moved
// out because a scheduled cron call (src/app/api/cron/ecount-pull) has no
// browser session at all, and requireAdmin() below would throw
// "로그인이 필요합니다" for it immediately; runEcountPullCore has no
// session check of its own so both callers can share one implementation.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEcountPullCore, type EcountPullResult } from "@/lib/ecount-pull";

export type EcountSyncResult = EcountPullResult;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    throw new Error("관리자만 사용할 수 있습니다");
  }
}

export async function runEcountPull(days = 30): Promise<EcountSyncResult> {
  await requireAdmin();
  return runEcountPullCore(days);
}

export async function getRecentPurchaseOrders(limit = 30) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("purchase_orders")
    .select(
      "po_no, po_date, supplier_code, suppliers(name), qty, amount, currency, status, item_summary, requested_delivery_date, ecount_synced_at"
    )
    .order("po_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getRecentPriceSnapshots(limit = 30) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("price_history")
    .select("item_code, items(item_name), effective_date, unit_price, source")
    .eq("source", "item_master")
    .order("effective_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// Tier1 #4: surfaces ecount_sync_log (migration 0009) so an admin can see
// whether the scheduled transfer flush (src/lib/ecount-flush.ts) is
// actually running every 10 minutes and actually succeeding — not just
// trust a GitHub Actions green checkmark, which already once reported
// "Success" for weeks of runs that never reached the flush logic at all
// (see CLAUDE.md's 2026-09-10 writeup).
export async function getRecentSyncLog(limit = 30) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("ecount_sync_log")
    .select("id, job, status, attempted, synced, failed, error, run_at")
    .order("run_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
