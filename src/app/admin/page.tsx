import Link from "next/link";
import {
  getDashboardKpis,
  getPurchaseInsights,
  getYearToDateComparison,
  getPriceMovementSummary,
  getInventoryHealth,
  getSupplierRiskSummary,
  getRequestedMetricStatus,
} from "@/lib/actions/pis-dashboard";
import { getPurchaseOrderSummary } from "@/lib/actions/purchase-orders";
import { Drilldown } from "@/components/Drilldown";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, formatWon, formatPct, KpiTile, SectionHeader } from "@/components/admin/dashboard-ui";

const STATUS_STYLE: Record<string, { text: string; className: string }> = {
  available: { text: "가능", className: "bg-trace-soft text-trace" },
  partial: { text: "부분 가능", className: "bg-warn-soft text-warn" },
  blocked: { text: "불가", className: "bg-bg-sunken text-ink-faint" },
};

// 2026-09-21, Kevin 요청("메뉴 구조 재설계 — HOME은 상세 데이터가 아니라
// '지금 무엇을 봐야 하는가'만 보여주는 Dashboard") — 이전엔 이 페이지
// 하나에 재고/가격/업체 위험까지 전부 표로 펼쳐놨었다. 그 표들은 각각
// 04 재고관리/06 가격분석/07 공급 Risk 전용 화면으로 옮기고, 여기 HOME은
// ① 얼마나 샀나(YTD) 핵심 숫자, ② 확인이 필요한 항목(재고부족/장기재고/
// 단일공급업체/가격상승/구매집중도) 요약 카드 — 눌러서 해당 화면으로
// 바로 이동, ③ 시스템 진단용 데이터 현황/지표 상태 표만 남긴다.
function ActionTile({
  href,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  sub?: string;
  tone: "warn" | "neutral";
}) {
  return (
    <Link
      href={href}
      className={`pressable flex flex-col gap-1 rounded-xl border px-4 py-3 hover:border-line-strong ${
        tone === "warn" ? "border-warn-soft bg-warn-soft/40" : "border-line bg-bg-raised"
      }`}
    >
      <span className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={`font-mono text-xl font-bold tabular-nums ${tone === "warn" ? "text-warn" : "text-ink"}`}>{value}</span>
      {sub && <span className="text-[11px] text-ink-faint">{sub}</span>}
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const [kpis, purchase, ytd, priceMovement, inventory, supplierRisk, poSummary, requestedMetrics] = await Promise.all([
    getDashboardKpis(),
    // 2026-09-18: "최근 30일" 업체별/품목별/카테고리별 랭킹은 대시보드에서
    // 뺐다(→ /admin/purchases로 이동, 연도별 누적 비교) — 여기서는 이제
    // "구매 집중도"(top1SupplierSharePct) 계산에만 쓰므로, 하루 이틀 변동에
    // 흔들리지 않도록 창을 365일로 늘렸다.
    getPurchaseInsights(365),
    getYearToDateComparison(3),
    getPriceMovementSummary(),
    getInventoryHealth(),
    getSupplierRiskSummary(),
    getPurchaseOrderSummary(),
    Promise.resolve(getRequestedMetricStatus()),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        code="dash"
        title="HK PIS — 구매 인텔리전스 대시보드"
        description={
          <>
            &quot;얼마나/어디에서 샀나&quot;의 구매금액은 구매팀이 <strong>/admin/purchase-import</strong>
            로 직접 업로드하는 실제 구매현황 전표 데이터(공급가액, 부가세 제외) 기준입니다 — 추정치가
            아닙니다. 재고/가격/업체 위험처럼 자세히 볼 항목은 각 전용 화면(좌측 메뉴)에서 확인하세요 —
            여기서는 오늘 확인해야 할 것만 요약합니다.
          </>
        }
      />

      {/* 얼마나 샀나? */}
      <div className="flex flex-col gap-4">
        <SectionHeader
          title="얼마나 샀나?"
          note={`${ytd.asOfLabel} 연초 누적 비교 · purchase_records(구매현황 전표) 기준`}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ytd.years.map((y, i) => {
            const prev = ytd.years[i - 1];
            const yoy = prev && prev.amount > 0 ? Math.round(((y.amount - prev.amount) / prev.amount) * 1000) / 10 : null;
            const isLatest = i === ytd.years.length - 1;
            return (
              <div
                key={y.year}
                className={`rounded-xl border px-4 py-3 ${isLatest ? "border-[var(--rank)] bg-bg-raised" : "border-line bg-bg-raised"}`}
              >
                <div className="text-[11px] uppercase tracking-wide text-ink-faint">
                  {y.year}년 {ytd.asOfLabel} 누적
                </div>
                <div className="font-mono text-xl font-bold tabular-nums text-ink">{formatWon(y.amount)}</div>
                {yoy !== null && (
                  <div className={`text-[12px] font-semibold ${yoy > 0 ? "text-warn" : yoy < 0 ? "text-accent-ink" : "text-ink-faint"}`}>
                    전년 동기간 대비 {formatPct(yoy)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/admin/purchases"
            className="pressable flex items-center justify-between rounded-xl border border-line bg-bg-raised px-4 py-3 hover:border-[var(--rank)]"
          >
            <div>
              <div className="text-[13px] font-semibold text-ink">01 구매현황 — 업체별 · 품목별 · 카테고리별 (연도별 누적) →</div>
              <div className="mt-0.5 text-[12px] text-ink-faint">2023년부터 연도 단위로 누적해 같은 업체·품목이 해가 갈수록 어떻게 바뀌는지 비교합니다.</div>
            </div>
            <span className="tag tag-rank shrink-0">rank</span>
          </Link>
          <Link
            href="/admin/purchase-orders"
            className="pressable flex items-center justify-between rounded-xl border border-line bg-bg-raised px-4 py-3 hover:border-[var(--ord)]"
          >
            <div>
              <div className="text-[13px] font-semibold text-ink">02 발주관리 — 진행중 · 종결 →</div>
              <div className="mt-0.5 text-[12px] text-ink-faint">
                진행중 {formatNumber(poSummary.inProgressCount)}건 · 종결 {formatNumber(poSummary.closedCount)}건 — 클릭해 발주서별 상세를 확인하세요.
              </div>
            </div>
            <span className="tag tag-ord shrink-0">ord</span>
          </Link>
        </div>
      </div>

      {/* 확인이 필요한 항목 — 2026-09-21, Kevin 설계안의 "ACTION REQUIRED"
          개념을 가볍게 구현: 각 전용 화면(04/06/07)이 이미 계산해 둔 숫자
          중 "많을수록 안 좋은" 몇 개만 여기서 미리 보여주고, 클릭하면 그
          화면으로 이동한다. 값 자체를 다시 계산하지 않고 같은 함수를
          재사용한다. */}
      <div className="flex flex-col gap-4">
        <SectionHeader title="확인이 필요한 항목" note="아래 숫자를 누르면 해당 화면의 상세 목록으로 이동합니다." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ActionTile
            href="/admin/inventory"
            label="재고부족 위험"
            value={`${formatNumber(inventory.lowStockItems.length)}건`}
            tone={inventory.lowStockItems.length > 0 ? "warn" : "neutral"}
          />
          <ActionTile
            href="/admin/inventory"
            label="장기재고 (90일+)"
            value={`${formatNumber(inventory.agingStockItems.length)}건`}
            tone={inventory.agingStockItems.length > 0 ? "warn" : "neutral"}
          />
          <ActionTile
            href="/admin/supply-risk"
            label="단일 공급업체 품목"
            value={`${formatNumber(supplierRisk.singleSourceItemCount)}개`}
            tone={supplierRisk.singleSourceItemCount > 0 ? "warn" : "neutral"}
          />
          <ActionTile
            href="/admin/pricing"
            label="단가 상승 품목"
            value={`${formatNumber(priceMovement.risen)}개`}
            sub="데이터 수집 시작일 대비"
            tone={priceMovement.risen > 0 ? "warn" : "neutral"}
          />
          <ActionTile
            href="/admin/supply-risk"
            label="구매 집중도 (1위 거래처)"
            value={purchase.top1SupplierSharePct === null ? "-" : `${purchase.top1SupplierSharePct}%`}
            sub="최근 365일"
            tone="neutral"
          />
        </div>
      </div>

      {/* 데이터 현황 — 2026-09-18, Kevin 피드백("전체 품목/카테고리 등록/단가
          스냅샷/거래처/IMMS 누적 거래 같은 정보들을 어디에 쓸 수 있는거지?")
          에 따라 대시보드 맨 위 헤드라인 5칸 그리드에서 여기 맨 아래 한 줄
          보조 정보로 내렸다 — 구매 인사이트가 아니라 "시스템에 데이터가 얼마나
          쌓여있나"를 보는 진단용 숫자라, 페이지 상단을 차지할 필요는 없지만
          여전히 눌러서 근거를 확인할 수 있게 유지한다. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] uppercase tracking-wide text-ink-faint">데이터 현황 (시스템 진단용 — 구매 인사이트 아님)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Drilldown
            trigger={<KpiTile label="전체 품목" value={formatNumber(kpis.totalItems)} interactive />}
            title="전체 품목"
            description={`items 테이블의 전체 행 수(count)입니다. E-Count 품목마스터 동기화(품목조회 API)로 채워지며, 현재 ${formatNumber(
              kpis.totalItems
            )}개가 등록되어 있습니다. /admin/ecount-sync에서 동기화 이력을 확인할 수 있습니다.`}
          />
          <Drilldown
            trigger={
              <KpiTile
                label="카테고리 등록"
                value={formatNumber(kpis.itemsWithCategory)}
                sub={kpis.totalItems > 0 ? `${Math.round((kpis.itemsWithCategory / kpis.totalItems) * 100)}%` : undefined}
                interactive
              />
            }
            title="카테고리 등록"
            description={`items.item_category가 NULL이 아닌 품목 수 ÷ 전체 품목 수입니다. ${formatNumber(
              kpis.itemsWithCategory
            )} / ${formatNumber(kpis.totalItems)} = ${
              kpis.totalItems > 0 ? Math.round((kpis.itemsWithCategory / kpis.totalItems) * 100) : 0
            }%. 카테고리가 없으면 카테고리 기준 집계에서 "미분류"로 묶입니다.`}
          />
          <Drilldown
            trigger={
              <KpiTile
                label="단가 스냅샷 보유"
                value={formatNumber(kpis.itemsWithPrice)}
                sub={kpis.totalItems > 0 ? `전체의 ${Math.round((kpis.itemsWithPrice / kpis.totalItems) * 100)}%` : undefined}
                interactive
              />
            }
            title="단가 스냅샷 보유"
            description={`price_history에 최소 1개 이상의 단가 스냅샷(이카운트 품목조회의 IN_PRICE)이 있는 품목 수입니다. ${formatNumber(
              kpis.itemsWithPrice
            )} / ${formatNumber(kpis.totalItems)}. 이 스냅샷이 "06 가격분석"의 평균단가/변동률 계산 기반입니다 — 실제 구매현황(purchase_records)과는 별개의 소스입니다.`}
          />
          <Drilldown
            trigger={<KpiTile label="등록 거래처" value={formatNumber(kpis.suppliers)} interactive />}
            title="등록 거래처"
            description={`suppliers 테이블의 전체 행 수입니다. 발주서조회 API에 등장한 거래처를 자동으로 채워 넣는 방식이라(전용 거래처조회 API가 없음), 실제 거래한 모든 업체를 다 포함하지 않을 수 있습니다. 현재 ${formatNumber(
              kpis.suppliers
            )}개.`}
          />
          <Drilldown
            trigger={<KpiTile label="IMMS 누적 거래" value={formatNumber(kpis.totalTransactions)} interactive />}
            title="IMMS 누적 거래"
            description={`transactions 테이블(모바일 IMMS의 입고/생산불출/창고이동/택배발송/반납 기록) 전체 행 수입니다. 현재 ${formatNumber(
              kpis.totalTransactions
            )}건 — 위 "구매액" 관련 숫자들과는 다른 소스(purchase_records)이니 혼동하지 마세요. 09 자재이동에서 IMMS 모바일로 이동할 수 있습니다.`}
          />
        </div>
      </div>

      {/* 지표 상태 */}
      <div>
        <SectionHeader
          title="요청하신 지표 중 계산 가능 여부"
          note="구매 담당자가 궁금해하는 5가지 질문 기준으로 오늘 실제로 계산 가능한지 정리했습니다. '불가'는 포기가 아니라, 필요한 데이터가 무엇인지 명확히 하기 위한 표시입니다."
        />
        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 font-semibold">지표명</th>
                <th className="px-3 py-2 font-semibold">상태</th>
                <th className="px-3 py-2 font-semibold">비고</th>
              </tr>
            </thead>
            <tbody>
              {requestedMetrics.map((m, i) => {
                const s = STATUS_STYLE[m.status];
                return (
                  <tr key={i} className="border-b border-line align-top last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{m.metric}</div>
                      <div className="mt-0.5 text-[11px] text-ink-faint">{m.section}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.className}`}>{s.text}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-faint">{m.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
