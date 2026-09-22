// E-Count Open API v2 — push side (창고이동입력/SaveLocationTran) and pull
// side (품목조회/GetBasicProductsList, 발주서조회/GetPurchasesOrderList).
//
// Push side (syncLocationTransferBatch) has its single-entry request shape
// live-verified end-to-end (2026-09-09/10): login → Fixie proxy → IP
// allowlist → SaveLocationTran → SYNCED status. See the DOC_NO comment below
// for a real rejection we hit and fixed. It's now called from a scheduled
// batch flush (src/lib/ecount-flush.ts) rather than per transaction — see
// that file and CLAUDE.md for why (창고이동입력 is rate-limited to 1 call
// per 10 minutes on E-Count's real production server).
//
// Pull side (fetchItemMasterList/fetchPurchaseOrders) field shapes were
// confirmed 2026-09-10 by logging into the live ERP and using E-Count's own
// "API 직접실행(사전테스트)" console against real HK Co. data — not yet
// exercised through this app's own code with a real key. See CLAUDE.md
// "Product architecture" section for the full writeup of what these
// endpoints do and don't return (notably: 발주서조회 is PO-header level with
// no item code; there is no 거래처조회 or 매입/구매 query endpoint at all).
//
// Until ECOUNT_* env vars are configured, every call below is a no-op that
// returns { ok: false, skipped: true } so IMMS itself never depends on
// E-Count being reachable — a transaction always saves in Supabase first,
// and this sync is best-effort on top of that.
//
// E-Count only allowlists a fixed set of individual IPs (no CIDR ranges),
// but Vercel's own outbound IPs aren't static — so every call to E-Count is
// routed through Fixie (a static-IP HTTP proxy add-on) via the FIXIE_URL
// env var Vercel's Fixie integration sets automatically. Locally (no
// FIXIE_URL set) calls just go out directly, which is fine for dev since
// E-Count will reject unrecognized IPs anyway until they're allowlisted.

import { ProxyAgent } from "undici";

type PullResult<T> =
  | { ok: true; data: T }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

let cachedDispatcher: ProxyAgent | undefined;
let cachedFixieUrl: string | undefined;

// fetch()'s TS types don't know about the Node/undici-only `dispatcher`
// option, so this widens just enough to pass it through.
type FetchInitWithDispatcher = RequestInit & { dispatcher?: ProxyAgent };

function getFetchOptions(): { dispatcher?: ProxyAgent } {
  const fixieUrl = process.env.FIXIE_URL;
  if (!fixieUrl) return {};
  if (cachedDispatcher && cachedFixieUrl === fixieUrl) return { dispatcher: cachedDispatcher };
  cachedDispatcher = new ProxyAgent(fixieUrl);
  cachedFixieUrl = fixieUrl;
  return { dispatcher: cachedDispatcher };
}

function getConfig() {
  const comCode = process.env.ECOUNT_COM_CODE;
  const zone = process.env.ECOUNT_ZONE;
  const userId = process.env.ECOUNT_USER_ID;
  const apiKey = process.env.ECOUNT_API_KEY;
  if (!comCode || !zone || !userId || !apiKey) return null;
  return { comCode, zone, userId, apiKey };
}

