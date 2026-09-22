"use server";

// 결재검토 — 2026-09-21, Kevin 요청: "E-Count에 결재 올라온 발주서/구매의뢰서가
// 실제로 맞는지 안 맞는지, 매번 과거 자료를 다 찾아보지 않고도 대시보드로
// 손쉽게 검증할 수 있게 해달라."
//
// 착수 전 검증(CLAUDE.md 2026-09-21 항목 참고)에서 Kevin이 원한 "품목별
// 가격/수량을 과거 이력과 자동 비교"는 지금 데이터로 불가능함을 확인했다:
// - 이카운트 발주서조회(GetPurchasesOrderList)는 품목코드/라인별 단가·수량을
//   주지 않는다 — purchase_orders.item_code/unit_price 컬럼이 있지만
//   한 번도 채워진 적 없음(2026-09-21 기준 32건 전부 NULL).
// - 유일한 품목 관련 텍스트인 item_summary(이카운트 TTL_CTT)는 한 발주서
//   안에 서로 다른 날짜·거래처 내용이 섞여 들어오는 자유 텍스트라, 여기서
//   품목명을 파싱해 "이 발주서에 이 품목이 있다"고 단정하는 것 자체가
//   위험하다(틀린 매칭을 검증된 것처럼 보여줄 수 있음).
//
// 그래서 이 화면은 "품목 단위 확정 검증"이 아니라, 실제로 신뢰 가능한
// 발주서 헤더 단위 신호로 "결재 전에 한 번 더 봐야 할 발주서"를 걸러주는
// 1차 버전이다. 신호가 붙었다고 발주서가 틀렸다는 뜻이 아니라 "확인해볼
// 만하다"는 뜻 — LIMITATION_NOTE를 화면에 그대로 노출해 이 한계를 숨기지
// 않는다.

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPriceVarianceInsights } from "@/lib/actions/pis-dashboard";
import { M2000_DEPARTMENT } from "@/lib/pis-scope";

type AdminClient = ReturnType<typeof createAdminClient>;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin") throw new Error("관리자만 사용할 수 있습니다");
}

// Supabase Data API의 조용한 1000행 truncation 문제(pis-dashboard.ts
// fetchAllPages 주석 참고, 2026-09-21 실데이터로 발견/수정)와 같은 패턴을
// 여기서도 그대로 방어한다 — 지금은 발주서/거래처 필터링된 구매현황이
// 1000행을 넘지 않지만, 나중에 데이터가 쌓였을 때 조용히 틀려지는 걸
// 미리 막아둔다.
const ROW_CAP = 20000;
async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; from < ROW_CAP; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) break;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export type ApprovalFlagKey = "new_supplier" | "amount_outlier" | "possible_duplicate" | "price_riser_hint";

export type ApprovalFlag = {
  key: ApprovalFlagKey;
  severity: "warn" | "info";
  label: string;
  detail: string;
};

export type ApprovalReviewRow = {
  po_no: string;
  po_date: string;
  supplier_code: string | null;
  supplier_name: string | null;
  qty: number;
  amount: number;
  currency: string;
  item_summary: string | null;
  requested_delivery_date: string | null;
  buyer: string | null;
  flags: ApprovalFlag[];
};

export type ApprovalReviewResult = {
  rows: ApprovalReviewRow[];
  generatedAt: string;
  limitation: string;
  historyWindowDays: number;
};

