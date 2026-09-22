"use server";

// 발주서 현황 (PO tracking) — 2026-09-18, Kevin 요청: "발주서를 api
// 크롤링 할 수 있는것으로 아는데, 그렇다면 발주서별로 매입이 마감된건지,
// 살아 있는건지 알 수 있어야 할 거 아냐? 즉, 현재 진행중인 발주서 리스트 -
// 혹은 매입이 완료된 발주서리스트 - 각 발주서를 누르면 상세가 떠야 하고,
// 그래야 액티브 살아있는 발주서를 추적하고 공급업체의 생산 및 납품을
// 챙기지."
//
// E-Count 발주서조회(GetPurchasesOrderList) 응답의 P_FLAG 필드('1'=진행중,
// '9'=종결)는 이미 2026-09-11(Tier2 #5)에 `purchase_orders.status`
// ('in_progress'/'closed')로 저장하도록 만들어져 있었다 — 다만 이 화면이
// 없어서 활용되지 않고 있었고, 2026-09-18 실제 운영 데이터로 처음 채워보니
// 같은 po_no가 여러 창고/라인으로 나뉘어 오는 버그(ecount-pull.ts
// aggregatePoRowsByPoNo 참고)까지 함께 발견해 고쳤다.
//
// 발주서조회는 PO 헤더 단위(한 건당 1행)만 제공하고 품목코드/라인 상세가
// 없다(CLAUDE.md 참고) — 그래서 "상세보기"도 이 헤더 필드 이상을 보여줄 수
// 없다. item_summary(TTL_CTT, 이카운트가 주는 발주 내용 요약 텍스트)가
// 품목 정보에 가장 가까운 필드다.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 2026-09-22, Kevin 요청("현장 작업자별 PIS 접근권한"): 원래 이름은
// requireAdmin — role='admin' 전용이었다. 이 파일(발주관리, "업무" 그룹)은
// role='admin'이 아니어도 profiles.pis_access=true인 현장 계정이면 접근을
// 허용한다(migration 0016).
async function requirePisAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, pis_access")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "admin" && !profile.pis_access)) {
    throw new Error("PIS 접근 권한이 없습니다");
  }
}

export type PurchaseOrderStatus = "in_progress" | "closed" | "unknown";

export type PurchaseOrderRow = {
  po_no: string;
  po_date: string;
  supplier_code: string | null;
  supplier_name: string | null;
  qty: number;
  amount: number; // 공급가액(부가세 별도) — 이카운트 BUY_AMT 합계
  // 2026-09-21, Kevin 요청(Part 3, E-Count 발주서조회 화면 대조 피드백):
  // "금액이 부가세 포함인지 별도인지 표시되어야". vatAmount는 null일 수
  // 있음 — 이번 동기화 전에 저장된 과거 행이거나(컬럼 추가 전), 이카운트
  // 응답에 VAT_AMT 자체가 비어 있던 경우. totalAmount(부가세포함)는
  // vatAmount가 있을 때만 계산하고, 없으면 amount와 동일하게 둔다(화면에서
  // "부가세 정보 없음"으로 구분 표시).
  vatAmount: number | null;
  totalAmount: number; // amount + (vatAmount ?? 0)
  currency: string;
  status: PurchaseOrderStatus;
  item_summary: string | null;
  requested_delivery_date: string | null;
  buyer: string | null;
  warehouse_name: string | null;
  ecount_synced_at: string | null;
};

export type PurchaseOrderSummary = {
  totalCount: number;
  inProgressCount: number;
  closedCount: number;
  unknownStatusCount: number;
  inProgressAmount: number; // 공급가액(부가세 별도) 합계 — amount 컬럼 그대로
  closedAmount: number; // 공급가액(부가세 별도) 합계
  latestSyncedAt: string | null;
};

