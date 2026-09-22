"use server";

// 10 통합조회 — 2026-09-21, Kevin 요청("기간/품목/업체/창고/거래유형/부서/
// 사용자 조건으로 전체 거래내역을 검색해 Excel/PDF로 출력"). 실제 스키마를
// 보면 이 조건들이 한 테이블에 다 있지 않다 — "업체"는 구매현황
// (purchase_records, 이카운트 매입 데이터)에만 있고, "창고/거래유형/부서/
// 사용자"는 IMMS 자재이동(transactions, 생산불출/창고이동/반납/입고)에만
// 있다. 두 스키마를 억지로 하나의 표로 합치면 의미 없는 빈 칸투성이
// 테이블이 되므로(① Data Integrity), 실제 두 데이터 영역 그대로
// "구매현황 검색"과 "자재이동 이력 검색" 두 개의 검색+출력 도구로
// 나눠서 만든다 — Kevin이 나열한 조건은 이 두 도구에 나눠 들어간다.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { M2000_DEPARTMENT } from "@/lib/pis-scope";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin") throw new Error("관리자만 사용할 수 있습니다");
}

// Supabase Data API 1000행 truncation 방어(2026-09-21 발견/수정 패턴 재사용).
async function fetchAllRows<T>(
  cap: number,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; from < cap; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) break;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 구매현황 검색 (purchase_records)
// ---------------------------------------------------------------------------

export type PurchaseSearchFilter = {
  sinceIso?: string;
  untilIso?: string;
  itemQuery?: string; // item_code 또는 item_name 부분일치
  supplierQuery?: string; // supplier_name 부분일치
  category?: string; // items.item_category
};

export type PurchaseSearchRow = {
  purchase_date: string;
  supplier_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  unit_price: number;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
};

const SEARCH_ROW_CAP = 20000; // 화면 미리보기는 상위 N건만, 이 캡은 Excel 출력 상한