const HISTORY_WINDOW_DAYS = 365;
const DUPLICATE_WINDOW_DAYS = 14;
const DUPLICATE_AMOUNT_TOLERANCE_PCT = 10;
// 과거 구매현황(전표 1건) 최고액 대비 이 배수를 넘으면 "금액 이상치"로
// 표시한다 — 발주서는 여러 품목을 한 건에 합친 합계라 전표 1건보다 원래도
// 크게 나올 수 있으므로, 확실히 튀는 경우만 잡히도록 넉넉하게 잡음.
const OUTLIER_MULTIPLIER = 3;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const LIMITATION_NOTE =
  "이카운트 발주서조회(GetPurchasesOrderList) API는 품목코드·라인별 단가/수량을 제공하지 않습니다(발주서 헤더 단위 정보만 있음) — 그래서 이 화면은 품목 단위 확정 검증이 아니라, 거래처 구매이력/금액/중복 여부 등 신뢰 가능한 헤더 단위 신호만 보여줍니다. 신호가 없다고 해서 \"이 발주서가 맞다\"는 뜻이 아니라 \"눈에 띄는 이상 신호가 없다\"는 뜻입니다.";

export async function getApprovalReviewList(): Promise<ApprovalReviewResult> {
  await requireAdmin();
  const admin: AdminClient = createAdminClient();

  const { data: poData } = await admin
    .from("purchase_orders")
    .select("po_no, po_date, supplier_code, qty, amount, currency, item_summary, requested_delivery_date, buyer")
    .eq("status", "in_progress")
    .order("po_date", { ascending: false });

  const pos = poData ?? [];
  if (pos.length === 0) {
    return { rows: [], generatedAt: new Date().toISOString(), limitation: LIMITATION_NOTE, historyWindowDays: HISTORY_WINDOW_DAYS };
  }

  const supplierCodes = [...new Set(pos.map((p) => p.supplier_code).filter((v): v is string => !!v))];

  const [suppliersRes, historyRows, recentPos, riserInsights] = await Promise.all([
    supplierCodes.length > 0
      ? admin.from("suppliers").select("code, name").in("code", supplierCodes)
      : Promise.resolve({ data: [] as { code: string; name: string }[] }),
    supplierCodes.length > 0
      ? fetchAllRows<{ supplier_code: string | null; supply_amount: number | null; purchase_date: string }>((from, to) =>
          admin
            .from("purchase_records")
            .select("supplier_code, supply_amount, purchase_date")
            .in("supplier_code", supplierCodes)
            .eq("department", M2000_DEPARTMENT) // 2026-09-21, M2000 스코프 — src/lib/pis-scope.ts 참고
            .gte("purchase_date", daysAgoIso(HISTORY_WINDOW_DAYS))
            .order("purchase_date", { ascending: true })
            .range(from, to)
        )
      : Promise.resolve([]),
    // 중복 발주 의심 판단용 — 최근 발주서 전체를 다시 가져와 같은 거래처/
    // 비슷한 금액이 며칠 이내 또 있는지 메모리에서 비교한다(발주서 건수가
    // 아직 적어 별도 SQL 자기조인 없이 충분함).
    fetchAllRows<{ po_no: string; supplier_code: string | null; amount: number; po_date: string }>((from, to) =>
      admin
        .from("purchase_orders")
        .select("po_no, supplier_code, amount, po_date")
        .gte("po_date", daysAgoIso(DUPLICATE_WINDOW_DAYS + 60))
        .order("po_date", { ascending: false })
        .range(from, to)
    ),
    getPriceVarianceInsights(15).catch(() => null),
  ]);

  const supplierNameByCode = new Map((suppliersRes.data ?? []).map((s) => [s.code, s.name]));

  const historyBySupplier = new Map<string, { count: number; totalAmount: number; maxLineAmount: number; lastDate: string }>();
  for (const r of historyRows) {
    if (!r.supplier_code) continue;
    const b = historyBySupplier.get(r.supplier_code) ?? { count: 0, totalAmount: 0, maxLineAmount: 0, lastDate: r.purchase_date };
    b.count += 1;
    b.totalAmount += r.supply_amount ?? 0;
    b.maxLineAmount = Math.max(b.maxLineAmount, r.supply_amount ?? 0);
    if (r.purchase_date > b.lastDate) b.lastDate = r.purchase_date;
    historyBySupplier.set(r.supplier_code, b);
  }

  const riserNames = (riserInsights?.yoyTopRisers ?? []).filter((m) => m.changePct > 0).map((m) => m.item_name);

  const rows: ApprovalReviewRow[] = pos.map((po) => {
    const flags: ApprovalFlag[] = [];
    const supplierName = po.supplier_code ? supplierNameByCode.get(po.supplier_code) ?? null : null;
    const hist = po.supplier_code ? historyBySupplier.get(po.supplier_code) : undefined;

    if (!hist || hist.count === 0) {
      flags.push({
        key: "new_supplier",
        severity: "warn",
        label: "구매이력 없음",
        detail: `최근 ${HISTORY_WINDOW_DAYS}일 구매현황(purchase_records)에 이 거래처코드로 기록된 구매 이력이 없습니다 — 신규/드문 거래처이거나, 거래처 코드·이름 표기 차이로 매칭이 안 됐을 수 있습니다.`,
      });
    } else if (hist.maxLineAmount > 0 && po.amount > hist.maxLineAmount * OUTLIER_MULTIPLIER) {
      flags.push({
        key: "amount_outlier",
        severity: "warn",
        label: "금액 이상치",
        detail: `이 발주서 금액(₩${Math.round(po.amount).toLocaleString("ko-KR")})이 이 거래처의 최근 ${HISTORY_WINDOW_DAYS}일 구매현황 전표 중 최고액(₩${Math.round(hist.maxLineAmount).toLocaleString("ko-KR")})의 ${OUTLIER_MULTIPLIER}배를 넘습니다.`,
      });
    }

    if (po.amount > 0) {
      const poDateMs = new Date(po.po_date).getTime();
      const nearDuplicate = recentPos.find(
        (other) =>
          other.po_no !== po.po_no &&
          other.supplier_code !== null &&
          other.supplier_code === po.supplier_code &&
          Math.abs(new Date(other.po_date).getTime() - poDateMs) <= DUPLICATE_WINDOW_DAYS * 86400000 &&
          Math.abs(other.amount - po.amount) / po.amount <= DUPLICATE_AMOUNT_TOLERANCE_PCT / 100
      );
      if (nearDuplicate) {
        flags.push({
          key: "possible_duplicate",
          severity: "warn",
          label: "중복 발주 의심",
          detail: `같은 거래처로 ${DUPLICATE_WINDOW_DAYS}일 이내 발주번호 ${nearDuplicate.po_no}(${nearDuplicate.po_date}, ₩${Math.round(nearDuplicate.amount).toLocaleString("ko-KR")})와 금액이 ${DUPLICATE_AMOUNT_TOLERANCE_PCT}% 이내로 비슷합니다 — 중복 등록이 아닌지 확인해보세요.`,
        });
      }
    }

    if (po.item_summary && riserNames.length > 0) {
      const matched = riserNames.filter((name) => po.item_summary!.includes(name));
      if (matched.length > 0) {
        flags.push({
          key: "price_riser_hint",
          severity: "info",
          label: "단가 급등 품목 포함 가능성",
          detail: `발주 내용 텍스트에 최근 단가가 급등한 품목명(${matched.slice(0, 3).join(", ")})과 일치하는 문자열이 있습니다 — 텍스트 일치일 뿐 실제로 이 발주서에 그 품목이 포함됐다는 확정은 아닙니다(06 가격분석 참고).`,
        });
      }
    }

    return {
      po_no: po.po_no,
      po_date: po.po_date,
      supplier_code: po.supplier_code,
      supplier_name: supplierName,
      qty: po.qty,
      amount: po.amount,
      currency: po.currency,
      item_summary: po.item_summary,
      requested_delivery_date: po.requested_delivery_date,
      buyer: po.buyer,
      flags,
    };
  });

  rows.sort((a, b) => b.flags.length - a.flags.length);

  return { rows, generatedAt: new Date().toISOString(), limitation: LIMITATION_NOTE, historyWindowDays: HISTORY_WINDOW_DAYS };
}