async function login(): Promise<{ sessionId: string; zone: string } | null> {
  const config = getConfig();
  if (!config) return null;

  const res = await fetch(`https://oapi${config.zone}.ecount.com/OAPI/V2/OAPILogin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      COM_CODE: config.comCode,
      USER_ID: config.userId,
      API_CERT_KEY: config.apiKey,
      LAN_TYPE: "ko-KR",
      ZONE: config.zone,
    }),
    ...getFetchOptions(),
  } as FetchInitWithDispatcher);

  if (!res.ok) throw new Error(`OAPILogin HTTP ${res.status}`);
  const body = await res.json();
  const sessionId = body?.Data?.Datas?.SESSION_ID;
  if (!sessionId) throw new Error(`OAPILogin: no SESSION_ID in response (${JSON.stringify(body).slice(0, 200)})`);
  return { sessionId, zone: config.zone };
}

// Shared POST-with-session helper for the pull-side (query) endpoints —
// they're all "POST a JSON filter, get a JSON Result array back" once
// logged in, so this avoids repeating the fetch/error-shape boilerplate.
async function postToEcount<T>(path: string, sessionId: string, zone: string, body: unknown): Promise<T> {
  const res = await fetch(
    `https://oapi${zone}.ecount.com/OAPI/V2/${path}?SESSION_ID=${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...getFetchOptions(),
    } as FetchInitWithDispatcher
  );
  if (!res.ok) {
    if (res.status === 412) {
      // 2026-09-10: confirmed via this account's own API인증현황 screen that
      // several OAPI v2 endpoints are throttled on E-Count's REAL production
      // server far more aggressively than their names suggest — notably
      // 발주서조회 and 창고이동입력 are both listed as "조회, 현황, 로그인:
      // 1회/10분" (once per 10 minutes) under 실서버전송기준, vs. e.g.
      // 품목조회's 1회/1초. A 412 here almost always means this limit was
      // hit, not a malformed request.
      throw new Error(
        `${path}: 이카운트 API 호출 제한(레이트리밋)에 걸렸습니다 — 이 API는 운영서버에서 짧은 시간에 여러 번 부르면 막힙니다(예: 발주서조회/창고이동입력은 10분당 1회). 잠시 후 다시 시도해주세요. (HTTP 412)`
      );
    }
    throw new Error(`${path} HTTP ${res.status}`);
  }
  return res.json();
}

// PRD (생산불출) has no destination location in IMMS's own ledger (material
// issued for production isn't a trackable stock location here), but
// E-Count's 창고이동입력 still needs a destination warehouse. Kevin confirmed
// (2026-09-10) this is always a fixed pair for this factory: material
// issued for production always leaves M2000 and lands in 2000(이천공장) in
// E-Count's books. Exported so both the transaction-creation code and the
// batch flush job (which builds the actual E-Count payload) share one value.
export const PRODUCTION_ECOUNT_LOCATION_CODE = "2000";

export type LocationTransferInput = {
  txnId: string; // IMMS transactions.id — used only to key the per-row result back to a DB row, never sent to E-Count
  fromCode: string;
  toCode: string;
  itemCode: string;
  qty: number;
  note?: string;
};

export type LocationTransferBatchResult =
  | { ok: true; skipped: false; results: { txnId: string; ok: boolean; refNo?: string; error?: string }[] }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

