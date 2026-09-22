"use server";

// Compares E-Count's own current-balance snapshot (재고현황) against what
// IMMS's transaction ledger computes for the same items (`stock_total`),
// and surfaces every item where they disagree. This exists because IMMS's
// stock views are 100% self-derived from IMMS's own transaction log — see
// migration 0001's stock_ledger/stock_by_location/stock_total — with ZERO
// reconciliation against E-Count's actual inventory today. Any missed scan,
// double-entry, or E-Count-side adjustment that never got recorded as an
// IMMS transaction would silently drift forever with no way to notice. This
// is Tier1 #2 in the PIS/IMMS roadmap (① Data Integrity).
//
// On-demand only (an admin clicks a button), same pattern as
// src/lib/actions/ecount-sync.ts's runEcountPull — this does not run on a
// schedule or on every page load, so it never adds live-E-Count latency to
// anything IMMS itself depends on.
//
// UNVERIFIED end-to-end: fetchInventoryBalance()'s exact request path is a
// best-effort guess (see the comment on it in src/lib/ecount.ts) — this
// sandbox has no E-Count credentials to confirm it. If the call fails, this
// returns a plain error rather than silently reporting "0 discrepancies",
// so a wrong endpoint path shows up as a visible failure, not a false
// all-clear.

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchInventoryBalance } from "@/lib/ecount";

export type StockDiscrepancy = {
  item_code: string;
  item_name: string | null;
  ecount_qty: number;
  imms_qty: number;
  diff: number; // ecount_qty - imms_qty; positive = IMMS under-counts vs E-Count
};

export type StockReconciliationResult =
  | {
      ok: true;
      skipped: false;
      checkedAt: string;
      itemsCompared: number;
      discrepancies: StockDiscrepancy[];
    }
  | { ok: false; skipped: true; reason: "not_configured" }
  | { ok: false; skipped: false; error: string };

// Below this, a diff is almost certainly unit-rounding or timing noise
// (E-Count's snapshot and IMMS's ledger are never read at exactly the same
// instant) rather than a real discrepancy worth an admin's attention.
const MIN_DIFF_TO_REPORT = 0.01;

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

function toNumberOrZero(v: string | undefined): number {
  if (v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function runStockReconciliation(): Promise<StockReconciliationResult> {
  await requireAdmin();

  const balanceResult = await fetchInventoryBalance();
  if (!balanceResult.ok && balanceResult.skipped) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (!balanceResult.ok) {
    return { ok: false, skipped: false, error: `재고현황 조회 실패: ${balanceResult.error}` };
  }

  const admin = createAdminClient();
  const [{ data: immsStock, error: stockError }, { data: items, error: itemsError }] = await Promise.all([
    admin.from("stock_total").select("item_code, qty_on_hand"),
    admin.from("items").select("item_code, item_name"),
  ]);

  if (stockError) {
    return { ok: false, skipped: false, error: `IMMS 재고 조회 실패: ${stockError.message}` };
  }
  if (itemsError) {
    return { ok: false, skipped: false, error: `품목 조회 실패: ${itemsError.message}` };
  }

  const immsQtyByCode = new Map<string, number>();
  for (const row of immsStock ?? []) {
    if (row.item_code) immsQtyByCode.set(row.item_code, Number(row.qty_on_hand ?? 0));
  }
  const itemNameByCode = new Map<string, string>();
  for (const row of items ?? []) {
    if (row.item_code) itemNameByCode.set(row.item_code, row.item_name ?? row.item_code);
  }

  // Union of every item_code either side has an opinion about: an item
  // E-Count reports stock for but IMMS has never touched (imms_qty=0) is
  // just as much a discrepancy as one IMMS has moved but E-Count doesn't
  // list at all (ecount_qty=0) — both directions matter for Data Integrity.
  const allCodes = new Set<string>();
  for (const row of balanceResult.data) {
    const code = row.PROD_CD?.trim();
    if (code) allCodes.add(code);
  }
  for (const code of immsQtyByCode.keys()) allCodes.add(code);

  const ecountQtyByCode = new Map<string, number>();
  for (const row of balanceResult.data) {
    const code = row.PROD_CD?.trim();
    if (!code) continue;
    ecountQtyByCode.set(code, toNumberOrZero(row.BAL_QTY));
  }

  const discrepancies: StockDiscrepancy[] = [];
  for (const code of allCodes) {
    const ecountQty = ecountQtyByCode.get(code) ?? 0;
    const immsQty = immsQtyByCode.get(code) ?? 0;
    const diff = ecountQty - immsQty;
    if (Math.abs(diff) < MIN_DIFF_TO_REPORT) continue;
    discrepancies.push({
      item_code: code,
      item_name: itemNameByCode.get(code) ?? null,
      ecount_qty: ecountQty,
      imms_qty: immsQty,
      diff,
    });
  }

  discrepancies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return {
    ok: true,
    skipped: false,
    checkedAt: new Date().toISOString(),
    itemsCompared: allCodes.size,
    discrepancies,
  };
}
