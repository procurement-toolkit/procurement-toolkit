"use server";

// Tier3: PIS Web dashboard (/admin), replacing the old redirect straight to
// /admin/users. Built without the full "IMMS_Web_구매분석_데이터설계표.xlsx"
// spec (not in this repo — Kevin has the current version) — scoped instead
// to exactly what today's actual data can support honestly, against his own
// five requested categories (얼마나 샀나/어디서 많이 샀나/가격이 올랐나/
// 재고가 적정한가/업체가 위험한가). See getRequestedMetricStatus() for the
// explicit, up-to-date gap list — some items moved from "blocked" to
// "available/partial" after migration 0010 added an optional supplier_code
// to transactions and /admin/items added safety_stock/reorder_point input;
// what's left blocked is a genuine data-availability wall (no historical
// baseline before this system existed, E-Count exposing only one price per
// item, no PO delivery-date tracking), not something more code can fix.
//
// 2026-09-17 업데이트: "얼마나 샀나?" / "어디에서 많이 샀나?" / "업체가
// 위험한가?" 섹션(getPurchaseInsights/getPurchaseTrend/
// getSupplierRiskSummary)은 더 이상 추정치가 아니다. 기존에는 IMMS 자체
// 입고(IN) 기록(0순위 임시 결정, 2026-09-11 — IMMS 거래가 사실상 0건이라
// 항상 비어 있었다) × 이카운트 등록 현재단가로 근사했지만, 이제는 구매팀이
// `/admin/purchase-import`로 직접 업로드하는 실제 "구매현황" 전표 데이터
// (`purchase_records`, 2023년~현재, 2026-09-17 기준 18,989건)를 그대로
// 쓴다 — 실제 지불 단가/거래일/거래처명이 그대로 반영되므로 "추정치"라고
// 표시할 필요가 없다. 금액은 `supply_amount`(공급가액, 부가세 제외)
// 기준으로 통일했다 — 매입처별 과세/면세 여부에 따라 `total_amount`(부가세
// 포함)를 쓰면 업체 간 비교가 왜곡될 수 있어 표준 매입액 관례를 따랐다.
// 한계: 이 데이터는 구매팀이 올린 xlsx에 의존하므로, 업로드가 밀리면 최신
// 구매 데이터도 그만큼 밀린다 — E-Count/IMMS 실시간 기록이 아니다.
//
// "가격이 올랐나?"(getCategoryBreakdown/getPriceMovementSummary)와 재고
// 지표(getInventoryHealth)는 여전히 이카운트 등록 현재단가 스냅샷/IMMS
// stock_ledger 기반이라 추정/근사 성격이 남아있다 — 화면에서 이 둘을
// 구매현황 실데이터 섹션과 구분해서 표시할 것.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { M2000_DEPARTMENT } from "@/lib/pis-scope";

type AdminClient = ReturnType<typeof createAdminClient>;

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

// A generous but bounded cap everywhere this file fetches a whole table's
// worth of rows via the JS client rather than aggregating in SQL — fine at
// today's real scale (18,565 items, 0 transactions), but worth revisiting
// with real SQL aggregation (a view, or an RPC function) if IMMS transaction
// volume ever grows into the tens of thousands. Flagged here once instead
// of repeating the caveat at every call site.
const ROW_CAP = 5000;

// purchase_records now holds real historical invoice data back to 2023
// (18,989 rows as of 2026-09-17, growing via /admin/purchase-import) — the
// generic ROW_CAP above was sized for IMMS's own (near-empty) transaction
// ledger and is too small for a full-table or multi-year purchase_records
// fetch (e.g. a 12-month trailing trend can approach one full source_year's
// worth, ~5000 rows, on its own). Revisit with real SQL aggregation if this
// table keeps growing well past today's scale.
const PURCHASE_ROW_CAP = 25000;

// 2026-09-21 발견(짐작 아니라 DB 직접 대조로 확인): 이 파일 전체가
// ".limit(ROW_CAP)"/".limit(PURCHASE_ROW_CAP)" 하나로 "전체 행을 가져온다"고
// 가정하고 있었는데, Supabase Data API는 클라이언트가 .limit()으로 더 크게
// 요청해도 프로젝트의 서버 측 "Max Rows" 기본값(1000)까지만 조용히 잘라서
// 돌려준다 — 게다가 이 파일의 쿼리 대부분이 .order() 없이 호출돼서 어떤
// 1000건이 돌아오는지도 사실상 무작위였다. 실제로 새로 만든 "구매 분석
// (연도별 누적)" 화면을 실제 데이터로 검증하다가 2024년 구매액이 화면에서
// 통째로 빠지고 2023년 위주로만 ~1000건 분량이 반영된 걸 보고 발견했다
// (purchase_records 전체 18,989건 vs 실제 반영된 건 극히 일부 —
// select count(*)/연도별 sum을 SQL로 직접 대조해 확인). price_history
// (13,007건)/items(18,626건) 등 이 파일에서 큰 테이블을 통으로 읽는 다른
// 함수들도 전부 같은 결함이 있었다 — "카테고리별 평균단가"가 일부
// 카테고리에서 "-"로 나온 것도 이 truncation 때문이었을 가능성이 높다.
// 고침: 서버의 실제 max-rows 설정이 몇인지 신뢰하지 않고, 항상
// SUPABASE_PAGE_SIZE 단위로 .range()를 돌며 끝까지 가져온다. 페이지마다
// 같은 정렬 기준(주로 각 테이블의 고유키)을 .order()로 명시해야 페이지
// 경계에서 행이 빠지거나 중복되지 않는다.
const SUPABASE_PAGE_SIZE = 1000;

// fetchPage는 Supabase 쿼리 빌더를 그대로 리턴/await하는 형태 둘 다 받을 수
// 있도록 Promise가 아니라 PromiseLike로 받는다 — PostgrestFilterBuilder는
// .then()만 구현한 thenable이라 Promise 타입(.catch/.finally 요구)과
// 구조적으로 안 맞아서 그대로 쓰면 tsc가 에러를 낸다.
async function fetchAllPages<T>(
  cap: number,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < cap; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE, cap) - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) break;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < to - from + 1) break; // 마지막 페이지(요청한 만큼 안 찼음)
  }
  return all;
}

// 2026-09-21 발견(회귀): admin.rpc()도 위 fetchAllPages와 똑같은 결함
// 클래스를 갖고 있었다 — "SQL 함수를 RPC 한 번으로 부르면 전체 행이
// 돌아온다"고 가정했는데, 실제로는 PostgREST의 프로젝트 단위 "Max Rows"
// 기본값(1000)이 RPC 결과에도 그대로 적용돼 조용히 잘렸다. 이 세션에서
// 방금 만든 pis_price_movement_summary(품목당 1행, 6,506건)를 배포 후
// 라이브에서 확인하다가 06 가격분석 "단가 변동"이 6503 대신 정확히
// 1000으로 나오는 걸 보고 발견함 — 숫자가 딱 1000이라는 게 결정적 단서.
// 고침: 결과가 커질 수 있는 RPC 함수들(pis_price_movement_summary,
// pis_reorder_candidates, pis_standard_cost_variance)에 p_limit/p_offset +
// 결정적 order by item_code를 SQL 쪽에 추가했다(마이그레이션
// pis_rpc_pagination_fix 참고, raw SQL로 6,506건 페이지 합이 정확히
// 일치함을 확인). 이 헬퍼가 fetchAllPages와 동일한 패턴으로 그 페이지를
// 끝까지 루프 돈다 — PostgREST의 실제 max-rows 값이 얼마든 상관없이 항상
// 안전하다.
const ITEM_SCALE_ROW_CAP = 30000; // items(18,626)/price_history(19,510) 규모를 넉넉히 덮는 안전 상한 — 실제 페이지 수는 각 함수의 진짜 행 수만큼만 돈다.

async function fetchAllRpcPages<T>(
  cap: number,
  fetchPage: (limit: number, offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; offset < cap; offset += SUPABASE_PAGE_SIZE) {
    const { data, error } = await fetchPage(SUPABASE_PAGE_SIZE, offset);
    if (error) break;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < SUPABASE_PAGE_SIZE) break; // 마지막 페이지(요청한 만큼 안 찼음)
  }
  return all;
}