// Records warehouse-to-warehouse movements in E-Count via 창고이동입력 —
// used for MOV (창고이동), RET (반납), and PRD (생산불출), all modeled as an
// internal transfer in E-Count's warehouse master. Not used for SHP
// (택배발송): the destination there is a customer/recipient, not an E-Count
// warehouse code.
//
// 2026-09-10: this used to fire once per transaction, synchronously, right
// when the transaction was created. Confirmed via this account's own
// API인증현황 screen that 창고이동입력 is throttled to "조회, 현황, 로그인:
// 1회/10분" (once per 10 minutes) on E-Count's REAL production server — so
// any factory-floor activity faster than one transfer per 10 minutes would
// have silently failed to sync past the first. Rewritten as a batch call:
// every currently-pending transaction is sent together in ONE
// SaveLocationTran request (LocationTranList takes multiple BulkDatas
// entries, keyed by UPLOAD_SER_NO — this is a bulk-upload endpoint by
// design), invoked on a schedule instead of per transaction. See
// src/lib/ecount-flush.ts for the batching/scheduling side, and CLAUDE.md
// for why Vercel's own Cron Jobs couldn't be used for the schedule (Hobby
// plan = once/day minimum) and GitHub Actions is used instead.
//
// Caveat: the single-entry version of this call was live-verified
// end-to-end (2026-09-09/10). Sending MULTIPLE BulkDatas entries in one
// call has NOT been live-verified yet — matching ResultDetails back to
// requests by array index (falling back to UPLOAD_SER_NO if present) is a
// reasonable assumption given the field names, not a confirmed fact. Watch
// the first real multi-row flush closely.
export async function syncLocationTransferBatch(
  inputs: LocationTransferInput[]
): Promise<LocationTransferBatchResult> {
  const config = getConfig();
  if (!config) return { ok: false, skipped: true };
  if (inputs.length === 0) return { ok: true, skipped: false, results: [] };

  try {
    const session = await login();
    if (!session) return { ok: false, skipped: true };

    const body = await postToEcount<{
      Data?: {
        SuccessCnt?: number;
        ResultDetails?: { IsError?: boolean; TRACE_ID?: string; UPLOAD_SER_NO?: number }[];
      };
    }>("Others/SaveLocationTran", session.sessionId, session.zone, {
      LocationTranList: inputs.map((input, i) => ({
        BulkDatas: {
          UPLOAD_SER_NO: i + 1,
          WH_CD_F: input.fromCode,
          WH_CD_T: input.toCode,
          PROD_CD: input.itemCode,
          QTY: input.qty,
          REMARKS: input.note ?? "",
          // DOC_NO deliberately omitted: a live test on 2026-09-09 sending
          // IMMS's UUID txn id as DOC_NO was rejected with "창고이동No.
          // (자릿수)" (digit-count validation error) — E-Count expects its
          // own short numbered slip format here. Omitting it lets E-Count
          // auto-assign its own slip number, captured below as refNo.
        },
      })),
    });

    const details = body.Data?.ResultDetails ?? [];
    const bySerNo = new Map(details.filter((d) => d.UPLOAD_SER_NO != null).map((d) => [d.UPLOAD_SER_NO, d]));

    const results = inputs.map((input, i) => {
      const detail = bySerNo.get(i + 1) ?? details[i];
      if (detail && !detail.IsError) {
        return { txnId: input.txnId, ok: true, refNo: detail.TRACE_ID ?? input.txnId };
      }
      return { txnId: input.txnId, ok: false, error: JSON.stringify(detail ?? {}).slice(0, 300) };
    });

    return { ok: true, skipped: false, results };
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

// ---------------------------------------------------------------------------
// Pull side — 품목조회 (item master) and 발주서조회 (PO headers).
// ---------------------------------------------------------------------------

export type EcountItemMasterRow = {
  PROD_CD: string;
  PROD_DES: string;
  IN_PRICE?: string;
  CUST?: string;
  MIN_QTY?: string;
  IN_TERM?: string;
  MATERIAL_COST?: string;
};

// GetBasicProductsList takes no documented page/size params — passing an
// empty PROD_CD returns "the full item master" in one call, but a manual
// CSV backfill on 2026-09-11 found the live DB was actually missing 1,202
// real item codes versus E-Count's own export, which is exactly the silent
// per-call cap this comment used to only warn about. FROM_PROD_CD/TO_PROD_CD
// ARE documented as accepted filters on this endpoint (confirmed against
// E-Count's own API manual — see CLAUDE.md's 2026-09-10 verification notes),
// so below we use FROM_PROD_CD as an ascending keyset cursor: after each
// call, re-request starting from the highest PROD_CD seen so far, and stop
// once a call adds no new codes.
//
// UNVERIFIED end-to-end: this sandbox has no live E-Count credentials
// (`.env.local` carries no ECOUNT_* vars), so this pagination loop has never
// actually round-tripped against the real API. It is written to degrade
// safely if E-Count ignores FROM_PROD_CD entirely and just keeps returning
// the same full set — the loop notices zero new rows on page 2 and stops,
// which costs one extra API call but reproduces the old single-call
// behavior exactly. The first real production run after this ships MUST be
// checked: compare the resulting row count against E-Count's own 품목등록
// screen count (same check CLAUDE.md already calls out) before trusting
// this actually closed the gap.
const MAX_ITEM_MASTER_PAGES = 50;

// 품목조회 is rate-limited to 1 call/sec on the real production server (see
// CLAUDE.md's 2026-09-10 API인증현황 verification — far looser than 발주서조회/
// 창고이동입력's 1 call/10min, but still a real limit a 50-page loop could
// trip). A flat 1.1s floor between pages costs at most ~55s on the rare
// catalog that actually needs every page, and nothing at all for the common
// case (today: 1-2 pages).
const ITEM_MASTER_PAGE_INTERVAL_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchItemMasterList(): Promise<PullResult<EcountItemMasterRow[]>> {
  const config = getConfig();
  if (!config) return { ok: false, skipped: true };

  try {
    const session = await login();
    if (!session) return { ok: false, skipped: true };

    const byCode = new Map<string, EcountItemMasterRow>();
    let cursor = "";

    for (let page = 0; page < MAX_ITEM_MASTER_PAGES; page++) {
      if (page > 0) await sleep(ITEM_MASTER_PAGE_INTERVAL_MS);
      let body: {
        Data?: { Result?: EcountItemMasterRow[] };
        Error?: { Message?: string } | null;
      };
      try {
        body = await postToEcount<{
          Data?: { Result?: EcountItemMasterRow[] };
          Error?: { Message?: string } | null;
        }>("InventoryBasic/GetBasicProductsList", session.sessionId, session.zone, {
          PROD_CD: "",
          FROM_PROD_CD: cursor,
          COMMA_FLAG: "N",
        });
      } catch (e) {
        // Page 0 failing means we have nothing at all — that's a real
        // failure and must be reported. A later page failing (rate limit,
        // transient error) still leaves us with everything collected so
        // far, which is strictly better than the old behavior, so we warn
        // and return partial results instead of discarding them.
        if (page === 0) throw e;
        console.warn(
          `fetchItemMasterList: page ${page} request failed, returning ${byCode.size} rows collected so far:`,
          e instanceof Error ? e.message : e,
        );
        break;
      }

      if (body.Error) {
        if (page === 0) {
          return { ok: false, skipped: false, error: `GetBasicProductsList: ${body.Error.Message ?? "unknown error"}` };
        }
        console.warn(
          `fetchItemMasterList: page ${page} returned an error, returning ${byCode.size} rows collected so far:`,
          body.Error.Message ?? "unknown error",
        );
        break;
      }

      const rows = body.Data?.Result ?? [];
      if (rows.length === 0) break;

      let maxCode = cursor;
      let newRows = 0;
      for (const row of rows) {
        const code = row.PROD_CD?.trim();
        if (!code) continue;
        if (!byCode.has(code)) newRows++;
        byCode.set(code, row);
        if (code > maxCode) maxCode = code;
      }

      // No new codes and no forward progress on the cursor: either this
      // was the last page, or E-Count doesn't honor FROM_PROD_CD and just
      // handed us the same full set again. Either way, looping further
      // cannot find more data.
      if (newRows === 0 || maxCode === cursor) break;

      cursor = maxCode;
    }

    return { ok: true, data: Array.from(byCode.values()) };
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

export type EcountInventoryBalanceRow = {
  PROD_CD: string;
  BAL_QTY?: string;
};

// 재고현황 (list variant) — confirmed 2026-09-10 via E-Count's own API
// manual/test console to return only PROD_CD + BAL_QTY (a current-balance
// snapshot as of "now", not a transaction ledger — see CLAUDE.md "Product
// architecture" for the full writeup of why 재고수불부 itself isn't
// reachable via Open API). No WH_CD filter is passed here, so BAL_QTY is
// the company-wide total for that item, matching what IMMS's own
// `stock_total` view computes (sum across every IMMS location) — this is
// the pairing this function exists for, see runStockReconciliation() in
// src/lib/actions/stock-reconciliation.ts.
//
// UNVERIFIED: the exact request path below ("InventoryBasic/
// GetListInventoryBalanceStatus") is inferred from GetBasicProductsList
// living at "InventoryBasic/GetBasicProductsList" in the same 재고 API
// family — CLAUDE.md confirms the endpoint's NAME and response shape via
// the live API manual, but not this literal URL, and this sandbox has no
// E-Count credentials to call it and find out. If the path is wrong this
// fails closed (returns an `error` result, never silently wrong data) —
// confirm the real path against 정보관리 > API매뉴얼 > InventoryBasic before
// trusting this in production, and update this comment once confirmed.
export async function fetchInventoryBalance(): Promise<PullResult<EcountInventoryBalanceRow[]>> {
  const config = getConfig();
  if (!config) return { ok: false, skipped: true };

  try {
    const session = await login();
    if (!session) return { ok: false, skipped: true };

    const body = await postToEcount<{
      Data?: { Result?: EcountInventoryBalanceRow[] };
      Error?: { Message?: string } | null;
    }>("InventoryBasic/GetListInventoryBalanceStatus", session.sessionId, session.zone, {
      PROD_CD: "",
    });

    if (body.Error) {
      return { ok: false, skipped: false, error: `GetListInventoryBalanceStatus: ${body.Error.Message ?? "unknown error"}` };
    }

    return { ok: true, data: body.Data?.Result ?? [] };
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

export type EcountPurchaseOrderRow = {
  ORD_NO: number | string;
  ORD_DATE: string;
  WH_CD?: string;
  WH_DES?: string;
  EMP_CD?: string;
  CUST_NAME?: string; // 담당자명 (person in charge) — NOT the supplier name, despite the field name.
  CUST?: string; // 거래처코드
  CUST_DES?: string; // 거래처명 (supplier company name)
  FOREIGN_FLAG?: string;
  CODE_DES?: string | null;
  EXCHANGE_RATE?: string;
  P_FLAG?: string; // '1' 진행중, '9' 종결
  TTL_CTT?: string;
  TIME_DATE?: string;
  // 2026-09-18 실운영 데이터로 정정: 이전 주석("PO-level total across all
  // lines")은 2026-09-10 수기 API 테스트 당시의 단순 케이스에 근거한
  // 추정이었음. 실제로는 ORD_NO(발주번호) 하나가 창고/라인별로 여러 행에
  // 걸쳐 나뉘어 오고, QTY/BUY_AMT는 그 행(라인) 하나의 수량/금액이다 — PO
  // 헤더 합계가 필요하면 같은 ORD_NO의 행들을 합산해야 한다(ecount-pull.ts의
  // aggregatePoRowsByPoNo 참고).
  QTY?: string;
  BUY_AMT?: string;
  VAT_AMT?: string;
};

// 발주서조회 caps each query at a 30-day window ("최대 30일까지 조회
// 가능합니다" per the manual). It ALSO — confirmed 2026-09-10 via this
// account's own API인증현황 screen — is throttled on E-Count's REAL
// production server to "조회, 현황, 로그인: 1회/10분" (once per 10 minutes)
// under 구매관리API. The old version paginated with a tight loop (calling
// again immediately whenever more rows remained, up to 100/page) — every
// second-and-later call in that loop was guaranteed to violate this limit
// and fail with HTTP 412. Given the limit, one sync run can only ever
// afford a SINGLE call to this endpoint — so this fetches page 1 only and
// reports (via console.warn) when more rows exist than fit on it, rather
// than looping.
async function fetchPurchaseOrdersWindow(
  fromYmd: string,
  toYmd: string
): Promise<PullResult<EcountPurchaseOrderRow[]>> {
  const config = getConfig();
  if (!config) return { ok: false, skipped: true };

  try {
    const session = await login();
    if (!session) return { ok: false, skipped: true };

    const pageSize = 100;
    const body = await postToEcount<{
      Data?: { Result?: EcountPurchaseOrderRow[]; TotalCnt?: number };
      Error?: { Message?: string } | null;
    }>("Purchases/GetPurchasesOrderList", session.sessionId, session.zone, {
      PROD_CD: "",
      CUST_CD: "",
      ListParam: {
        PAGE_CURRENT: 1,
        PAGE_SIZE: pageSize,
        BASE_DATE_FROM: fromYmd,
        BASE_DATE_TO: toYmd,
      },
    });

    if (body.Error) {
      return { ok: false, skipped: false, error: `GetPurchasesOrderList: ${body.Error.Message ?? "unknown error"}` };
    }

    const rows = body.Data?.Result ?? [];
    const total = body.Data?.TotalCnt ?? rows.length;
    if (total > rows.length) {
      console.warn(
        `GetPurchasesOrderList ${fromYmd}~${toYmd}: ${total}건 중 ${rows.length}건만 가져옴 — ` +
          `운영서버 10분당 1회 제한 때문에 한 번의 동기화 실행당 첫 페이지(최대 ${pageSize}건)만 조회 가능합니다.`
      );
    }

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// Pulls the last `days` days of PO headers (capped at 30 — E-Count's
// per-query window limit). This used to chunk longer ranges into multiple
// <=30-day windows and fetch them sequentially, but GetPurchasesOrderList
// is limited to 1 call per 10 minutes on the real production server (see
// the comment on fetchPurchaseOrdersWindow), so a second window in the same
// run would just 412. One sync run can only ever afford the most recent
// 30-day window; older history needs a separate run at least 10 minutes
// later, or (if this ever becomes a real need) a scheduled job that
// advances one window per invocation.
export async function fetchRecentPurchaseOrders(days: number): Promise<PullResult<EcountPurchaseOrderRow[]>> {
  const config = getConfig();
  if (!config) return { ok: false, skipped: true };

  if (days > 30) {
    console.warn(
      `fetchRecentPurchaseOrders(${days}): 운영서버 10분당 1회 제한 때문에 한 번의 실행에서는 최근 30일만 조회합니다.`
    );
  }

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - Math.min(days, 30) + 1);

  return fetchPurchaseOrdersWindow(toYmd(windowStart), toYmd(now));
}
