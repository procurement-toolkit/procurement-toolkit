// Batched push of pending PRD/MOV/RET transactions to E-Count via
// 창고이동입력 (SaveLocationTran). Deliberately NOT a "use server" Server
// Action — this is only ever called from the cron API route
// (src/app/api/cron/ecount-flush/route.ts), never from a form or client
// component.
//
// Why this exists (2026-09-10): 창고이동입력 is throttled to "조회, 현황,
// 로그인: 1회/10분" (once per 10 minutes) on E-Count's REAL production
// server — confirmed via this account's own API인증현황 screen, not a
// guess. The old design called syncLocationTransfer once per transaction,
// synchronously, right when it was created — on a real factory floor doing
// more than one transfer every 10 minutes, every call past the first in
// that window would silently 412 and leave the transaction's
// ecount_sync_status as FAILED, with E-Count's own warehouse records
// quietly drifting out of sync with real activity. This collects every
// currently-PENDING transaction and pushes them all in ONE batched call
// instead, meant to run on a schedule (see the route handler + CLAUDE.md
// for why that schedule is a GitHub Actions workflow rather than Vercel's
// own Cron Jobs — this project is on Vercel's Hobby plan, which only
// allows once-a-day cron schedules).
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLocationTransferBatch, PRODUCTION_ECOUNT_LOCATION_CODE, type LocationTransferInput } from "@/lib/ecount";

export type EcountFlushResult =
  | { ok: true; skipped: false; attempted: number; synced: number; failed: number }
  | { ok: false; skipped: true; reason: "not_configured" }
  | { ok: false; skipped: false; error: string };

// Conservative cap on how many LINE ITEMS (not transactions) one flush call
// will attempt at once — E-Count's actual per-call limit for
// LocationTranList isn't documented anywhere we've found. Anything left
// over just stays PENDING and goes out on the next scheduled run; nothing
// is lost. Counted in line items (not headers) since 2026-09-17: the four
// mobile forms became "cart" style and a single PRD/MOV/RET header can now
// carry several transaction_details rows, each of which becomes its own
// BulkDatas entry below — so the old "50 transactions" cap could have quietly
// become "500+ API entries" for a few large carts. A header's lines are
// never split across flush runs (see the loop below) so this cap is a
// ceiling, not an exact count.
const BATCH_LIMIT = 50;

// How many pending headers to even fetch from the DB per run — generous
// headroom above BATCH_LIMIT since most headers have only one or a few
// lines; the per-header truncation loop below is what actually enforces
// BATCH_LIMIT on the real API call.
const FETCH_LIMIT = 200;

const JOB_NAME = "transfer_flush";

// Tier1 #4 (Data Integrity): every attempt gets one row in ecount_sync_log
// (migration 0009), success or failure, including "nothing to do" runs —
// this is exactly the visibility that was missing during the 2026-09-10
// incident (see CLAUDE.md) where a GitHub Actions workflow reported
// "Success" for every 10-minute run while the request was actually being
// redirected to /login before ever reaching this function, and there was
// no independent record to notice from. Logging failures of its own here
// (best-effort, never throws) so a broken log write can't take down a
// working flush.
async function logSyncAttempt(
  admin: ReturnType<typeof createAdminClient>,
  row: { status: "success" | "error" | "skipped"; attempted?: number; synced?: number; failed?: number; error?: string }
) {
  try {
    await admin.from("ecount_sync_log").insert({ job: JOB_NAME, ...row });
  } catch (e) {
    console.error("ecount_sync_log insert failed (non-fatal):", e);
  }
}

