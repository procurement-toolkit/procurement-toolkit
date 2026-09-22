// Core 품목조회/발주서조회 pull logic — extracted from
// src/lib/actions/ecount-sync.ts (Tier2 #5) so it can run from BOTH the
// admin "지금 동기화" button (a "use server" Server Action, gated by
// requireAdmin()'s real user-session check) AND a scheduled GitHub Actions
// cron call (src/app/api/cron/ecount-pull/route.ts), which has no browser
// session at all and would fail requireAdmin() immediately — the same
// class of mismatch documented in CLAUDE.md for the transfer-flush cron
// (that one was middleware redirecting an unauthenticated request; this one
// would have been requireAdmin() throwing "로그인이 필요합니다" inside the
// Server Action itself). This file has no session/auth check of its own —
// callers are responsible for their own authorization (requireAdmin() for
// the button, the shared cron Bearer secret for the route).
//
// Uses the admin (service-role) Supabase client throughout, exactly like
// src/lib/ecount-flush.ts's runEcountTransferFlush().

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchItemMasterList, fetchRecentPurchaseOrders, type EcountPurchaseOrderRow } from "@/lib/ecount";
import { M2000_WAREHOUSE_CODE } from "@/lib/pis-scope";

export type EcountPullResult =
  | {
      ok: true;
      skipped: false;
      itemsSynced: number;
      priceSnapshotsWritten: number;
      suppliersUpserted: number;
      purchaseOrdersUpserted: number;
    }
  | { ok: false; skipped: true; reason: "not_configured" }
  | { ok: false; skipped: false; error: string };

const JOB_NAME = "item_master_pull";