async function buildPurchaseQuery(admin: ReturnType<typeof createAdminClient>, filter: PurchaseSearchFilter) {
  let itemCodes: string[] | null = null;
  if (filter.category) {
    const { data } = await admin.from("items").select("item_code").eq("item_category", filter.category);
    itemCodes = (data ?? []).map((r) => r.item_code);
    if (itemCodes.length === 0) return null; // 이 카테고리엔 품목이 없음 — 검색해봤자 0건
  }

  return (from: number, to: number) => {
    let q = admin
      .from("purchase_records")
      .select("purchase_date, supplier_name, item_code, item_name, qty, unit_price, supply_amount, vat_amount, total_amount")
      .eq("department", M2000_DEPARTMENT) // 2026-09-21, Kevin 요청("PIS 구현" #1): M2000 스코프만 — src/lib/pis-scope.ts 참고
      .order("purchase_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (filter.sinceIso) q = q.gte("purchase_date", filter.sinceIso);
    if (filter.untilIso) q = q.lt("purchase_date", filter.untilIso);
    if (filter.supplierQuery) q = q.ilike("supplier_name", `%${filter.supplierQuery}%`);
    if (filter.itemQuery) q = q.or(`item_code.ilike.%${filter.itemQuery}%,item_name.ilike.%${filter.itemQuery}%`);
    if (itemCodes) q = q.in("item_code", itemCodes);
    return q;
  };
}

export async function searchPurchaseRecords(filter: PurchaseSearchFilter, cap = 200): Promise<{ rows: PurchaseSearchRow[]; truncated: boolean }> {
  await requireAdmin();
  const admin = createAdminClient();

  const pageFn = await buildPurchaseQuery(admin, filter);
  if (!pageFn) return { rows: [], truncated: false };

  const rows = await fetchAllRows<PurchaseSearchRow>(Math.min(cap, SEARCH_ROW_CAP), pageFn);
  return { rows, truncated: rows.length >= cap };
}

// Excel 출력용 — 미리보기(cap=200)보다 훨씬 큰 상한(SEARCH_ROW_CAP)까지
// 전부 가져온다. 그래도 넘으면(20,000건 초과) 정직하게 잘렸다고 표시한다.
export async function exportPurchaseRecords(filter: PurchaseSearchFilter): Promise<{ rows: PurchaseSearchRow[]; truncated: boolean }> {
  await requireAdmin();
  const admin = createAdminClient();

  const pageFn = await buildPurchaseQuery(admin, filter);
  if (!pageFn) return { rows: [], truncated: false };

  const rows = await fetchAllRows<PurchaseSearchRow>(SEARCH_ROW_CAP, pageFn);
  return { rows, truncated: rows.length >= SEARCH_ROW_CAP };
}

// ---------------------------------------------------------------------------
// 자재이동 이력 검색 (transactions — IMMS 생산불출/창고이동/반납/입고)
// ---------------------------------------------------------------------------

export type TransactionSearchFilter = {
  sinceIso?: string;
  untilIso?: string;
  txnType?: "IN" | "PRD" | "MOV" | "SHP" | "RET" | "ADJ";
  locationCode?: string; // from_location_code 또는 to_location_code 일치
  departmentId?: string;
  itemQuery?: string; // transaction_details.items.item_name/item_code 부분일치 — 별도 후처리 필터
};

export type TransactionSearchRow = {
  id: string;
  txn_type: string;
  txn_date: string;
  from_location_code: string | null;
  to_location_code: string | null;
  department_name: string | null;
  processed_by_name: string | null;
  reason: string | null;
  note: string | null;
  items: { item_code: string; item_name: string; qty: number }[];
};

async function fetchTransactionRows(admin: ReturnType<typeof createAdminClient>, filter: TransactionSearchFilter, cap: number): Promise<TransactionSearchRow[]> {
  const raw = await fetchAllRows<{
    id: string;
    txn_type: string;
    txn_date: string;
    from_location_code: string | null;
    to_location_code: string | null;
    reason: string | null;
    note: string | null;
    departments: { name: string } | null;
    profiles: { name: string } | null;
    transaction_details: { item_code: string; qty: number; items: { item_name: string } | null }[];
  }>(cap, (from, to) => {
    let q = admin
      .from("transactions")
      .select(
        `id, txn_type, txn_date, from_location_code, to_location_code, reason, note,
         departments(name), profiles!transactions_processed_by_fkey(name),
         transaction_details(item_code, qty, items(item_name))`
      )
      .order("txn_date", { ascending: false })
      .range(from, to);
    if (filter.sinceIso) q = q.gte("txn_date", filter.sinceIso);
    if (filter.untilIso) q = q.lt("txn_date", filter.untilIso);
    if (filter.txnType) q = q.eq("txn_type", filter.txnType);
    if (filter.departmentId) q = q.eq("department_id", filter.departmentId);
    if (filter.locationCode) q = q.or(`from_location_code.eq.${filter.locationCode},to_location_code.eq.${filter.locationCode}`);
    return q;
  });

  let rows: TransactionSearchRow[] = raw.map((r) => ({
    id: r.id,
    txn_type: r.txn_type,
    txn_date: r.txn_date,
    from_location_code: r.from_location_code,
    to_location_code: r.to_location_code,
    department_name: r.departments?.name ?? null,
    processed_by_name: r.profiles?.name ?? null,
    reason: r.reason,
    note: r.note,
    items: (r.transaction_details ?? []).map((d) => ({ item_code: d.item_code, item_name: d.items?.item_name ?? d.item_code, qty: d.qty })),
  }));

  // item 검색은 조인된 배열 안을 봐야 해서 DB 필터가 아니라 후처리로 거른다
  // — transaction_details가 품목당 여러 행일 수 있어 SQL .or()로 표현하기
  // 번거롭고, 자재이동 건수 자체가 구매현황보다 훨씬 적어 후처리 비용이
  // 작다.
  if (filter.itemQuery) {
    const q = filter.itemQuery.toLowerCase();
    rows = rows.filter((r) => r.items.some((i) => i.item_code.toLowerCase().includes(q) || i.item_name.toLowerCase().includes(q)));
  }

  return rows;
}

export async function searchTransactions(filter: TransactionSearchFilter, cap = 200): Promise<{ rows: TransactionSearchRow[]; truncated: boolean }> {
  await requireAdmin();
  const admin = createAdminClient();
  const rows = await fetchTransactionRows(admin, filter, Math.min(cap, SEARCH_ROW_CAP));
  return { rows: rows.slice(0, cap), truncated: rows.length >= cap };
}

export async function exportTransactions(filter: TransactionSearchFilter): Promise<{ rows: TransactionSearchRow[]; truncated: boolean }> {
  await requireAdmin();
  const admin = createAdminClient();
  const rows = await fetchTransactionRows(admin, filter, SEARCH_ROW_CAP);
  return { rows, truncated: rows.length >= SEARCH_ROW_CAP };
}

export async function listDepartmentsForFilter(): Promise<{ id: string; name: string }[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from("departments").select("id, name").order("name", { ascending: true });
  return data ?? [];
}