export async function runEcountTransferFlush(): Promise<EcountFlushResult> {
  const admin = createAdminClient();

  const { data: pending, error } = await admin
    .from("transactions")
    .select(
      "id, txn_type, from_location_code, to_location_code, note, reason, transaction_details(item_code, qty, process)"
    )
    .eq("ecount_sync_status", "PENDING")
    .in("txn_type", ["PRD", "MOV", "RET"])
    .order("txn_date", { ascending: true })
    .limit(FETCH_LIMIT);

  if (error) {
    const message = `대기 중인 거래 조회 실패: ${error.message}`;
    await logSyncAttempt(admin, { status: "error", error: message });
    return { ok: false, skipped: false, error: message };
  }
  if (!pending || pending.length === 0) {
    await logSyncAttempt(admin, { status: "success", attempted: 0, synced: 0, failed: 0 });
    return { ok: true, skipped: false, attempted: 0, synced: 0, failed: 0 };
  }

  // 2026-09-17: PRD/MOV can now have several transaction_details rows under
  // one header (the "cart" upgrade — see src/lib/actions/transactions.ts).
  // RET stays single-line by design (not part of that change). Each line
  // becomes its own BulkDatas entry in the same SaveLocationTran call, all
  // sharing that header's txnId — LocationTranList already supports
  // multiple entries per call, this just means a single IMMS transaction can
  // now legitimately produce more than one of them. A header's lines are
  // NEVER split across two flush runs (partial-header sync would leave a
  // transaction half-reflected in E-Count with no way to tell from
  // ecount_sync_status alone) — if a header's lines would push the batch
  // past BATCH_LIMIT, that header (and everything after it, to preserve
  // txn_date order) is left PENDING for the next run. The one exception: an
  // empty batch so far always accepts the next header whole even if it alone
  // exceeds BATCH_LIMIT, so an unusually large single cart can't deadlock
  // the flush forever.
  const inputs: LocationTransferInput[] = [];
  for (const txn of pending) {
    const details = txn.transaction_details ?? [];
    if (details.length === 0) continue;

    let toCode = txn.to_location_code;
    if (txn.txn_type === "PRD") {
      // PRD has no to_location_code in IMMS's own ledger — always M2000→2000
      // for this factory (see PRODUCTION_ECOUNT_LOCATION_CODE in ecount.ts).
      toCode = PRODUCTION_ECOUNT_LOCATION_CODE;
    }

    if (!txn.from_location_code || !toCode) {
      // Malformed row (shouldn't happen given the schema's NOT NULL
      // constraints for these txn_types) — skip rather than crash the whole
      // batch; it stays PENDING and can be investigated by hand.
      console.error(`ecount flush: txn ${txn.id} missing from/to location, skipping`);
      continue;
    }

    if (inputs.length > 0 && inputs.length + details.length > BATCH_LIMIT) {
      // Adding this whole header would break the cap — stop here (in
      // txn_date order) and pick it up on the next scheduled run.
      break;
    }

    for (const detail of details) {
      let note: string | undefined;
      if (txn.txn_type === "PRD") {
        note = detail.process ? `생산불출 · ${detail.process}` : "생산불출";
      } else if (txn.txn_type === "RET") {
        note = txn.reason || txn.note || undefined;
      } else {
        note = txn.note || undefined;
      }

      inputs.push({
        txnId: txn.id,
        fromCode: txn.from_location_code,
        toCode,
        itemCode: detail.item_code,
        qty: detail.qty,
        note,
      });
    }
  }

  if (inputs.length === 0) {
    await logSyncAttempt(admin, { status: "success", attempted: 0, synced: 0, failed: 0 });
    return { ok: true, skipped: false, attempted: 0, synced: 0, failed: 0 };
  }

  const result = await syncLocationTransferBatch(inputs);
  if (!result.ok && result.skipped) {
    await logSyncAttempt(admin, { status: "skipped" });
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (!result.ok) {
    await logSyncAttempt(admin, { status: "error", attempted: inputs.length, error: result.error });
    return { ok: false, skipped: false, error: result.error };
  }

  // `result.results` has one entry per LINE (matching `inputs` 1:1) — group
  // back to per-HEADER before writing ecount_sync_status, since that column
  // lives on `transactions` (one row per header, not per line). A header
  // syncs as SYNCED only if every one of its lines came back ok; any single
  // line failure marks the whole header FAILED, even if some of its sibling
  // lines already succeeded in the same call. That's a deliberate,
  // conservative choice over marking it SYNCED-with-caveats: FAILED stops a
  // retry attempt from happening automatically (this project has no
  // automatic FAILED→PENDING retry), so a human has to look at it — and if
  // they do, the console.error below tells them some lines may already be
  // recorded on E-Count's side, so a naive full resend could double-count.
  const byTxn = new Map<string, { ok: boolean; refNo?: string; error?: string }[]>();
  for (const r of result.results) {
    const list = byTxn.get(r.txnId) ?? [];
    list.push(r);
    byTxn.set(r.txnId, list);
  }

  let synced = 0;
  let failed = 0;
  for (const [txnId, lineResults] of byTxn) {
    const allOk = lineResults.every((r) => r.ok);
    if (allOk) {
      const refNo = lineResults.find((r) => r.ok)?.refNo;
      await admin.from("transactions").update({ ecount_sync_status: "SYNCED", ecount_ref_no: refNo }).eq("id", txnId);
      synced++;
    } else {
      const failedLines = lineResults.filter((r) => !r.ok);
      console.error(
        `E-Count batch sync failed for txn ${txnId} (${failedLines.length}/${lineResults.length} line(s) failed):`,
        failedLines.map((r) => r.error).join("; ")
      );
      if (lineResults.some((r) => r.ok)) {
        console.error(
          `txn ${txnId}: PARTIAL sync — some lines already recorded in E-Count before the failure. Marked FAILED for manual review rather than auto-retrying (a resend would double-submit the lines that already succeeded).`
        );
      }
      await admin.from("transactions").update({ ecount_sync_status: "FAILED" }).eq("id", txnId);
      failed++;
    }
  }

  // Note the unit mismatch if you're reading ecount_sync_log directly:
  // `attempted` counts LINE ITEMS (= API entries sent), while `synced`/
  // `failed` count HEADERS (= transactions rows updated) — a single 3-line
  // cart transaction shows up as attempted:3 but synced:1 (or failed:1).
  await logSyncAttempt(admin, { status: "success", attempted: inputs.length, synced, failed });
  return { ok: true, skipped: false, attempted: inputs.length, synced, failed };
}