// PostgREST/Postgres can choke on very large multi-row upserts in one HTTP
// call — chunk everything so a big E-Count catalog can't blow past a
// request-size or statement limit. Keeps this to a handful of round trips
// total regardless of how many SKUs E-Count has, instead of one per row.
const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function parseEcountDate(ymd: string | undefined): string | null {
  if (!ymd || ymd.length !== 8) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function toNumberOrNull(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Tier1 #4: same append-only history as the transfer flush (migration
// 0009's ecount_sync_log, job is free text specifically to support this).
async function logSyncAttempt(
  admin: ReturnType<typeof createAdminClient>,
  row: { status: "success" | "error" | "skipped"; error?: string; detail?: Record<string, number> }
) {
  try {
    await admin.from("ecount_sync_log").insert({ job: JOB_NAME, ...row });
  } catch (e) {
    console.error("ecount_sync_log insert failed (non-fatal):", e);
  }
}

export async function runEcountPullCore(days = 30): Promise<EcountPullResult> {
  const admin = createAdminClient();

  // --- 품목조회: create/update item master, then moq/lead_time_days/IN_PRICE ---
  const itemResult = await fetchItemMasterList();
  if (!itemResult.ok && itemResult.skipped) {
    await logSyncAttempt(admin, { status: "skipped" });
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (!itemResult.ok) {
    const message = `품목조회 실패: ${itemResult.error}`;
    await logSyncAttempt(admin, { status: "error", error: message });
    return { ok: false, skipped: false, error: message };
  }

  // See src/lib/actions/ecount-sync.ts's git history / CLAUDE.md for why
  // only PROD_CD/PROD_DES/MIN_QTY/IN_TERM/IN_PRICE were originally mapped
  // here. 2026-09-21 추가: MATERIAL_COST(재료비표준원가)는 EcountItemMasterRow
  // 타입에 원래부터 있었고 매 동기화마다 실제로 응답에 실려 오는데, 저장할
  // 컬럼이 없어 지금까지 버려지고 있었다(Kevin이 "더 끌어올 수 있는 자료"를
  // 확인해달라고 해서 재검토하다 발견) — 새 API 호출 없이 items.material_cost
  // 로 저장한다(마이그레이션 0014).
  const normalized = itemResult.data
    .map((row) => ({
      prodCd: row.PROD_CD?.trim(),
      prodDes: row.PROD_DES?.trim(),
      moq: toNumberOrNull(row.MIN_QTY),
      leadTimeDays: toNumberOrNull(row.IN_TERM),
      inPrice: toNumberOrNull(row.IN_PRICE),
      materialCost: toNumberOrNull(row.MATERIAL_COST),
    }))
    .filter((r): r is typeof r & { prodCd: string } => !!r.prodCd);

  let itemsSynced = 0;
  for (const batch of chunk(normalized, BATCH_SIZE)) {
    const identityRows = batch.map((row) => ({
      item_code: row.prodCd,
      item_name: row.prodDes || row.prodCd,
      ecount_item_code: row.prodCd,
    }));
    const { error, count } = await admin
      .from("items")
      .upsert(identityRows, { onConflict: "item_code", count: "exact" });
    if (error) {
      const message = `품목 저장 실패: ${error.message}`;
      await logSyncAttempt(admin, { status: "error", error: message });
      return { ok: false, skipped: false, error: message };
    }
    itemsSynced += count ?? identityRows.length;
  }

  const moqRows = normalized
    .filter((r) => r.moq !== null)
    .map((r) => ({ item_code: r.prodCd, item_name: r.prodDes || r.prodCd, moq: r.moq as number }));
  const leadTimeRows = normalized
    .filter((r) => r.leadTimeDays !== null)
    .map((r) => ({ item_code: r.prodCd, item_name: r.prodDes || r.prodCd, lead_time_days: r.leadTimeDays as number }));
  const materialCostRows = normalized
    .filter((r) => r.materialCost !== null && r.materialCost > 0)
    .map((r) => ({ item_code: r.prodCd, item_name: r.prodDes || r.prodCd, material_cost: r.materialCost as number }));

  for (const batch of chunk(moqRows, BATCH_SIZE)) {
    const { error } = await admin.from("items").upsert(batch, { onConflict: "item_code" });
    if (error) console.error("items moq batch upsert failed:", error);
  }
  for (const batch of chunk(leadTimeRows, BATCH_SIZE)) {
    const { error } = await admin.from("items").upsert(batch, { onConflict: "item_code" });
    if (error) console.error("items lead_time_days batch upsert failed:", error);
  }
  for (const batch of chunk(materialCostRows, BATCH_SIZE)) {
    const { error } = await admin.from("items").upsert(batch, { onConflict: "item_code" });
    if (error) console.error("items material_cost batch upsert failed:", error);
  }

  const today = new Date().toISOString().slice(0, 10);
  const priceRows = normalized
    .filter((r) => r.inPrice !== null && r.inPrice > 0)
    .map((r) => ({
      item_code: r.prodCd,
      effective_date: today,
      unit_price: r.inPrice as number,
      source: "item_master" as const,
    }));

  let priceSnapshotsWritten = 0;
  for (const batch of chunk(priceRows, BATCH_SIZE)) {
    const { error, count } = await admin
      .from("price_history")
      .upsert(batch, { onConflict: "item_code,effective_date,source", count: "exact" });
    if (error) {
      console.error("price_history batch upsert failed:", error);
    } else {
      priceSnapshotsWritten += count ?? batch.length;
    }
  }

  // --- 발주서조회: suppliers (opportunistic) + purchase_orders headers ------
  const poResult = await fetchRecentPurchaseOrders(days);
  if (!poResult.ok && poResult.skipped) {
    await logSyncAttempt(admin, { status: "skipped" });
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (!poResult.ok) {
    const message = `발주서조회 실패: ${poResult.error}`;
    await logSyncAttempt(admin, { status: "error", error: message });
    return { ok: false, skipped: false, error: message };
  }

  const suppliersSeen = new Map<string, string>();
  for (const po of poResult.data) {
    if (po.CUST) suppliersSeen.set(po.CUST, po.CUST_DES || po.CUST);
  }

  let suppliersUpserted = 0;
  if (suppliersSeen.size > 0) {
    const rows = Array.from(suppliersSeen, ([code, name]) => ({ code, name }));
    const { error, count } = await admin
      .from("suppliers")
      .upsert(rows, { onConflict: "code", ignoreDuplicates: false, count: "exact" });
    if (error) {
      console.error("suppliers upsert failed:", error);
      const message = `거래처 저장 실패: ${error.message}`;
      await logSyncAttempt(admin, { status: "error", error: message });
      return { ok: false, skipped: false, error: message };
    } else {
      suppliersUpserted = count ?? rows.length;
    }
  }

  // 2026-09-18 발견: GetPurchasesOrderList가 실제 운영 데이터에서는 ORD_NO
  // (발주번호) 하나당 여러 행을 돌려준다 — 이 파일이 처음 작성될 때 근거로
  //삼았던 2026-09-10 수기 API 테스트("PO-level total across all lines")는
  // 단순한 케이스만 확인했던 것으로 보이며, 실제로는 발주서 한 건이 여러
  // 창고(WH_CD)/라인에 걸치면 그 수만큼 행이 나뉘어 온다.
  //
  // 2026-09-21 추가 발견 (Kevin의 "PIS 구현" M2000 스코프 요청을 구현하다가
  // DB 직접 대조로 확인): 위 2026-09-18 수정은 "ORD_NO 하나 = 발주서 한 건"을
  // 계속 전제하고 있었는데, 이것도 틀렸다 — ORD_NO는 날짜가 바뀌면 재사용된다
  // (이카운트 쪽에서 날짜별로 리셋되는 일련번호로 보임). 실데이터에서 po_no
  // "10" 하나가 09/14~09/21 사이 6개의 서로 다른 날짜, 서로 다른 거래처의
  // 발주를 전부 하나로 합쳐 저장하고 있었다(Kevin이 예로 든 "아르떼콤마
  // ₩4,352,500" 같은 M2000이 아닌 발주가 바로 이런 식으로 M2000 발주 금액에
  // 섞여 들어감). 그래서 grouping key를 ORD_NO 단독이 아니라 (ORD_NO,
  // ORD_DATE) 조합으로 바꾼다 — purchase_orders 쪽 UNIQUE 제약도 (po_no,
  // po_date)로 맞춰야 한다(마이그레이션 필요, CLAUDE.md 참고).
  //
  // 같은 김에 M2000(이천공장 자재창고) 외 창고 라인은 합산에서 아예
  // 제외한다 — Kevin 요청 "M2000에서 발생되는 업체, 자재, 금액, 단가들만
  // 관리". 한 발주서 안에 M2000 라인이 하나도 없으면(순수 비M2000 발주) 그
  // 그룹 자체를 스킵해 purchase_orders에 저장하지 않는다.
  // 2026-09-21, Kevin 요청(Part 3, E-Count 발주서조회 스크린샷 기반 피드백):
  // "금액이 부가세 포함인지 별도인지 표시되어야 할 듯". amount(BUY_AMT
  // 합계)는 처음부터 공급가액(부가세 별도)이었는데 화면에 그 사실이
  // 드러나지 않았다. VAT_AMT는 2026-09-10 API 직접실행으로 이미 응답에
  // 있다고 검증까지 해놓고 파싱만 하고 저장은 안 하고 있었다(CLAUDE.md
  // 참고) — vat_amount 컬럼을 추가해 같이 저장한다. 화면에서
  // 공급가액/부가세/합계(부가세포함)를 명확히 구분해 보여줄 수 있게 됨.
  type PoAggregateRow = {
    po_no: string;
    po_date: string;
    supplier_code: string | null;
    qty: number;
    amount: number; // 공급가액(부가세 별도) — BUY_AMT 합계
    vat_amount: number | null; // 부가세액 — VAT_AMT 합계. null이면 이번 동기화 라인에 VAT_AMT가 하나도 없었음(구분 위해 0이 아니라 null)
    currency: string;
    exchange_rate: number | null;
    requested_delivery_date: string | null;
    buyer: string | null;
    status: "closed" | "in_progress" | null;
    item_summary: string | null;
    warehouse_code: string | null;
    warehouse_name: string | null;
    ecount_synced_at: string;
  };

  function aggregatePoRowsByPoNo(poRows: EcountPurchaseOrderRow[]): PoAggregateRow[] {
    const groups = new Map<string, EcountPurchaseOrderRow[]>();
    for (const po of poRows) {
      // (ORD_NO, ORD_DATE) 조합 — ORD_NO 단독은 날짜가 바뀌면 재사용되므로
      // 유일하지 않다(위 2026-09-21 주석 참고).
      const key = `${po.ORD_NO}::${po.ORD_DATE}`;
      const existing = groups.get(key);
      if (existing) existing.push(po);
      else groups.set(key, [po]);
    }

    const now = new Date().toISOString();
    const result: PoAggregateRow[] = [];
    for (const lines of groups.values()) {
      const poDate = parseEcountDate(String(lines[0].ORD_DATE));
      if (!poDate) continue;

      // M2000(이천공장 자재창고) 라인만 남기고 나머지 창고 라인은 버린다 —
      // 같은 발주서 안에 M2000과 다른 창고가 섞여 있어도(예: "7000,M2000")
      // M2000 몫만 관리 대상이다.
      const m2000Lines = lines.filter((l) => l.WH_CD === M2000_WAREHOUSE_CODE);
      if (m2000Lines.length === 0) continue; // 순수 비M2000 발주 — 저장하지 않음

      let qtySum = 0;
      let amountSum = 0;
      let vatSum = 0;
      let anyVat = false;
      let anyValid = false;
      for (const line of m2000Lines) {
        const qty = toNumberOrNull(line.QTY);
        const amount = toNumberOrNull(line.BUY_AMT);
        if (qty === null || amount === null) continue;
        qtySum += qty;
        amountSum += amount;
        const vat = toNumberOrNull(line.VAT_AMT);
        if (vat !== null) {
          vatSum += vat;
          anyVat = true;
        }
        anyValid = true;
      }
      if (!anyValid) continue;

      const first = m2000Lines[0];
      const warehouseCodes = Array.from(new Set(m2000Lines.map((l) => l.WH_CD).filter((v): v is string => !!v)));
      const warehouseNames = Array.from(new Set(m2000Lines.map((l) => l.WH_DES).filter((v): v is string => !!v)));
      const itemSummaries = Array.from(new Set(m2000Lines.map((l) => l.TTL_CTT).filter((v): v is string => !!v)));

      result.push({
        po_no: String(first.ORD_NO),
        po_date: poDate,
        supplier_code: first.CUST || null,
        qty: qtySum,
        amount: amountSum,
        vat_amount: anyVat ? vatSum : null,
        currency: first.FOREIGN_FLAG === "1" ? first.CODE_DES || "USD" : "KRW",
        exchange_rate: toNumberOrNull(first.EXCHANGE_RATE),
        requested_delivery_date: parseEcountDate(first.TIME_DATE),
        buyer: first.CUST_NAME || null,
        status: first.P_FLAG === "9" ? "closed" : first.P_FLAG === "1" ? "in_progress" : null,
        item_summary: itemSummaries.length > 0 ? itemSummaries.join(" · ") : null,
        warehouse_code: warehouseCodes.length > 0 ? warehouseCodes.join(",") : null,
        warehouse_name: warehouseNames.length > 0 ? warehouseNames.join(" · ") : null,
        ecount_synced_at: now,
      });
    }
    return result;
  }

  let purchaseOrdersUpserted = 0;
  if (poResult.data.length > 0) {
    const rows = aggregatePoRowsByPoNo(poResult.data);
    const rawCount = poResult.data.length;
    if (rawCount > rows.length) {
      console.warn(
        `발주서조회: 원본 ${rawCount}행 → (po_no, po_date) 기준 ${rows.length}건으로 합산/필터(같은 발주서가 여러 창고/라인에 걸쳐 여러 행으로 온 경우 합산, M2000 라인이 하나도 없는 발주서는 제외).`
      );
    }

    // 2026-09-21: onConflict를 "po_no"에서 "po_no,po_date"로 변경 — ORD_NO가
    // 날짜마다 재사용되어 po_no 단독으로는 더 이상 유일키가 아니다(위
    // aggregatePoRowsByPoNo 주석 참고). DB의 purchase_orders_po_no_key
    // UNIQUE 제약도 (po_no, po_date) 복합 제약으로 바뀌어 있어야 이 upsert가
    // 성공한다 — 마이그레이션이 먼저 적용되지 않은 채 이 코드가 배포되면
    // "no unique or exclusion constraint matching" 에러로 매 동기화가 실패하며
    // ecount_sync_log에 그대로 기록된다(CLAUDE.md 참고).
    for (const batch of chunk(rows, BATCH_SIZE)) {
      const { error, count } = await admin
        .from("purchase_orders")
        .upsert(batch, { onConflict: "po_no,po_date", count: "exact" });
      if (error) {
        console.error("purchase_orders upsert failed:", error);
        const message = `purchase_orders 저장 실패: ${error.message}`;
        await logSyncAttempt(admin, { status: "error", error: message });
        return { ok: false, skipped: false, error: message };
      }
      purchaseOrdersUpserted += count ?? batch.length;
    }
  }

  await logSyncAttempt(admin, {
    status: "success",
    detail: { itemsSynced, priceSnapshotsWritten, suppliersUpserted, purchaseOrdersUpserted },
  });

  return {
    ok: true,
    skipped: false,
    itemsSynced,
    priceSnapshotsWritten,
    suppliersUpserted,
    purchaseOrdersUpserted,
  };
}