// Supabase Data API는 클라이언트가 .limit()/count로 더 크게 요청해도
// 서버의 "Max Rows" 기본값(1000)까지만 조용히 잘라서 돌려준다(자세한 경위는
// pis-dashboard.ts의 fetchAllPages 주석 참고 — 2026-09-21 실데이터 검증
// 중 발견). count(exact)는 Postgres 집계라 이 truncation과 무관하게 항상
// 정확하지만, 금액 합계처럼 .data를 그대로 reduce하는 값은 진행중/종결
// 발주서가 1000건을 넘는 순간부터 조용히 틀려진다 — 지금은 발주서 데이터가
// 막 채워지기 시작한 단계라 아직 그 규모는 아니지만, 미리 안전하게
// .range()로 전부 가져오도록 만들어둔다.
const PO_PAGE_SIZE = 1000;
const PO_AMOUNT_CAP = 25000;

async function sumAmountByStatus(admin: ReturnType<typeof createAdminClient>, status: "in_progress" | "closed"): Promise<number> {
  let total = 0;
  for (let from = 0; from < PO_AMOUNT_CAP; from += PO_PAGE_SIZE) {
    const to = Math.min(from + PO_PAGE_SIZE, PO_AMOUNT_CAP) - 1;
    const { data } = await admin.from("purchase_orders").select("amount").eq("status", status).order("po_no", { ascending: true }).range(from, to);
    const rows = data ?? [];
    total += rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
    if (rows.length < to - from + 1) break;
  }
  return Math.round(total);
}

export async function getPurchaseOrderSummary(): Promise<PurchaseOrderSummary> {
  await requirePisAccess();
  const admin = createAdminClient();

  const [total, inProgressCount, closedCount, unknownStatus, latest, inProgressAmount, closedAmount] = await Promise.all([
    admin.from("purchase_orders").select("id", { count: "exact", head: true }),
    admin.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
    admin.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "closed"),
    admin.from("purchase_orders").select("id", { count: "exact", head: true }).is("status", null),
    admin.from("purchase_orders").select("ecount_synced_at").order("ecount_synced_at", { ascending: false }).limit(1).maybeSingle(),
    sumAmountByStatus(admin, "in_progress"),
    sumAmountByStatus(admin, "closed"),
  ]);

  return {
    totalCount: total.count ?? 0,
    inProgressCount: inProgressCount.count ?? 0,
    closedCount: closedCount.count ?? 0,
    unknownStatusCount: unknownStatus.count ?? 0,
    inProgressAmount,
    closedAmount,
    latestSyncedAt: latest.data?.ecount_synced_at ?? null,
  };
}

export type PurchaseOrderListFilter = {
  status?: "in_progress" | "closed" | "unknown" | "all";
  limit?: number;
  offset?: number;
};

const LIST_LIMIT_DEFAULT = 100;
const LIST_LIMIT_MAX = 300;

export async function getPurchaseOrderList(filter: PurchaseOrderListFilter = {}): Promise<PurchaseOrderRow[]> {
  await requirePisAccess();
  const admin = createAdminClient();

  const limit = Math.min(filter.limit ?? LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
  const offset = filter.offset ?? 0;

  let q = admin
    .from("purchase_orders")
    .select(
      "po_no, po_date, supplier_code, suppliers(name), qty, amount, vat_amount, currency, status, item_summary, requested_delivery_date, buyer, warehouse_name, ecount_synced_at"
    )
    .order("po_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter.status === "in_progress" || filter.status === "closed") {
    q = q.eq("status", filter.status);
  } else if (filter.status === "unknown") {
    q = q.is("status", null);
  }

  const { data } = await q;

  return (data ?? []).map((r) => ({
    po_no: r.po_no,
    po_date: r.po_date,
    supplier_code: r.supplier_code,
    supplier_name: (r.suppliers as { name: string } | null)?.name ?? null,
    qty: r.qty,
    amount: r.amount,
    vatAmount: r.vat_amount,
    totalAmount: r.amount + (r.vat_amount ?? 0),
    currency: r.currency,
    status: r.status === "in_progress" || r.status === "closed" ? r.status : "unknown",
    item_summary: r.item_summary,
    requested_delivery_date: r.requested_delivery_date,
    buyer: r.buyer,
    warehouse_name: r.warehouse_name,
    ecount_synced_at: r.ecount_synced_at,
  }));
}