export type DashboardKpis = {
  totalItems: number;
  itemsWithCategory: number;
  itemsWithPrice: number;
  suppliers: number;
  totalTransactions: number;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  await requireAdmin();
  const admin = createAdminClient();

  const [items, itemsWithCategory, itemsWithPrice, suppliers, transactions] = await Promise.all([
    admin.from("items").select("item_code", { count: "exact", head: true }),
    admin.from("items").select("item_code", { count: "exact", head: true }).not("item_category", "is", null),
    admin.from("price_history").select("item_code", { count: "exact", head: true }),
    admin.from("suppliers").select("code", { count: "exact", head: true }),
    admin.from("transactions").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalItems: items.count ?? 0,
    itemsWithCategory: itemsWithCategory.count ?? 0,
    // Counts price_history ROWS (snapshots), not distinct items — a rough
    // "얼마나 자주 갱신되나" signal, don't reuse as a distinct-item count.
    itemsWithPrice: itemsWithPrice.count ?? 0,
    suppliers: suppliers.count ?? 0,
    totalTransactions: transactions.count ?? 0,
  };
}

export type CategoryBreakdownRow = {
  category: string;
  itemCount: number;
  avgUnitPrice: number | null;
};

// 2026-09-21, Kevin 요청 #2(속도개선) 2라운드. 이전엔 items(18,626건) +
// 품목별 최신단가를 각각 fetchAllPages로 통째로 가져와 JS Map으로
// GROUP BY 했다(06 가격분석 화면의 일부, 다른 3개 함수와 합쳐 10초대).
// `pis_category_breakdown` SQL 함수(LEFT JOIN + GROUP BY, 마이그레이션
// 참고)로 왕복을 1회로 줄인다 — 배포 전 raw SQL로 재현해 라이브 값
// (상품 6,653/₩31,444, 부재료 5,720/₩23,727 등 7개 카테고리)과 정확히
// 일치함을 확인함(CLAUDE.md 참고).
export async function getCategoryBreakdown(): Promise<CategoryBreakdownRow[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("pis_category_breakdown");
  if (error) {
    console.error("pis_category_breakdown RPC 실패:", error);
    return [];
  }

  // avg_unit_price는 numeric이라 PostgREST를 통해 문자열로 온다 — Number() 필수.
  return (data ?? [])
    .map((r) => ({
      category: r.category,
      itemCount: Number(r.item_count),
      avgUnitPrice: r.avg_unit_price === null ? null : Math.round(Number(r.avg_unit_price)),
    }))
    .sort((a, b) => b.itemCount - a.itemCount);
}

// ---------------------------------------------------------------------------
// 얼마나 샀나? / 어디에서 많이 샀나?
// ---------------------------------------------------------------------------

type PurchaseRecordRow = {
  item_code: string;
  item_name: string;
  purchase_date: string; // date column, "YYYY-MM-DD"
  qty: number;
  supply_amount: number;
  supplier_code: string | null;
  supplier_name: string;
};

// sinceIso/untilIso must be "YYYY-MM-DD" (purchase_date is a date column,
// not a timestamp) — callers pass `.toISOString().slice(0, 10)`.
async function fetchPurchaseRecords(admin: AdminClient, sinceIso?: string, untilIso?: string): Promise<PurchaseRecordRow[]> {
  return fetchAllPages<PurchaseRecordRow>(PURCHASE_ROW_CAP, (from, to) => {
    let q = admin
      .from("purchase_records")
      .select("item_code, item_name, purchase_date, qty, supply_amount, supplier_code, supplier_name")
      // 2026-09-21, Kevin 요청("PIS 구현" #1): PIS는 M2000(이천공장) 스코프만
      // 관리 — department가 다른(구매계약부/해외수입/고객센터/개인명 등)
      // 행은 대시보드 집계에서 제외한다. src/lib/pis-scope.ts 참고.
      .eq("department", M2000_DEPARTMENT)
      .order("id", { ascending: true })
      .range(from, to);
    if (sinceIso) q = q.gte("purchase_date", sinceIso);
    if (untilIso) q = q.lt("purchase_date", untilIso);
    return q;
  });
}

// 2026-09-18, Kevin 요청: "PIS에 디스플레이되는 모든 숫자들은 그걸
// 누르면, 실제로 어떻게 그 값들이 표기되었는지 상세내용으로 이동해서
// 내용을 이해하고 인사이트를 얻을 수 있도록" — 대시보드의 집계값(구매액,
// 단가변동, 업체별가격차이 등)은 전부 이 purchase_records 원장 위에서
// 계산되므로, 특정 품목/거래처/카테고리/기간 조건에 맞는 원본 전표 행을
// 그대로 보여주는 범용 조회를 하나 만들어 여러 드릴다운에서 재사용한다.
// 클라이언트 컴포넌트(Drilldown)에서 이 함수를 서버 액션 참조로 직접
// 넘겨 클릭 시점에만 호출한다 — 페이지 최초 로드에 원본 행 전체를 함께
// 실어 보내지 않기 위함.
export type PurchaseRecordDetailRow = {
  purchase_date: string;
  supplier_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  unit_price: number;
  supply_amount: number;
};

export type PurchaseRecordDetailFilter = {
  itemCode?: string;
  supplierName?: string;
  category?: string; // items.item_category — items 테이블과 조인해 코드 목록으로 변환
  sinceIso?: string; // "YYYY-MM-DD"
  untilIso?: string; // "YYYY-MM-DD", 배타적 상한
  limit?: number;
};

const DRILLDOWN_ROW_LIMIT = 300;

export async function getPurchaseRecordDetail(filter: PurchaseRecordDetailFilter): Promise<PurchaseRecordDetailRow[]> {
  await requireAdmin();
  const admin = createAdminClient();

  let q = admin
    .from("purchase_records")
    .select("purchase_date, supplier_name, item_code, item_name, qty, unit_price, supply_amount")
    .eq("department", M2000_DEPARTMENT) // 2026-09-21, M2000 스코프 — src/lib/pis-scope.ts 참고
    .order("purchase_date", { ascending: false })
    .limit(Math.min(filter.limit ?? DRILLDOWN_ROW_LIMIT, DRILLDOWN_ROW_LIMIT));

  if (filter.itemCode) q = q.eq("item_code", filter.itemCode);
  if (filter.supplierName) q = q.eq("supplier_name", filter.supplierName);
  if (filter.sinceIso) q = q.gte("purchase_date", filter.sinceIso);
  if (filter.untilIso) q = q.lt("purchase_date", filter.untilIso);

  if (filter.category) {
    const { data: itemRows } = await admin.from("items").select("item_code").eq("item_category", filter.category);
    const codes = (itemRows ?? []).map((r) => r.item_code);
    if (codes.length === 0) return [];
    q = q.in("item_code", codes);
  }

  const { data } = await q;
  return data ?? [];
}

export type PurchaseInsights = {
  windowDays: number;
  // 2026-09-18: 드릴다운(getPurchaseRecordDetail)이 이 함수와 정확히 같은
  // 기간 조건으로 원본 행을 다시 조회할 수 있도록 실제 계산에 쓰인 since를
  // 그대로 노출한다 — 화면에서 Date.now()를 다시 계산하면 초 단위 오차로
  // 경계가 살짝 어긋날 수 있어서.
  windowSinceIso: string;
  recordCount: number; // purchase_records rows in the window (one per invoice line), not IMMS txns
  totalAmount: number;
  // % of records with a supplier_code MATCHED to the suppliers table (via
  // exact supplier_name match at import time) — not "supplier recorded",
  // since supplier_name itself is almost always present in real invoice
  // data. See the 2026-09-17 CLAUDE.md note on the 680-row backfill for the
  // match-rate baseline (438/680 ≈ 64%).
  supplierCoveragePct: number;
  byCategory: { category: string; qty: number; amount: number }[];
  byItem: { item_code: string; item_name: string; qty: number; amount: number }[];
  bySupplier: { supplier_code: string | null; supplier_name: string; amount: number; sharePct: number }[];
  top1SupplierSharePct: number | null;
};

// "얼마나 샀나" 품목별/카테고리별, "어디에서 많이 샀나" 업체별/품목별/
// 카테고리별 비중을 한 번에 계산 — purchase_records(실제 구매현황 전표
// 데이터)를 소스로 쓴다(2026-09-17부터, 파일 상단 주석 참고). 거래처는
// supplier_name(항상 기록됨) 기준으로 묶고, supplier_code는 매칭됐을 때만
// 참고용으로 함께 반환한다.
// 2026-09-21, Kevin 요청 #2(속도개선). 이전엔 purchase_records를
// fetchAllPages로 통째로 가져와(365일 창이면 M2000 스코프 대부분에
// 해당) JS에서 카테고리/품목/업체 3차원을 동시에 GROUP BY 했다(HOME · 05
// 업체분석 · 07 공급Risk 세 화면에서 반복 호출됨). getYearlyPurchaseBreakdown과
// 같은 방식으로 4개의 SQL 함수(pis_purchase_*, 마이그레이션 참고)로
// 옮긴다 — 같은 세션에서 발견한 `.in("item_code", ...)` 카테고리 매칭
// 버그(위 getYearlyPurchaseBreakdown 주석 참고)도 함께 해소된다(byCategory
// 는 현재 화면에 노출되진 않지만 반환 타입에 포함돼 있어 정확도를 맞춰둔다).
export async function getPurchaseInsights(days = 30, topN = 10): Promise<PurchaseInsights> {
  await requireAdmin();
  const admin = createAdminClient();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [totalsRes, categoryRes, itemRes, supplierRes] = await Promise.all([
    admin.rpc("pis_purchase_totals", { p_since: since }),
    admin.rpc("pis_purchase_by_category", { p_since: since }),
    admin.rpc("pis_purchase_by_item", { p_since: since, p_top_n: topN }),
    admin.rpc("pis_purchase_by_supplier", { p_since: since, p_top_n: topN }),
  ]);

  for (const [name, res] of [
    ["pis_purchase_totals", totalsRes],
    ["pis_purchase_by_category", categoryRes],
    ["pis_purchase_by_item", itemRes],
    ["pis_purchase_by_supplier", supplierRes],
  ] as const) {
    if (res.error) console.error(`${name} RPC 실패:`, res.error);
  }

  const totals = totalsRes.data?.[0];
  const recordCount = totals ? Number(totals.record_count) : 0;
  if (recordCount === 0) {
    return {
      windowDays: days,
      windowSinceIso: since,
      recordCount: 0,
      totalAmount: 0,
      supplierCoveragePct: 0,
      byCategory: [],
      byItem: [],
      bySupplier: [],
      top1SupplierSharePct: null,
    };
  }

  // pis_purchase_* 함수들의 numeric 컬럼(amount/total_amount)도 위
  // getYearlyPurchaseBreakdown과 마찬가지로 PostgREST를 통해 문자열로
  // 온다 — Number()로 변환.
  const totalAmount = Math.round(Number(totals!.total_amount));

  const bySupplierSorted = (supplierRes.data ?? []).map((r) => ({
    supplier_code: r.supplier_code,
    supplier_name: r.supplier_name,
    amount: Math.round(Number(r.amount)),
    sharePct: totalAmount > 0 ? Math.round((Number(r.amount) / totalAmount) * 1000) / 10 : 0,
  }));

  return {
    windowDays: days,
    windowSinceIso: since,
    recordCount,
    totalAmount,
    supplierCoveragePct: Math.round((Number(totals!.records_with_supplier_code) / recordCount) * 1000) / 10,
    byCategory: (categoryRes.data ?? []).map((r) => ({ category: r.category, qty: Number(r.qty), amount: Math.round(Number(r.amount)) })),
    byItem: (itemRes.data ?? []).map((r) => ({ item_code: r.item_code, item_name: r.item_name, qty: Number(r.qty), amount: Math.round(Number(r.amount)) })),
    bySupplier: bySupplierSorted,
    top1SupplierSharePct: bySupplierSorted[0]?.sharePct ?? null,
  };
}

export type MonthlyAmount = { month: string; amount: number };
export type PurchaseTrend = {
  monthly: MonthlyAmount[]; // trailing 12 months, oldest first
  thisMonthAmount: number;
  lastMonthAmount: number;
  momChangePct: number | null; // null when lastMonthAmount is 0 (nothing to compare against)
  yearToDateAmount: number;
  sameMonthLastYearAmount: number | null; // null when no data exists that far back
  earliestRecordDate: string | null;
};

// 월별 구매금액 + 전월 대비 증감 + 연초 대비 누적 + 전년 동월 —
// purchase_records에 2023년부터 실데이터가 있어(2026-09-17부터) "전년
// 동월"이 이제 실제 값으로 채워진다. 이전 IMMS 추정치 버전은 이 시스템
// 자체가 올해 시작이라 항상 null이었다 — earliestRecordDate가 비교 시점
// (작년 동월)보다 이전일 때만 계산해, 데이터가 없는데 0으로 채워 "작년보다
// 100% 늘었다"는 식의 허위 신호를 만들지 않는다.
export async function getPurchaseTrend(): Promise<PurchaseTrend> {
  await requireAdmin();
  const admin = createAdminClient();

  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const [records, { data: earliestRow }] = await Promise.all([
    fetchPurchaseRecords(admin, twelveMonthsAgo.toISOString().slice(0, 10)),
    admin
      .from("purchase_records")
      .select("purchase_date")
      .eq("department", M2000_DEPARTMENT) // 2026-09-21, M2000 스코프 — src/lib/pis-scope.ts 참고
      .order("purchase_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const amountByMonth = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    amountByMonth.set(monthKey(d), 0);
  }

  for (const r of records) {
    const key = monthKey(new Date(r.purchase_date));
    if (!amountByMonth.has(key)) continue;
    amountByMonth.set(key, (amountByMonth.get(key) ?? 0) + r.supply_amount);
  }

  const monthly = Array.from(amountByMonth, ([month, amount]) => ({ month, amount: Math.round(amount) }));
  const thisMonthAmount = monthly[monthly.length - 1]?.amount ?? 0;
  const lastMonthAmount = monthly[monthly.length - 2]?.amount ?? 0;
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearToDateAmount = monthly.filter((m) => m.month >= monthKey(yearStart)).reduce((sum, m) => sum + m.amount, 0);

  // 전년 동월: 우리가 가진 데이터의 시작일이 그 시점보다 이전일 때만 의미가
  // 있다 (아니면 "0건이라 0원"을 "작년 대비 감소"로 잘못 읽을 수 있음).
  const sameMonthLastYear = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const earliestRecordDate = earliestRow?.purchase_date ?? null;
  let sameMonthLastYearAmount: number | null = null;
  if (earliestRecordDate && new Date(earliestRecordDate) <= sameMonthLastYear) {
    const sameMonthNext = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
    const priorYearRecords = await fetchPurchaseRecords(
      admin,
      sameMonthLastYear.toISOString().slice(0, 10),
      sameMonthNext.toISOString().slice(0, 10)
    );
    sameMonthLastYearAmount = Math.round(priorYearRecords.reduce((sum, r) => sum + r.supply_amount, 0));
  }

  return {
    monthly,
    thisMonthAmount,
    lastMonthAmount,
    momChangePct: lastMonthAmount > 0 ? Math.round(((thisMonthAmount - lastMonthAmount) / lastMonthAmount) * 1000) / 10 : null,
    yearToDateAmount: Math.round(yearToDateAmount),
    sameMonthLastYearAmount,
    earliestRecordDate,
  };
}

// ---------------------------------------------------------------------------
// 구매 분석 (연도별 누적) — 2026-09-18, Kevin 피드백: "최근 30일" 기준 업체별/
// 품목별/카테고리별 구매액 랭킹은 부품별로 발주 주기·규모가 달라 큰 의미가
// 없다 — 오히려 26년/25년/24년처럼 연도 단위로 누적해서, 같은 업체·품목이
// 해가 갈수록 어떻게 바뀌는지 나란히 보여주는 게 인사이트가 있다는 지적.
// 대시보드에는 더 이상 30일 랭킹을 인라인으로 두지 않고(getPurchaseInsights의
// byCategory/byItem/bySupplier는 이제 "구매 집중도" 계산에만 쓰고 화면
// 랭킹 표시에는 안 씀), 대신 /admin/purchases 페이지에서 이 함수로 연도별
// 랭킹을 보여준다. purchase_records 전체(2023년~)를 한 번에 읽어 세
// 차원(업체/품목/카테고리)을 동시에 집계 — 매번 따로 조회하면 18,989행짜리
// 테이블을 3번 스캔하게 되어 비효율적이다.
// ---------------------------------------------------------------------------

export type YearlyBreakdownRow = {
  key: string;
  label: string;
  byYear: Record<string, number>; // "YYYY" -> 금액(반올림)
  total: number;
};

export type YearlyPurchaseBreakdown = {
  years: string[]; // 오름차순, 예: ["2023","2024","2025","2026"]
  yearTotals: Record<string, number>; // 그 해 전체 구매액(모든 업체/품목 합계) — 비중 계산용
  bySupplier: YearlyBreakdownRow[];
  byItem: YearlyBreakdownRow[];
  byCategory: YearlyBreakdownRow[];
  recordCount: number;
};

// 2026-09-21, Kevin 요청 #2(속도개선). 이전엔 purchase_records 전체(M2000
// 스코프, 18,607건)를 fetchAllPages로 ~19번 왕복해 가져온 뒤 업체/품목/
// 카테고리 3차원을 JS에서 동시에 GROUP BY 했다(01 구매현황 페이지, 실측
// 15.3초 — 이 앱에서 가장 느린 화면이었음). 4개의 SQL 함수(pis_yearly_*,
// 마이그레이션 참고)로 옮겨 왕복을 ~19회 → 4회로 줄인다.
//
// 부수 발견: 옮기면서 옛 코드와 결과를 대조하다가 `.in("item_code",
// Array.from(itemCodes))`(item_code 2347개)로 items 테이블에서 카테고리를
// 조회하던 방식이 조용히 일부만 매칭되고 나머지는 전부 "미분류"로 잘못
// 떨어지는 버그를 발견했다 — 실제로는 "부재료"가 4개년 합계 1위(₩14.15B)
// 인데 화면엔 "미분류"가 ₩11.1B로 부풀려져 1위로 잘못 표시되고 있었다
// (LEFT JOIN 기반 SQL로 직접 대조해 확인, CLAUDE.md 참고). 새 SQL 함수는
// LEFT JOIN이라 이 결함이 구조적으로 발생하지 않는다 — 속도 개선이면서
// 동시에 카테고리별 구매액 정확도 버그 수정.
export async function getYearlyPurchaseBreakdown(topN = 15): Promise<YearlyPurchaseBreakdown> {
  await requireAdmin();
  const admin = createAdminClient();

  const [totalsRes, supplierRes, itemRes, categoryRes] = await Promise.all([
    admin.rpc("pis_yearly_totals"),
    admin.rpc("pis_yearly_by_supplier", { p_top_n: topN }),
    admin.rpc("pis_yearly_by_item", { p_top_n: topN }),
    admin.rpc("pis_yearly_by_category", { p_top_n: topN }),
  ]);

  for (const [name, res] of [
    ["pis_yearly_totals", totalsRes],
    ["pis_yearly_by_supplier", supplierRes],
    ["pis_yearly_by_item", itemRes],
    ["pis_yearly_by_category", categoryRes],
  ] as const) {
    if (res.error) console.error(`${name} RPC 실패:`, res.error);
  }

  const totalsData = totalsRes.data ?? [];
  if (totalsData.length === 0) {
    return { years: [], yearTotals: {}, bySupplier: [], byItem: [], byCategory: [], recordCount: 0 };
  }

  const sortedYears = totalsData.map((r) => r.year).sort();
  const yearTotals: Record<string, number> = {};
  let recordCount = 0;
  for (const r of totalsData) {
    yearTotals[r.year] = Math.round(Number(r.amount));
    recordCount += Number(r.record_count);
  }

  // pis_yearly_* 함수들은 numeric 컬럼(amount/total)을 PostgREST를 통해
  // 문자열로 반환한다(정밀도 보존 목적 — bigint/int와 달리 numeric은 항상
  // 문자열 직렬화됨) — 여기서 반드시 Number()로 변환해야 한다. 생성된
  // database.types.ts의 TS 타입은 number로 보이지만 실제 런타임 값은
  // 문자열이므로 타입만 믿으면 안 된다.
  function groupRows<T extends { year: string; amount: number; total: number }>(
    rows: T[],
    keyOf: (r: T) => string,
    labelOf: (r: T) => string
  ): YearlyBreakdownRow[] {
    const byKey = new Map<string, { label: string; byYear: Record<string, number>; total: number }>();
    for (const r of rows) {
      const key = keyOf(r);
      const entry = byKey.get(key) ?? { label: labelOf(r), byYear: {}, total: Number(r.total) };
      entry.byYear[r.year] = Math.round(Number(r.amount));
      byKey.set(key, entry);
    }
    return Array.from(byKey, ([key, v]) => ({
      key,
      label: v.label,
      byYear: Object.fromEntries(sortedYears.map((y) => [y, v.byYear[y] ?? 0])),
      total: Math.round(v.total),
    })).sort((a, b) => b.total - a.total);
  }

  const bySupplier = groupRows(supplierRes.data ?? [], (r) => r.supplier_name, (r) => r.supplier_name);
  const byItem = groupRows(itemRes.data ?? [], (r) => r.item_code, (r) => r.item_name);
  const byCategory = groupRows(categoryRes.data ?? [], (r) => r.category, (r) => r.category);

  return {
    years: sortedYears,
    yearTotals,
    bySupplier,
    byItem,
    byCategory,
    recordCount,
  };
}

// 2026-09-18, Kevin 피드백: "이번 달 얼마/전월 대비/연초 누적/작년 동월"
// 같은 단순 절대금액 비교는 부품별 발주 규모·주기가 매달 크게 달라 의미를
// 찾기 어렵다 — 대신 "올해 1월 1일부터 오늘까지"를 작년/재작년의 같은
// 기간(동기간, 월-일 기준)과 비교하면 계절성 없이 공정하게 비교된다.
// getPurchaseTrend의 월별 절대금액 대신 대시보드 상단에서 이 함수를 쓴다.
export type YearToDateComparison = {
  asOfLabel: string; // 예: "9월 18일 기준"
  years: { year: string; amount: number }[]; // 오름차순(오래된 연도부터)
};

// 2026-09-21, Kevin 요청 #2(속도개선). HOME 화면에서 매번 purchase_records
// 3~4년치(테이블 대부분)를 fetchAllPages로 통째로 가져와 "동기간(월-일
// 기준)" 합산을 JS에서 했다 — 단순 GROUP BY라 `pis_year_to_date_comparison`
// SQL 함수(마이그레이션 참고)로 옮긴다.
export async function getYearToDateComparison(yearsBack = 3): Promise<YearToDateComparison> {
  await requireAdmin();
  const admin = createAdminClient();

  const now = new Date();
  const startYear = now.getFullYear() - (yearsBack - 1);
  const monthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const { data, error } = await admin.rpc("pis_year_to_date_comparison", { p_start_year: startYear, p_month_day: monthDay });
  if (error) console.error("pis_year_to_date_comparison RPC 실패:", error);

  const byYear = new Map<string, number>();
  for (const r of data ?? []) byYear.set(r.year, Number(r.amount)); // numeric은 문자열로 옴 — Number() 필수

  const years: { year: string; amount: number }[] = [];
  for (let y = startYear; y <= now.getFullYear(); y++) {
    years.push({ year: String(y), amount: Math.round(byYear.get(String(y)) ?? 0) });
  }

  return { asOfLabel: `${now.getMonth() + 1}월 ${now.getDate()}일 기준`, years };
}

// ---------------------------------------------------------------------------
// 가격이 올랐나?
// ---------------------------------------------------------------------------

export type PriceMover = { item_code: string; item_name: string; earliestPrice: number; latestPrice: number; changePct: number };
export type PriceMovementSummary = {
  itemsWithHistory: number; // >=2 snapshots, a real before/after exists
  itemsSingleSnapshot: number;
  risen: number;
  fallen: number;
  unchanged: number;
  topRisers: PriceMover[];
  topFallers: PriceMover[];
  earliestSnapshotDate: string | null;
  latestSnapshotDate: string | null;
};

// "단가 상승률"의 정직한 버전: 전년 대비가 아니라 "데이터 수집을 시작한
// 시점(가장 오래된 스냅샷) 대비"다. price_history가 2026-09-10부터 쌓이기
// 시작했으므로 지금은 창(window)이 짧지만, 로직 자체는 시간이 지나 데이터가
// 쌓일수록 자동으로 더 의미있는 숫자를 낸다 — 코드를 다시 바꿀 필요 없음.
// 2026-09-21, Kevin 요청 #2(속도개선) 2라운드. 이전엔 price_history
// 전체(19,510건)를 fetchAllPages로 통째로 가져와(≈20회 왕복) JS Map으로
// 품목별 최초/최신 스냅샷을 구했다 — HOME과 06 가격분석이 같이 부르는
// 함수라 두 화면 모두의 병목이었다(HOME 9초대, 06 10초대에 머문 원인).
// `pis_price_movement_summary` SQL 함수(품목당 한 행으로 최초/최신
// 단가·일자를 이미 계산해서 반환, 마이그레이션 참고)로 왕복을 1회로
// 줄인다 — risen/fallen/unchanged 카운트와 top mover 선정은 로직이
// 단순해 그대로 JS에 둔다. 배포 전 raw SQL로 재현해 라이브 값
// (itemsWithHistory 6,503, risen/fallen/unchanged 0/0/6503)과 정확히
// 일치함을 확인함(CLAUDE.md 참고).
export async function getPriceMovementSummary(limit = 8): Promise<PriceMovementSummary> {
  await requireAdmin();
  const admin = createAdminClient();

  // 2026-09-21: 단일 admin.rpc() 호출은 PostgREST max-rows에 걸려 6,506건 중
  // 1000건만 돌아온다(회귀 발견 경위는 fetchAllRpcPages 주석 참고) —
  // p_limit/p_offset으로 페이지를 끝까지 돈다.
  const rows = await fetchAllRpcPages(ITEM_SCALE_ROW_CAP, (pageLimit, offset) =>
    admin.rpc("pis_price_movement_summary", { p_limit: pageLimit, p_offset: offset })
  );
  let earliestSnapshotDate: string | null = null;
  let latestSnapshotDate: string | null = null;
  let risen = 0;
  let fallen = 0;
  let unchanged = 0;
  let withHistoryCount = 0;
  const movers: PriceMover[] = [];

  for (const r of rows) {
    // earliest_price/latest_price는 numeric이라 PostgREST를 통해 문자열로
    // 온다 — Number() 필수(위 getYearlyPurchaseBreakdown 등과 동일 패턴).
    const earliest = Number(r.earliest_price);
    const latest = Number(r.latest_price);
    if (!earliestSnapshotDate || r.earliest_date < earliestSnapshotDate) earliestSnapshotDate = r.earliest_date;
    if (!latestSnapshotDate || r.latest_date > latestSnapshotDate) latestSnapshotDate = r.latest_date;
    if (r.earliest_date === r.latest_date) continue; // 스냅샷 1개뿐 — itemsSingleSnapshot으로만 집계

    withHistoryCount++;
    if (latest > earliest) risen++;
    else if (latest < earliest) fallen++;
    else unchanged++;
    const changePct = earliest > 0 ? Math.round(((latest - earliest) / earliest) * 1000) / 10 : 0;
    movers.push({ item_code: r.item_code, item_name: r.item_name ?? r.item_code, earliestPrice: earliest, latestPrice: latest, changePct });
  }

  return {
    itemsWithHistory: withHistoryCount,
    itemsSingleSnapshot: rows.length - withHistoryCount,
    risen,
    fallen,
    unchanged,
    topRisers: [...movers].sort((a, b) => b.changePct - a.changePct).slice(0, limit),
    topFallers: [...movers].sort((a, b) => a.changePct - b.changePct).slice(0, limit),
    earliestSnapshotDate,
    latestSnapshotDate,
  };
}

// 2026-09-17 고도화: 위 getPriceMovementSummary는 이카운트 등록 현재단가
// 스냅샷(2026-09-10부터, 창이 짧음) 기반이라 "전년 평균단가"/"업체별
// 가격차이"는 이 함수만으로는 계산 불가능해 blocked로 남아있었다. 하지만
// purchase_records에는 2023년부터 실제 구매 건별 unit_price가 있으므로,
// 여기서는 그 데이터로 이 두 가지를 직접 계산한다 — Kevin이 명시적으로
// 언급한 가격절감분석/PPV(Purchase Price Variance)에 가장 가까운 지표.
//
// 2026-09-21, Kevin 요청 #2(속도개선) 2라운드: 이전엔 이 함수가
// purchase_records 24개월치(≈9,000건)를 fetchAllPages로 통째로 가져와(로우
// 아래 세 가지 데이터 품질 필터·가중평균·min/max 계산을 전부 JS에서 했다
// (06 가격분석 화면에서 가장 무거운 부분). `pis_price_yoy_movers`/
// `pis_price_supplier_gaps` 두 SQL 함수(마이그레이션 참고)로 옮긴다 — 아래
// 세 필터(범용 버킷 코드/비제품성 코드/단위불일치 sanity cap)는 로직
// 그대로 SQL로 재현했고, 배포 전 이 JS 버전과 raw SQL을 나란히 돌려 숫자·
// 순위·품목명까지 정확히 일치함을 확인함(YoY 943개/상위 10건, 업체별
// 가격차이 58개/₩33,246,268/상위 3건 — CLAUDE.md 참고).
export type YoyPriceMover = {
  item_code: string;
  item_name: string;
  priorAvgPrice: number;
  recentAvgPrice: number;
  changePct: number;
};

export type SupplierPriceGap = {
  item_code: string;
  item_name: string;
  minSupplier: string;
  minPrice: number;
  maxSupplier: string;
  maxPrice: number;
  gapPct: number;
  // 최근 12개월 동안 minSupplier보다 비싸게 산 물량 전체를 minSupplier 가격
  // 기준으로 다시 계산했을 때 아꼈을 금액 — 실제 액션 가능한 절감 추정치.
  potentialSavings: number;
};

export type PriceVarianceInsights = {
  windowLabel: string;
  yoyComparableItemCount: number; // 최근 12개월과 이전 12개월 모두 구매 이력이 있는 품목 수
  yoyTopRisers: YoyPriceMover[];
  yoyTopFallers: YoyPriceMover[];
  supplierGapItems: SupplierPriceGap[];
  supplierGapItemCount: number; // 최근 12개월에 공급업체가 2곳 이상인 품목 전체 수(표시된 topN이 아니라)
  supplierGapTotalPotentialSavings: number; // 위 전체 품목 기준 잠재 절감액 합계
  // 2026-09-18: 드릴다운이 이 함수와 정확히 같은 기간 경계로 원본 구매
  // 전표를 다시 조회할 수 있도록 실제 계산에 쓰인 경계값을 노출한다.
  recentStartIso: string; // 최근 12개월 시작일
  priorStartIso: string; // 이전 12개월 시작일(=24개월 전 시작)
};

// item_code별로 수량가중평균단가(=Σ(qty×unit_price)/Σqty)를 계산한다 — 단순
// 평균이 아니라 물량가중 평균을 쓰는 이유는 같은 품목이라도 발주 단위가
// 다른 여러 건을 동일 가중치로 섞으면 왜곡되기 때문. (2026-09-21부터 이
// 계산 자체는 `pis_price_yoy_movers`/`pis_price_supplier_gaps` SQL 함수
// 안에서 SUM(qty*unit_price)/SUM(qty)로 수행 — 아래는 그 SQL이 재현하는
// 원래 데이터 품질 필터 세 가지의 배경 설명.)

// 실제 운영 DB로 검증하다가 발견한 데이터 품질 문제(2026-09-17): 일부
// item_code는 진짜 단일 품목이 아니라 "일회성구매"/"기타AS자재"/"절단비"/
// "가공"처럼 서로 무관한 여러 건을 몰아넣는 범용 코드다 — 예를 들어
// F0329("일회성구매")는 24개월 안에서만도 서로 완전히 다른 수십~수백 개
// item_name이 같은 코드 아래 섞여 있어, 이 코드로 "평균단가"를 계산하면
// 완전히 무의미한 값(때로는 수만 %대의 가짜 "가격 변동")이 나온다. 진짜
// 같은 자재의 사양 표기 차이(예: 헤어라인 시트를 규격별로 약간 다르게
// 적은 경우)는 보통 코드당 이름 종류가 4개 이하로 나타나는 반면, 범용
// 코드는 12개 이상(F0329=389, H5501=100, F0217=90, E2103=70,
// H5542=12개, 2026-09-17 기준 실측)으로 뚜렷이 구분됐다 — 그 사이인
// 5개를 기준으로 잡아 배제한다. 완벽한 판별식은 아니지만(threshold 자체가
// 휴리스틱), 최소한 명백히 가짜인 수만 % 변동을 화면에 노출하는 것보다는
// 훨씬 낫다. (2026-09-21부터 `pis_price_yoy_movers`/`pis_price_supplier_gaps`
// SQL 함수 안에 `having count(distinct item_name) >= 5`로 그대로 재현됨.)

// 두 번째로 발견한 데이터 품질 문제(2026-09-17): 이름 종류로는 걸러지지
// 않는데도 가격이 수백~수만 % 뛰는 경우가 있었다 — 실제 원인을 행 단위로
// 대조해보니 같은 item_code(E7865, 원형단자)가 어떤 달엔 qty=500(개당
// 94~104원), 다른 달엔 qty=1(봉지당 67,500~74,500원)로 기록돼 있었다.
// 즉 가격이 오른 게 아니라 구매현황 원본에서 "개" 단위와 "봉지" 단위가
// 같은 item_code 밑에 섞여 들어간 것 — purchase_records엔 행별 단위
// 컬럼이 없어 이걸 구조적으로 구분할 방법이 없다. 실제 원자재/부자재
// 가격이 몇 달 사이 6배 이상 뛰는 일은 사실상 없다고 보고, 이 배수를
// 넘는 변동은 "가격 변동"이 아니라 단위 불일치로 간주해 화면에서
// 제외한다 — 진짜 급등이라 해도, 이 정도 배수를 근거 없이 보여주는
// 것보다는 빠지는 게 안전하다(① Data Integrity).
// 06 가격분석의 YoY/업체별가격차이 계산(SQL)과 getStandardCostVariance
// 둘 다 이 sanity cap을 쓴다 — 후자는 여전히 JS에서 필터링하므로 이 상수가
// 실제로 참조된다.
const SANITY_CHANGE_PCT_CAP = 500;

// 세 번째로 발견한 데이터 품질 문제(2026-09-17): 위 두 필터를 다 통과하고도
// 업체별 가격차이 상위권에 말이 안 되는 코드가 남았다 — D99999(items
// 마스터상 품명이 문자 그대로 "상품 일회성 코드", 즉 명시적 더미/placeholder
// 코드지만 24개월간 3건/3개 이름뿐이라 GENERIC_BUCKET_NAME_THRESHOLD=5를
// 못 넘김)와 F0002(품명 "배송비" — 물리적 자재가 아니라 건별로 금액이
// 달라지는 서비스/수수료성 라인이라 "단가"를 업체 간 비교할 대상이 아님).
// 둘 다 구매현황 행 개수로는 걸러지지 않으므로, purchase_records가 아니라
// items 마스터의 품명 자체를 근거로 걸러야 한다. "일회성"은 D99999류의
// 명시적 더미 코드를 잡고, "배송비"/"운임"/"택배비"는 실제 자재가 아닌
// 운송 관련 수수료 라인을 잡는다 — 완전한 목록이라 장담할 순 없지만(새
// 유형이 나오면 SQL 함수의 정규식에 추가), 지금 확인된 두 사례는 확실히
// 걸러진다. (2026-09-21부터 `pis_price_yoy_movers`/`pis_price_supplier_gaps`
// SQL 함수 안에 `item_name ~ '(일회성|배송비|운임|택배비)'`로 그대로 재현됨.)

// "전년 평균단가"(품목별 수량가중평균단가를 최근 12개월 vs 이전 12개월로
// 비교 — 달력상 연도가 아니라 굴러가는 12개월 창을 쓴 이유는
// getPurchaseTrend와 동일: 올해가 아직 안 끝나 부분 연도라 달력 연도 비교는
// 왜곡됨)와 "업체별 가격차이"(최근 12개월 동안 같은 품목을 2곳 이상 업체에서
// 산 경우 최저가 업체 대비 잠재 절감액)를 함께 계산한다.
export async function getPriceVarianceInsights(topN = 10): Promise<PriceVarianceInsights> {
  await requireAdmin();
  const admin = createAdminClient();

  const now = new Date();
  const recentStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const priorStart = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  const recentStartStr = recentStart.toISOString().slice(0, 10);
  const priorStartStr = priorStart.toISOString().slice(0, 10);

  const [yoyRes, gapRes] = await Promise.all([
    admin.rpc("pis_price_yoy_movers", { p_prior_start: priorStartStr, p_recent_start: recentStartStr }),
    admin.rpc("pis_price_supplier_gaps", { p_prior_start: priorStartStr, p_recent_start: recentStartStr }),
  ]);
  if (yoyRes.error) console.error("pis_price_yoy_movers RPC 실패:", yoyRes.error);
  if (gapRes.error) console.error("pis_price_supplier_gaps RPC 실패:", gapRes.error);

  // 두 RPC 모두 numeric 컬럼(가격/변동률/절감액)을 PostgREST를 통해
  // 문자열로 반환한다 — Number() 필수(이 파일 다른 RPC 호출부와 동일 패턴).
  const movers: YoyPriceMover[] = (yoyRes.data ?? []).map((r) => ({
    item_code: r.item_code,
    item_name: r.item_name,
    priorAvgPrice: Math.round(Number(r.prior_avg_price)),
    recentAvgPrice: Math.round(Number(r.recent_avg_price)),
    changePct: Number(r.change_pct),
  }));
  const yoyTopRisers = [...movers].sort((a, b) => b.changePct - a.changePct).slice(0, topN);
  const yoyTopFallers = [...movers].sort((a, b) => a.changePct - b.changePct).slice(0, topN);

  const gaps: SupplierPriceGap[] = (gapRes.data ?? []).map((r) => ({
    item_code: r.item_code,
    item_name: r.item_name,
    minSupplier: r.min_supplier,
    minPrice: Math.round(Number(r.min_price)),
    maxSupplier: r.max_supplier,
    maxPrice: Math.round(Number(r.max_price)),
    gapPct: Number(r.gap_pct),
    potentialSavings: Math.round(Number(r.potential_savings)),
  }));
  gaps.sort((a, b) => b.potentialSavings - a.potentialSavings);

  return {
    windowLabel: "최근 12개월 vs 이전 12개월",
    yoyComparableItemCount: movers.length,
    yoyTopRisers,
    yoyTopFallers,
    supplierGapItems: gaps.slice(0, topN),
    supplierGapItemCount: gaps.length,
    supplierGapTotalPotentialSavings: Math.round(gaps.reduce((sum, g) => sum + g.potentialSavings, 0)),
    recentStartIso: recentStartStr,
    priorStartIso: priorStartStr,
  };
}

export type StandardCostVarianceRow = {
  item_code: string;
  item_name: string;
  materialCost: number; // 이카운트 등록 표준원가(MATERIAL_COST)
  latestActualPrice: number; // price_history 최신 실제 입고단가
  variancePct: number; // (실제-표준)/표준 * 100, 양수=표준보다 비싸게 사고 있음
};

export type StandardCostVarianceInsights = {
  itemsWithMaterialCost: number; // items.material_cost가 채워진 품목 수(전체 대비 커버리지 참고용)
  comparableItemCount: number; // 표준원가 + 최신 실제단가 둘 다 있는 품목 수
  topOverStandard: StandardCostVarianceRow[]; // 표준원가보다 비싸게 사고 있는 품목 상위
  topUnderStandard: StandardCostVarianceRow[]; // 표준원가보다 싸게 사고 있는 품목 상위
};

// 2026-09-21, Kevin 요청("E-Count에서 더 끌어올 수 있는 자료 확인")으로
// 재점검하다가 발견: 품목조회(GetBasicProductsList)의 MATERIAL_COST(재료비
// 표준원가)가 이미 매 동기화마다 응답에 실려 왔는데 저장할 컬럼이 없어
// 버려지고 있었다(마이그레이션 0014로 items.material_cost 추가, 2026-09-21).
// 기존 "전년 대비 단가 상승률"/"업체별 가격차이"와는 다른 세 번째 렌즈 —
// "회사가 정해둔 표준원가 대비 실제로 얼마에 사고 있나"를 비교한다.
// **한계(화면에도 그대로 노출):** material_cost는 실제 매입 이력에서 계산한
// 값이 아니라 이카운트에 담당자가 입력해둔 표준원가다 — 회사가 이 필드를
// 꾸준히 최신화하지 않았다면 오래되거나 애초에 비어있는 품목이 많을 수
// 있다(price_history처럼 매일 실측되는 값과 성격이 다름). 그래서
// itemsWithMaterialCost(커버리지)를 항상 함께 반환해 "전체 품목 대비 이
// 비교가 몇 개 품목에서만 가능한지"를 숨기지 않는다. YoY 비교와 동일한
// 이유로 ±SANITY_CHANGE_PCT_CAP를 넘는 차이는 단위 불일치로 보고 제외한다.
// 2026-09-21, Kevin 요청 #2(속도개선) 2라운드. 이전엔 items 전체(18,626건)를
// fetchAllPages로 가져와(≈19회 왕복) JS에서 material_cost>0인 것만 걸러
// 최신단가와 비교했다(06 가격분석 화면 일부). `pis_standard_cost_variance`
// SQL 함수(items를 최신단가 CTE와 JOIN, material_cost>0인 것만 반환,
// 마이그레이션 참고)로 왕복을 1회로 줄인다 — sanity cap/topN 정렬은 그대로
// JS에 둔다. 배포 전 확인: material_cost가 채워진 품목이 현재 0건(다음
// 이카운트 동기화 이후 채워짐)이라 라이브 페이지도 "아직 없음"으로
// 표시됨 — SQL도 동일하게 0건 반환함을 확인.
export async function getStandardCostVariance(topN = 10): Promise<StandardCostVarianceInsights> {
  await requireAdmin();
  const admin = createAdminClient();

  // 2026-09-21: 지금은 material_cost가 채워진 품목이 0건이라 truncation을
  // 직접 겪진 않지만, 다음 이카운트 동기화 이후 수천 건으로 늘어날 수
  // 있어 다른 두 함수와 동일하게 미리 안전하게 페이지네이션한다
  // (fetchAllRpcPages 주석 참고).
  const withCost = await fetchAllRpcPages(ITEM_SCALE_ROW_CAP, (pageLimit, offset) =>
    admin.rpc("pis_standard_cost_variance", { p_limit: pageLimit, p_offset: offset })
  );
  const rows: StandardCostVarianceRow[] = [];
  for (const item of withCost) {
    // material_cost/latest_price는 numeric이라 PostgREST를 통해 문자열로 온다 — Number() 필수.
    const materialCost = Number(item.material_cost);
    const actual = Number(item.latest_price);
    if (actual <= 0) continue;
    const variancePct = Math.round(((actual - materialCost) / materialCost) * 1000) / 10;
    if (Math.abs(variancePct) > SANITY_CHANGE_PCT_CAP) continue;
    rows.push({ item_code: item.item_code, item_name: item.item_name, materialCost: Math.round(materialCost), latestActualPrice: Math.round(actual), variancePct });
  }

  return {
    itemsWithMaterialCost: withCost.length,
    comparableItemCount: rows.length,
    topOverStandard: [...rows].sort((a, b) => b.variancePct - a.variancePct).slice(0, topN),
    topUnderStandard: [...rows].sort((a, b) => a.variancePct - b.variancePct).slice(0, topN),
  };
}

// ---------------------------------------------------------------------------
// 재고가 적정한가?
// ---------------------------------------------------------------------------

export type StockItemRef = { item_code: string; item_name: string; qty_on_hand: number };
export type InventoryHealth = {
  itemsTracked: number;
  itemsWithStock: number;
  itemsWithSafetyStockSet: number;
  itemsWithReorderPointSet: number;
  lowStockItems: (StockItemRef & { safety_stock: number })[];
  excessStockItems: (StockItemRef & { reorder_point: number })[];
  agingStockItems: (StockItemRef & { lastOutboundDate: string | null })[];
  usageWindowDays: number;
  lowCoverageItems: (StockItemRef & { avgMonthlyUsage: number; coverageMonths: number })[];
};

// 재고부족위험 = 현재고 < 안전재고. 과잉재고 = 현재고 > 재주문점 ×
// EXCESS_FACTOR(임의 기준, 필요시 조정). 장기재고 = 재고>0인데 최근
// AGING_DAYS 내 출고(생산불출/창고이동/택배발송 출발) 기록이 없는 품목.
// 안전재고/재주문점을 설정한 품목이 없으면(오늘 실제로 0건) 앞의 두 목록은
// 항상 비어있다 — 버그가 아니라 /admin/items에서 값을 넣어야 채워지는
// 구조다.
const EXCESS_FACTOR = 3;
const AGING_DAYS = 90;
// 월평균 사용량 = 최근 USAGE_WINDOW_DAYS일 동안 stock_ledger의 음수 delta
// (출고) 합계 ÷ (USAGE_WINDOW_DAYS/30). 재고 커버리지(개월) = 현재고 ÷
// 월평균 사용량. 정직하게 밝혀둘 한계: stock_ledger의 "출고"는 생산불출/
// 반납/택배발송뿐 아니라 창고이동(예: M2000→2000 내부 이동)의 출발 레그도
// 포함한다 — 즉 실제 "소모"가 아니라 단순 "그 창고에서 나감"까지 섞여
// 월평균 사용량이 실제 소비보다 다소 과대 계산될 수 있음. 이미 장기재고
// (agingStockItems)가 같은 정의(음수 delta=출고)를 쓰고 있어 일관성을
// 위해 그대로 따름 — 창고별로 나눠 계산하려면 location_code까지 반영한
// 재설계가 필요.
const USAGE_WINDOW_DAYS = 90;

export async function getInventoryHealth(limit = 15): Promise<InventoryHealth> {
  await requireAdmin();
  const admin = createAdminClient();

  const [stock, { count: itemsTracked }, safetyItems, reorderItems] = await Promise.all([
    fetchAllPages<{ item_code: string | null; qty_on_hand: number | null }>(ROW_CAP, (from, to) =>
      admin.from("stock_total").select("item_code, qty_on_hand").order("item_code", { ascending: true }).range(from, to)
    ),
    admin.from("items").select("item_code", { count: "exact", head: true }),
    fetchAllPages<{ item_code: string; item_name: string; safety_stock: number }>(ROW_CAP, (from, to) =>
      admin
        .from("items")
        .select("item_code, item_name, safety_stock")
        .not("safety_stock", "is", null)
        .order("item_code", { ascending: true })
        .range(from, to)
    ),
    fetchAllPages<{ item_code: string; item_name: string; reorder_point: number }>(ROW_CAP, (from, to) =>
      admin
        .from("items")
        .select("item_code, item_name, reorder_point")
        .not("reorder_point", "is", null)
        .order("item_code", { ascending: true })
        .range(from, to)
    ),
  ]);

  const stockByItem = new Map(
    stock.filter((s): s is { item_code: string; qty_on_hand: number | null } => !!s.item_code).map((s) => [s.item_code, Number(s.qty_on_hand)] as const)
  );
  const itemsWithStock = Array.from(stockByItem.values()).filter((q) => q !== 0).length;

  const lowStockItems = safetyItems
    .map((i) => ({ item_code: i.item_code, item_name: i.item_name, qty_on_hand: stockByItem.get(i.item_code) ?? 0, safety_stock: i.safety_stock }))
    .filter((i) => i.qty_on_hand < i.safety_stock)
    .sort((a, b) => a.qty_on_hand - a.safety_stock - (b.qty_on_hand - b.safety_stock))
    .slice(0, limit);

  const excessStockItems = reorderItems
    .map((i) => ({ item_code: i.item_code, item_name: i.item_name, qty_on_hand: stockByItem.get(i.item_code) ?? 0, reorder_point: i.reorder_point }))
    .filter((i) => i.reorder_point > 0 && i.qty_on_hand > i.reorder_point * EXCESS_FACTOR)
    .sort((a, b) => b.qty_on_hand - b.reorder_point - (a.qty_on_hand - a.reorder_point))
    .slice(0, limit);

  // 장기재고: 재고 보유 품목 중 최근 출고 기록을 stock_ledger(음수 delta =
  // 출고)에서 찾는다. 오늘은 거래가 0건이라 항상 비어있지만, 구조는 실제
  // 데이터가 쌓이면 그대로 작동한다.
  const itemsWithStockCodes = Array.from(stockByItem.entries())
    .filter(([, q]) => q !== 0)
    .map(([code]) => code);

  let agingStockItems: (StockItemRef & { lastOutboundDate: string | null })[] = [];
  let lowCoverageItems: (StockItemRef & { avgMonthlyUsage: number; coverageMonths: number })[] = [];
  if (itemsWithStockCodes.length > 0) {
    const outbound = await fetchAllPages<{ item_code: string | null; txn_date: string | null; delta: number | null }>(ROW_CAP, (from, to) =>
      admin
        .from("stock_ledger")
        .select("item_code, txn_date, delta")
        .in("item_code", itemsWithStockCodes)
        .lt("delta", 0)
        .order("item_code", { ascending: true })
        .order("txn_date", { ascending: true })
        .range(from, to)
    );

    const lastOutboundByItem = new Map<string, string>();
    const usageWindowStart = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const windowUsageByItem = new Map<string, number>();
    for (const row of outbound ?? []) {
      if (!row.item_code || !row.txn_date) continue;
      const existing = lastOutboundByItem.get(row.item_code);
      if (!existing || row.txn_date > existing) lastOutboundByItem.set(row.item_code, row.txn_date);
      if (row.txn_date >= usageWindowStart && row.delta != null) {
        windowUsageByItem.set(row.item_code, (windowUsageByItem.get(row.item_code) ?? 0) + Math.abs(Number(row.delta)));
      }
    }

    const { data: itemNames } = await admin.from("items").select("item_code, item_name").in("item_code", itemsWithStockCodes);
    const nameByCode = new Map((itemNames ?? []).map((i) => [i.item_code, i.item_name]));

    const cutoff = new Date(Date.now() - AGING_DAYS * 24 * 60 * 60 * 1000).toISOString();
    agingStockItems = itemsWithStockCodes
      .map((code) => ({
        item_code: code,
        item_name: nameByCode.get(code) ?? code,
        qty_on_hand: stockByItem.get(code) ?? 0,
        lastOutboundDate: lastOutboundByItem.get(code) ?? null,
      }))
      .filter((i) => !i.lastOutboundDate || i.lastOutboundDate < cutoff)
      .slice(0, limit);

    lowCoverageItems = itemsWithStockCodes
      .map((code) => {
        const windowUsage = windowUsageByItem.get(code) ?? 0;
        const avgMonthlyUsage = windowUsage / (USAGE_WINDOW_DAYS / 30);
        const qty_on_hand = stockByItem.get(code) ?? 0;
        return {
          item_code: code,
          item_name: nameByCode.get(code) ?? code,
          qty_on_hand,
          avgMonthlyUsage,
          coverageMonths: avgMonthlyUsage > 0 ? qty_on_hand / avgMonthlyUsage : Infinity,
        };
      })
      .filter((i) => i.avgMonthlyUsage > 0)
      .sort((a, b) => a.coverageMonths - b.coverageMonths)
      .slice(0, limit);
  }

  return {
    itemsTracked: itemsTracked ?? 0,
    itemsWithStock,
    itemsWithSafetyStockSet: safetyItems?.length ?? 0,
    itemsWithReorderPointSet: reorderItems?.length ?? 0,
    lowStockItems,
    excessStockItems,
    agingStockItems,
    usageWindowDays: USAGE_WINDOW_DAYS,
    lowCoverageItems,
  };
}

// ---------------------------------------------------------------------------
// 08 구매계획 — 발주 추천 (재고 상태 기준)
// ---------------------------------------------------------------------------

export type ReorderRecommendation = {
  item_code: string;
  item_name: string;
  qtyOnHand: number;
  avgMonthlyUsage: number;
  leadTimeDays: number;
  moq: number | null;
  coverageMonths: number; // qtyOnHand ÷ avgMonthlyUsage
  leadTimeMonths: number; // leadTimeDays ÷ 30
  shortfall: number; // 리드타임 동안 예상 소진량 − 현재고 (양수면 부족)
  recommendedQty: number; // MOQ 배수로 올림한 권장 발주수량
};

export type ReorderRecommendationsResult = {
  itemsWithLeadTime: number; // items.lead_time_days가 채워진 품목 수(전체 대비 커버리지)
  itemsWithUsage: number; // 위 중 최근 사용 이력(출고)이 있어 실제로 판단 가능한 품목 수
  usageWindowDays: number;
  recommendations: ReorderRecommendation[];
};

// 2026-09-21, Kevin 요청("08 구매계획: 앞으로 무엇을 사야 하는가?"). 애초
// 설계안은 현재고+월평균사용량+Lead Time+Safety Stock+Reorder Point+MOQ+
// Open PO를 전부 연결하는 것이었지만, 실제 확인해보니(2026-09-21) Safety
// Stock/Reorder Point는 여전히 0/18,626건(아무도 입력한 적 없음, /admin/items
// 수기 입력 항목이라 API로 채워지지 않음) — 반면 Lead Time/MOQ는 이카운트
// 동기화로 이미 10,004/18,626건 채워져 있다(재검토 중 확인, 이전 기록과
// 달라짐). 그래서 이 v1은 "안전재고 없이, 순수하게 리드타임 동안 버틸
// 수 있는가"만 계산한다 — Reorder Point = 월평균사용량 × (리드타임일÷30).
// 현재고가 이보다 적으면 "리드타임 안에 소진 예상"으로 추천한다. **정직하게
// 밝혀둔 한계:** (1) 안전재고 여유분이 전혀 없다 — 이 계산을 통과해도
// 실제로는 이미 빠듯한 상태일 수 있음. (2) Open PO(이미 나가 있는 발주서)를
// 반영하지 못한다 — 발주서조회 API에 품목코드가 없어(CLAUDE.md 참고) 특정
// 발주서가 어떤 품목인지 알 수 없기 때문. 즉 이미 발주해둔 품목도 다시
// 추천될 수 있다 — 02 발주관리에서 진행중 발주서를 직접 확인해야 함.
// 2026-09-21, Kevin 요청 #2(속도개선) 2라운드. 이전엔 items의 lead_time_days
// 등록 품목(10,004건)을 fetchAllPages로 가져온 뒤, 그 10,004개 item_code를
// .in()으로 stock_total/stock_ledger에 다시 질의했다(08 구매계획 실측
// 5초대) — 수천 개 코드를 .in()에 통째로 넘기는 패턴은 이미 다른 화면
// (카테고리별 구매액)에서 URL 길이 제한으로 일부만 조용히 매칭되는 버그를
// 낸 적이 있어(CLAUDE.md 2026-09-21 항목 참고) 구조적으로 같은 위험을 안고
// 있었다. `pis_reorder_candidates` SQL 함수(items를 stock_total/stock_ledger와
// LEFT JOIN, 마이그레이션 참고)로 옮겨 왕복도 줄이고 이 위험도 없앤다.
// shortfall/추천수량 계산과 정렬/topN은 로직이 단순해 그대로 JS에 둔다.
// 배포 전 확인: items.lead_time_days is not null 카운트(10,004)가 라이브
// 페이지의 "LEAD TIME 등록 품목 10,004"와 정확히 일치함을 SQL로 대조함
// (현재 IMMS 출고 기록이 0건이라 usage/추천 쪽은 항상 0건 — 이 부분은
// 현장 데이터가 쌓여야 실측 대조가 가능함).
export async function getReorderRecommendations(limit = 30): Promise<ReorderRecommendationsResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const usageWindowStart = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // 2026-09-21: lead_time_days 등록 품목이 10,004건이라 단일 admin.rpc()
  // 호출로는 PostgREST max-rows(1000)에 걸려 itemsWithLeadTime이 조용히
  // 1000으로 잘못 나온다(fetchAllRpcPages 주석 참고) — 페이지네이션.
  const rows = await fetchAllRpcPages(ITEM_SCALE_ROW_CAP, (pageLimit, offset) =>
    admin.rpc("pis_reorder_candidates", { p_usage_window_start: usageWindowStart, p_limit: pageLimit, p_offset: offset })
  );
  // qty_on_hand/usage_qty/moq는 numeric이라 PostgREST를 통해 문자열로 온다 — Number() 필수.
  const withUsage = rows.filter((r) => Number(r.usage_qty) > 0);

  const recommendations: ReorderRecommendation[] = withUsage
    .map((i) => {
      const usageQty = Number(i.usage_qty);
      const avgMonthlyUsage = Math.round((usageQty / (USAGE_WINDOW_DAYS / 30)) * 100) / 100;
      const qtyOnHand = Number(i.qty_on_hand);
      const leadTimeMonths = Math.round((i.lead_time_days / 30) * 100) / 100;
      const coverageMonths = avgMonthlyUsage > 0 ? Math.round((qtyOnHand / avgMonthlyUsage) * 100) / 100 : Infinity;
      const shortfall = Math.round(avgMonthlyUsage * leadTimeMonths - qtyOnHand);
      const moqNum = i.moq === null ? null : Number(i.moq);
      const moq = moqNum && moqNum > 0 ? moqNum : null;
      const recommendedQty = shortfall > 0 ? (moq ? Math.ceil(shortfall / moq) * moq : shortfall) : 0;
      return {
        item_code: i.item_code,
        item_name: i.item_name,
        qtyOnHand,
        avgMonthlyUsage,
        leadTimeDays: i.lead_time_days,
        moq,
        coverageMonths,
        leadTimeMonths,
        shortfall,
        recommendedQty,
      };
    })
    .filter((r) => r.shortfall > 0)
    .sort((a, b) => a.coverageMonths - b.coverageMonths)
    .slice(0, limit);

  return {
    itemsWithLeadTime: rows.length,
    itemsWithUsage: withUsage.length,
    usageWindowDays: USAGE_WINDOW_DAYS,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// 업체가 위험한가?
// ---------------------------------------------------------------------------

export type SupplierRisk = {
  itemsWithAnySupplierRecorded: number;
  singleSourceItemCount: number;
  singleSourceItems: { item_code: string; item_name: string; supplier_name: string }[];
};

// 단일 공급업체 위험 = purchase_records 실 구매 이력에서 그 품목을 구매한
// 거래처명이 딱 1곳뿐인 경우. 2026-09-17부터 IMMS 입고 기록(사실상 거의
// 항상 0건) 대신 실제 구매현황 전체 이력(18,989건, 2023년~현재)을 쓴다 —
// 훨씬 넓은 커버리지의 진짜 공급망 집중도를 보여준다. 거래처명(항상
// 기록됨) 기준으로 묶는다 — supplier_code는 거래처명 완전일치 best-effort
// 매칭이라 일부 NULL(2026-09-17 680건 백필 기준 438/680만 매칭)이므로
// 그룹핑 키로 쓰면 실제로는 같은 거래처인데 다른 그룹으로 갈리는 품목이
// 생길 수 있다. 구매 집중도는 getPurchaseInsights().top1SupplierSharePct로
// 이미 제공됨(따로 다시 계산하지 않음). 납기 장기화/지연은 여전히 계산
// 불가 — 발주서조회에 실제 입고일 필드가 없고, purchase_records도 특정
// 발주서와 연결되지 않는다.
// 2026-09-21, Kevin 요청 #2(속도개선): 이전엔 purchase_records 전체(M2000
// 스코프, 18,607건)를 fetchAllPages로 1000건씩 ~19번 왕복해 가져온 뒤
// item_code별 distinct supplier_name 개수를 JS에서 셌다 — HOME/07
// 공급Risk 두 화면에서 매번 반복돼 실측 10~15초씩 걸렸다(인덱스 추가
// 전후로 응답시간이 거의 안 변해 병목이 쿼리 자체가 아니라 왕복 횟수임을
// 확인). 이 집계는 GROUP BY + HAVING으로 DB가 한 번에 계산할 수 있어
// `pis_supplier_risk_summary` SQL 함수(마이그레이션 참고)로 옮겼다 —
// 왕복 ~19회 → 1회. 반환 총계(items_with_any_supplier/
// single_source_item_count)는 모든 행에 반복되어 오므로 첫 행에서만
// 읽고, 예시 목록(item_code/item_name/supplier_name)은 DB가 이미
// limit만큼만 보내준다. 배포 전 SQL로 기존 JS 로직과 총계가 정확히
// 일치함을 직접 대조 확인함(2347/2068, CLAUDE.md 참고).
export async function getSupplierRiskSummary(limit = 10): Promise<SupplierRisk> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("pis_supplier_risk_summary", { p_limit: limit });
  if (error || !data || data.length === 0) {
    if (error) console.error("pis_supplier_risk_summary RPC 실패:", error);
    return { itemsWithAnySupplierRecorded: 0, singleSourceItemCount: 0, singleSourceItems: [] };
  }

  const singleSourceItems = data
    .filter((r): r is typeof r & { item_code: string; item_name: string; supplier_name: string } => r.item_code !== null)
    .map((r) => ({ item_code: r.item_code, item_name: r.item_name, supplier_name: r.supplier_name }));

  return {
    itemsWithAnySupplierRecorded: data[0].items_with_any_supplier,
    singleSourceItemCount: data[0].single_source_item_count,
    singleSourceItems,
  };
}

export type RequestedMetric = {
  section: string;
  metric: string;
  status: "available" | "partial" | "blocked";
  note: string;
};

// Kevin의 요청 5개 카테고리 ~25개 세부 지표를 오늘 실제로 계산 가능한지
// 그대로 매핑한 표 — "블락"은 포기가 아니라 다음에 뭘 준비해야 하는지
// 명시하기 위한 표시다 (① Data Integrity — 틀린 숫자를 그럴듯하게 보여주는
// 것보다 낫다). supplier_code(migration 0010)와 /admin/items 추가로 여러
// 항목이 blocked → available/partial로 바뀌었다.
export async function getRequestedMetricStatus(): Promise<RequestedMetric[]> {
  return [
    {
      section: "얼마나 샀나?",
      metric: "연간/월별 구매금액",
      status: "available",
      note: "2026-09-17부터 purchase_records(구매팀이 /admin/purchase-import로 업로드하는 실제 구매현황 전표, 2023년~현재 18,989건)의 supply_amount(공급가액, 부가세 제외) 합계로 계산 — 더 이상 추정치가 아님. 단, 최신성은 업로드 주기에 의존.",
    },
    {
      section: "얼마나 샀나?",
      metric: "전년 대비 증감",
      status: "available",
      note: "purchase_records에 2023년부터 실데이터가 있어 getPurchaseTrend가 전년 동월을 실제 값으로 계산함(2026-09-17부터). 그 이전 시점 데이터가 없는 비교 구간만 null로 정직하게 표시.",
    },
    {
      section: "얼마나 샀나?",
      metric: "업체별/품목별 구매금액",
      status: "available",
      note: "purchase_records의 supplier_name(항상 기록됨) 기준으로 집계. supplier_code는 거래처명 완전일치 best-effort 매칭이라 일부 미매칭 있음(supplierCoveragePct 참고) — 매칭 실패해도 supplier_name 기준 집계 자체는 영향 없음.",
    },
    {
      section: "어디에서 많이 샀나?",
      metric: "업체별/품목별/카테고리별 구매비중",
      status: "available",
      note: "위와 동일한 실데이터 기준. getPurchaseInsights 하나로 세 가지 모두 계산.",
    },
    {
      section: "가격이 올랐나?",
      metric: "최근단가, 평균단가",
      status: "available",
      note: "품목마스터 pull이 매일 스냅샷을 쌓음(price_history).",
    },
    {
      section: "가격이 올랐나?",
      metric: "단가 상승률",
      status: "partial",
      note: "'전년 대비'가 아니라 '데이터 수집 시작일 대비'로 정직하게 계산(getPriceMovementSummary). 스냅샷이 2026-09-10부터 쌓이기 시작해 지금은 창이 짧음 — 시간이 지날수록 자동으로 의미있어짐.",
    },
    {
      section: "가격이 올랐나?",
      metric: "전년 평균단가",
      status: "available",
      note: "2026-09-17부터 purchase_records의 실제 구매 단가로 계산(getPriceVarianceInsights) — 달력 연도가 아니라 최근 12개월 vs 이전 12개월 수량가중평균 비교(올해가 부분 연도라 달력 연도 비교는 왜곡되므로). 일회성구매 등 범용 코드/더미 코드/배송비 같은 비제품성 코드 및 ±500% 초과 변동(단위 불일치 추정)은 제외. 2026-09-17 기준 957개 품목이 두 기간 모두 구매 이력 보유.",
    },
    {
      section: "가격이 올랐나?",
      metric: "업체별 가격차이",
      status: "available",
      note: "품목조회 API는 여전히 품목당 단가 1개뿐이지만, purchase_records의 실제 구매 이력에서 같은 품목을 2곳 이상 업체로부터 산 경우를 찾아 최저가 대비 잠재 절감액을 계산(getPriceVarianceInsights.supplierGapItems) — 범용/더미/배송비 코드 및 ±500% 초과 변동 제외 후 2026-09-17 기준 최근 12개월에 70개 품목이 해당.",
    },
    {
      section: "재고가 적정한가?",
      metric: "현재고, 재고 커버리지",
      status: "partial",
      note: "현재고는 즉시 계산됨. 재고 커버리지(=현재고÷월평균 사용량)도 getInventoryHealth.lowCoverageItems로 구현 완료 — 최근 90일 stock_ledger 출고 합계 기반. 단, 2026-09-11 기준 실제 출고 거래가 0건이라 지금은 빈 목록(계산식은 준비됐고 현장 입력이 쌓이면 자동으로 채워짐). 한계: 출고 정의에 창고이동(내부 이동) 출발 레그도 포함돼 실제 소모량보다 다소 과대해질 수 있음.",
    },
    {
      section: "재고가 적정한가?",
      metric: "재고부족위험, 과잉재고",
      status: "partial",
      note: "/admin/items에서 안전재고/재주문점을 설정한 품목에 한해 계산됨(getInventoryHealth) — 2026-09-11 기준 설정된 품목이 아직 없어 빈 목록.",
    },
    {
      section: "재고가 적정한가?",
      metric: "장기재고",
      status: "available",
      note: "재고>0인데 90일 내 출고 기록이 없는 품목 — 안전재고 설정 없이도 계산 가능. 오늘은 재고 자체가 0건이라 빈 목록.",
    },
    {
      section: "재고가 적정한가?",
      metric: "월평균 사용량",
      status: "partial",
      note: "getInventoryHealth.lowCoverageItems.avgMonthlyUsage로 구현 완료(최근 90일 stock_ledger 출고 합계÷3). 2026-09-11 기준 출고 거래가 0건이라 지금은 계산해도 전부 0 — 현장 입력이 쌓이면 채워짐.",
    },
    {
      section: "업체가 위험한가?",
      metric: "단일 공급업체",
      status: "available",
      note: "2026-09-17부터 purchase_records 전체 구매 이력(2023년~현재)에서 품목별 거래처명이 1곳뿐인 경우를 집계(getSupplierRiskSummary) — IMMS 입고 기록보다 훨씬 넓은 실제 커버리지.",
    },
    {
      section: "업체가 위험한가?",
      metric: "구매 집중도",
      status: "available",
      note: "getPurchaseInsights().top1SupplierSharePct — 상위 1개 거래처의 실제 구매금액(공급가액) 비중.",
    },
    {
      section: "업체가 위험한가?",
      metric: "가격 변동성",
      status: "partial",
      note: "품목별 가격 스냅샷 변동률(getPriceMovementSummary)로 근사 가능하나, 공급사별 변동성은 아님(업체별 가격 자체가 이카운트에 없어서) — 스냅샷 기간도 아직 짧음.",
    },
    {
      section: "업체가 위험한가?",
      metric: "납기 장기화, 납기 지연",
      status: "blocked",
      note: "발주서조회 응답에 실제 입고일 필드가 없고, IMMS 입고도 특정 발주서와 연결되지 않음(0순위 결정) — E-Count가 새 데이터를 주거나 IMMS가 발주서-입고 연결 기능을 만들어야 함.",
    },
  ];
}

// ---------------------------------------------------------------------------
// 03 품목분석 — 품목 검색 + 품목 하나의 통합 상세(구매/가격/재고/공급업체)
// ---------------------------------------------------------------------------

export type ItemSearchRow = {
  item_code: string;
  item_name: string;
  item_category: string | null;
  latestPrice: number | null;
  qtyOnHand: number | null;
};

// 검색어 없이 들어오면 최근 12개월 구매금액 상위 품목을 기본으로 보여준다
// (getPurchaseInsights와 동일한 소스라 "01 구매현황"과 숫자가 어긋나지
// 않음). 검색어가 있으면 item_code/item_name 부분일치.
export async function searchItems(query: string, limit = 30): Promise<ItemSearchRow[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const trimmed = query.trim();
  let itemRows: { item_code: string; item_name: string; item_category: string | null }[];

  if (trimmed) {
    const { data } = await admin
      .from("items")
      .select("item_code, item_name, item_category")
      .or(`item_code.ilike.%${trimmed}%,item_name.ilike.%${trimmed}%`)
      .order("item_code", { ascending: true })
      .limit(limit);
    itemRows = data ?? [];
  } else {
    // 기본 화면: 최근 12개월 구매금액 상위 품목(01 구매현황과 같은 계산).
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const recentRecords = await fetchPurchaseRecords(admin, since.toISOString().slice(0, 10));
    const byItem = new Map<string, { name: string; amount: number }>();
    for (const r of recentRecords) {
      const b = byItem.get(r.item_code) ?? { name: r.item_name, amount: 0 };
      b.amount += r.supply_amount;
      byItem.set(r.item_code, b);
    }
    const topCodes = Array.from(byItem.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, limit)
      .map(([code]) => code);
    if (topCodes.length === 0) return [];
    const { data } = await admin.from("items").select("item_code, item_name, item_category").in("item_code", topCodes);
    const byCode = new Map((data ?? []).map((r) => [r.item_code, r]));
    // topCodes 순서(구매금액 내림차순) 유지 — .in()은 순서를 보장하지 않음.
    itemRows = topCodes.map((code) => byCode.get(code) ?? { item_code: code, item_name: byItem.get(code)!.name, item_category: null });
  }

  if (itemRows.length === 0) return [];
  const codes = itemRows.map((r) => r.item_code);

  const [priceRows, stockRows] = await Promise.all([
    admin.from("price_history").select("item_code, unit_price, effective_date").in("item_code", codes).order("effective_date", { ascending: false }),
    admin.from("stock_total").select("item_code, qty_on_hand").in("item_code", codes),
  ]);

  const latestPriceByCode = new Map<string, number>();
  for (const p of priceRows.data ?? []) {
    if (!latestPriceByCode.has(p.item_code)) latestPriceByCode.set(p.item_code, p.unit_price);
  }
  const stockByCode = new Map((stockRows.data ?? []).map((s) => [s.item_code, s.qty_on_hand]));

  return itemRows.map((r) => ({
    item_code: r.item_code,
    item_name: r.item_name,
    item_category: r.item_category,
    latestPrice: latestPriceByCode.get(r.item_code) ?? null,
    qtyOnHand: stockByCode.get(r.item_code) ?? null,
  }));
}

export type ItemDetailSummary = {
  item_code: string;
  item_name: string;
  item_category: string | null;
  spec: string | null;
  unit: string | null;
  isKeyItem: boolean;
  moq: number | null;
  leadTimeDays: number | null;
  materialCost: number | null;
  latestPrice: number | null;
  latestPriceDate: string | null;
  qtyOnHand: number | null;
  avgMonthlyUsage: number; // 최근 90일 stock_ledger 출고(음수 delta) 합계 ÷ 3, getInventoryHealth와 동일 정의
  coverageMonths: number | null; // qtyOnHand ÷ avgMonthlyUsage
  last12moAmount: number;
  last12moQty: number;
  last12moPurchaseCount: number;
  supplierCount: number; // purchase_records 전체 기간에서 이 품목을 판 거래처(명) 수
  earliestPurchaseDate: string | null;
  latestPurchaseDate: string | null;
};

export type ItemDetailResult = { found: true; summary: ItemDetailSummary } | { found: false };

export async function getItemDetail(itemCode: string): Promise<ItemDetailResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: item } = await admin
    .from("items")
    .select("item_code, item_name, item_category, spec, unit, is_key_item, moq, lead_time_days, material_cost")
    .eq("item_code", itemCode)
    .maybeSingle();
  if (!item) return { found: false };

  const usageSince = new Date();
  usageSince.setDate(usageSince.getDate() - USAGE_WINDOW_DAYS);

  const [latestPriceRes, stockRes, ledgerRes, last12moRecords, allTimeSuppliers, allTimeDates] = await Promise.all([
    admin
      .from("price_history")
      .select("unit_price, effective_date")
      .eq("item_code", itemCode)
      .order("effective_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("stock_total").select("qty_on_hand").eq("item_code", itemCode).maybeSingle(),
    admin
      .from("stock_ledger")
      .select("delta")
      .eq("item_code", itemCode)
      .gte("txn_date", usageSince.toISOString().slice(0, 10))
      .lt("delta", 0),
    (async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 12);
      return fetchAllPages<{ supply_amount: number; qty: number; purchase_date: string }>(PURCHASE_ROW_CAP, (from, to) =>
        admin
          .from("purchase_records")
          .select("supply_amount, qty, purchase_date")
          .eq("item_code", itemCode)
          .eq("department", M2000_DEPARTMENT) // 2026-09-21, M2000 스코프 — src/lib/pis-scope.ts 참고
          .gte("purchase_date", since.toISOString().slice(0, 10))
          .order("id", { ascending: true })
          .range(from, to)
      );
    })(),
    fetchAllPages<{ supplier_name: string }>(PURCHASE_ROW_CAP, (from, to) =>
      admin
        .from("purchase_records")
        .select("supplier_name")
        .eq("item_code", itemCode)
        .eq("department", M2000_DEPARTMENT)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    admin
      .from("purchase_records")
      .select("purchase_date")
      .eq("item_code", itemCode)
      .eq("department", M2000_DEPARTMENT)
      .order("purchase_date", { ascending: true })
      .limit(1),
  ]);

  const outboundSum = (ledgerRes.data ?? []).reduce((sum, r) => sum + Math.abs(r.delta ?? 0), 0);
  const avgMonthlyUsage = Math.round((outboundSum / (USAGE_WINDOW_DAYS / 30)) * 100) / 100;
  const qtyOnHand = stockRes.data?.qty_on_hand ?? null;
  const coverageMonths = qtyOnHand !== null && avgMonthlyUsage > 0 ? Math.round((qtyOnHand / avgMonthlyUsage) * 10) / 10 : null;

  const last12moAmount = Math.round(last12moRecords.reduce((sum, r) => sum + r.supply_amount, 0));
  const last12moQty = last12moRecords.reduce((sum, r) => sum + r.qty, 0);

  const { data: latestDateRow } = await admin
    .from("purchase_records")
    .select("purchase_date")
    .eq("item_code", itemCode)
    .eq("department", M2000_DEPARTMENT) // 2026-09-21, M2000 스코프 — src/lib/pis-scope.ts 참고
    .order("purchase_date", { ascending: false })
    .limit(1);

  return {
    found: true,
    summary: {
      item_code: item.item_code,
      item_name: item.item_name,
      item_category: item.item_category,
      spec: item.spec,
      unit: item.unit,
      isKeyItem: item.is_key_item,
      moq: item.moq,
      leadTimeDays: item.lead_time_days,
      materialCost: item.material_cost,
      latestPrice: latestPriceRes.data?.unit_price ?? null,
      latestPriceDate: latestPriceRes.data?.effective_date ?? null,
      qtyOnHand,
      avgMonthlyUsage,
      coverageMonths,
      last12moAmount,
      last12moQty,
      last12moPurchaseCount: last12moRecords.length,
      supplierCount: new Set((allTimeSuppliers ?? []).map((r) => r.supplier_name)).size,
      earliestPurchaseDate: allTimeDates.data?.[0]?.purchase_date ?? null,
      latestPurchaseDate: latestDateRow?.[0]?.purchase_date ?? null,
    },
  };
}

export type StockLedgerEntry = { txn_date: string | null; location_code: string | null; delta: number | null };

// 재고이력 탭 — 최근 200건(최신순). stock_ledger는 view라 페이지네이션
// truncation 방어가 필요할 만큼 커지진 않지만(품목 하나 기준), 다른
// 함수들과 동일하게 order+limit을 명시한다.
export async function getItemStockLedger(itemCode: string, limit = 200): Promise<StockLedgerEntry[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("stock_ledger")
    .select("txn_date, location_code, delta")
    .eq("item_code", itemCode)
    .order("txn_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export type PriceHistoryEntry = { effective_date: string; unit_price: number; source: string };

export async function getItemPriceHistory(itemCode: string, limit = 100): Promise<PriceHistoryEntry[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("price_history")
    .select("effective_date, unit_price, source")
    .eq("item_code", itemCode)
    .order("effective_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export type ItemSupplierRow = { supplier_name: string; qty: number; amount: number; purchaseCount: number; lastPurchaseDate: string };

// 공급업체 탭 — 전체 기간(purchase_records 2023년~현재) 기준 이 품목을 판
// 거래처별 집계. 품목 하나로 필터링되므로 fetchAllPages 없이 한 번에
// 가져와도 안전(구매 건수가 아무리 많아도 1000행 truncation 위험이 낮은
// 스코프) — 그래도 안전하게 캡을 둔다.
export async function getItemSuppliers(itemCode: string): Promise<ItemSupplierRow[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const rows = await fetchAllPages<{ supplier_name: string; qty: number; supply_amount: number; purchase_date: string }>(
    PURCHASE_ROW_CAP,
    (from, to) =>
      admin
        .from("purchase_records")
        .select("supplier_name, qty, supply_amount, purchase_date")
        .eq("item_code", itemCode)
        .eq("department", M2000_DEPARTMENT) // 2026-09-21, M2000 스코프 — src/lib/pis-scope.ts 참고
        .order("id", { ascending: true })
        .range(from, to)
  );

  const bySupplier = new Map<string, { qty: number; amount: number; count: number; lastDate: string }>();
  for (const r of rows) {
    const b = bySupplier.get(r.supplier_name) ?? { qty: 0, amount: 0, count: 0, lastDate: r.purchase_date };
    b.qty += r.qty;
    b.amount += r.supply_amount;
    b.count += 1;
    if (r.purchase_date > b.lastDate) b.lastDate = r.purchase_date;
    bySupplier.set(r.supplier_name, b);
  }

  return Array.from(bySupplier, ([supplier_name, b]) => ({
    supplier_name,
    qty: b.qty,
    amount: Math.round(b.amount),
    purchaseCount: b.count,
    lastPurchaseDate: b.lastDate,
  })).sort((a, b) => b.amount - a.amount);
}
