// 2026-09-21, Kevin 요청("메뉴 구조 재설계") — HOME(admin/page.tsx)에 있던
// "단가 상승률/변동률"(이카운트 등록단가 스냅샷 기준)과 "가격절감 기회"
// (실제 구매현황 purchase_records 기준 전년비/업체별 가격차이) 두 섹션을
// 06 가격분석 전용 화면으로 옮겼다. 계산 로직/문구는 그대로이고, 위치와
// 페이지 헤더(code="prc")만 바뀌었다.
import {
  getCategoryBreakdown,
  getPriceMovementSummary,
  getPriceVarianceInsights,
  getStandardCostVariance,
} from "@/lib/actions/pis-dashboard";
import { Drilldown, PurchaseDetailDrilldown } from "@/components/Drilldown";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, formatWon, formatPct, formatDate, KpiTile, SectionHeader, EmptyNote } from "@/components/admin/dashboard-ui";

export default async function PricingPage() {
  const [categories, priceMovement, priceVariance, costVariance] = await Promise.all([
    getCategoryBreakdown(),
    getPriceMovementSummary(),
    getPriceVarianceInsights(),
    getStandardCostVariance(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        code="prc"
        title="06. 가격분석 — 가격이 적정한가?"
        description="단가 상승률/변동률은 이카운트 등록 현재단가 스냅샷 기준 참고용이고, 가격절감 기회(전년 대비/업체별 가격차이)는 실제 구매현황(purchase_records) 기준입니다 — 어느 쪽이 어떤 소스인지는 각 섹션 안내를 참고하세요."
      />

      <div className="flex flex-col gap-4">
        <SectionHeader
          title="단가 상승률 / 변동률 (참고용 — 이카운트 등록단가 스냅샷 기준)"
          note={
            priceMovement.earliestSnapshotDate
              ? `단가 기록 기간: ${formatDate(priceMovement.earliestSnapshotDate)} ~ ${formatDate(priceMovement.latestSnapshotDate)} (전년 대비 아님 — 데이터 수집 시작일 대비)`
              : "아직 단가 기록이 없습니다"
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">카테고리별 품목 현황 · 평균단가</h3>
            <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
              <table className="w-full text-left text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="px-3 py-2 font-semibold">카테고리</th>
                    <th className="px-3 py-2 font-semibold text-right">품목 수</th>
                    <th className="px-3 py-2 font-semibold text-right">평균단가</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <Drilldown
                      as="row"
                      key={c.category}
                      trigger={
                        <>
                          <td className="px-3 py-2">
                            {c.category}
                            <span className="ml-1 text-ink-faint/60">›</span>
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(c.itemCount)}</td>
                          <td className="px-3 py-2 text-right text-ink-faint">{c.avgUnitPrice === null ? "-" : formatWon(c.avgUnitPrice)}</td>
                        </>
                      }
                      title={`${c.category} · 평균단가`}
                      description={`items.item_category='${c.category}'인 품목 ${formatNumber(
                        c.itemCount
                      )}개 각각의 price_history 최신 단가 스냅샷(이카운트 IN_PRICE)을 단순 평균한 값입니다${
                        c.avgUnitPrice === null ? " — 이 카테고리는 아직 스냅샷이 있는 품목이 없어 \"-\"로 표시됩니다." : `: ${formatWon(c.avgUnitPrice)}.`
                      } 실제 구매현황(purchase_records) 평균단가와는 다른 소스입니다 — 아래 "가격절감 기회" 섹션을 눌러 실제 구매 단가를 확인하세요.`}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">
              단가 변동 (상승 {priceMovement.risen} · 하락 {priceMovement.fallen} · 변동없음 {priceMovement.unchanged})
            </h3>
            <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
              {priceMovement.itemsWithHistory === 0 ? (
                <EmptyNote>
                  스냅샷이 2개 이상 쌓인 품목이 아직 없습니다 ({priceMovement.itemsSingleSnapshot}개 품목이 1개 스냅샷만
                  보유). 며칠~몇 주 뒤 다시 확인하면 변동률이 나타납니다.
                </EmptyNote>
              ) : (
                <table className="w-full text-left text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2 font-semibold">품목</th>
                      <th className="px-3 py-2 font-semibold text-right">변동률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...priceMovement.topRisers.slice(0, 5), ...priceMovement.topFallers.slice(0, 5)].map((m) => (
                      <Drilldown
                        as="row"
                        key={m.item_code}
                        trigger={
                          <>
                            <td className="px-3 py-2">
                              {m.item_name}
                              <span className="ml-1 text-ink-faint/60">›</span>
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold ${m.changePct > 0 ? "text-warn" : m.changePct < 0 ? "text-accent-ink" : "text-ink-faint"}`}
                            >
                              {formatPct(m.changePct)}
                            </td>
                          </>
                        }
                        title={`${m.item_name} (${m.item_code}) · 단가 변동`}
                        description={`price_history 스냅샷 기록 시작(${formatDate(
                          priceMovement.earliestSnapshotDate
                        )}) 시점 단가 ${formatWon(m.earliestPrice)} → 최신(${formatDate(
                          priceMovement.latestSnapshotDate
                        )}) 단가 ${formatWon(m.latestPrice)} = ${formatPct(
                          m.changePct
                        )}. 전년 대비가 아니라 "데이터 수집 시작일 대비"입니다 — 아직 이카운트 등록 현재단가 스냅샷 2개 시점 비교일 뿐, 실제 지불 단가(purchase_records) 기반은 아래 "가격절감 기회" 섹션을 참고하세요.`}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader
          title="가격절감 기회 (전년 대비 / 업체별 가격차이)"
          note={`${priceVariance.windowLabel} · 실제 구매현황(purchase_records) 기준 — 전년 평균단가는 ${formatNumber(
            priceVariance.yoyComparableItemCount
          )}개 비교 가능 품목, 업체별 가격차이는 최근 12개월에 공급업체가 2곳 이상인 ${formatNumber(
            priceVariance.supplierGapItemCount
          )}개 품목 기준`}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Drilldown
            trigger={
              <KpiTile
                label="업체 전환 시 잠재 절감액 (최근 12개월)"
                value={formatWon(priceVariance.supplierGapTotalPotentialSavings)}
                sub={`${formatNumber(priceVariance.supplierGapItemCount)}개 품목 대상`}
                interactive
              />
            }
            title="업체 전환 시 잠재 절감액"
            description={`같은 품목을 2곳 이상 업체에서 산 ${formatNumber(
              priceVariance.supplierGapItemCount
            )}개 품목 각각에 대해 "(비싼 업체 평균단가 − 최저가 업체 평균단가) × 비싼 업체에서 산 수량"을 계산해 전부 더한 값입니다. 일회성구매 같은 범용 코드, 배송비 등 비제품 코드, ±500% 초과 변동(단위 불일치 추정)은 제외했습니다. 아래 "업체별 가격차이" 표에서 품목별 상세를 확인할 수 있습니다.`}
          />
          <Drilldown
            trigger={
              <KpiTile
                label="전년 대비 비교 가능 품목"
                value={formatNumber(priceVariance.yoyComparableItemCount)}
                sub="최근 12개월 · 이전 12개월 모두 구매 이력 보유"
                interactive
              />
            }
            title="전년 대비 비교 가능 품목"
            description="최근 12개월과 이전 12개월(24개월 전 ~ 12개월 전) 양쪽 모두 구매 이력이 있는 품목 수입니다. 달력 연도가 아니라 굴러가는 12개월 창을 쓴 이유는 올해가 아직 안 끝나 부분 연도라 달력 연도 비교가 왜곡되기 때문입니다. 일회성구매 등 범용/더미/배송비 코드는 제외했습니다."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">전년 대비 단가 변동 상위 품목</h3>
            <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
              {priceVariance.yoyComparableItemCount === 0 ? (
                <EmptyNote>최근 12개월과 이전 12개월 모두 구매 이력이 있는 품목이 없습니다.</EmptyNote>
              ) : (
                <table className="w-full text-left text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2 font-semibold">품목</th>
                      <th className="px-3 py-2 font-semibold text-right">이전 12개월</th>
                      <th className="px-3 py-2 font-semibold text-right">최근 12개월</th>
                      <th className="px-3 py-2 font-semibold text-right">변동률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...priceVariance.yoyTopRisers.slice(0, 5), ...priceVariance.yoyTopFallers.slice(0, 5)].map((m) => (
                      <PurchaseDetailDrilldown
                        as="row"
                        key={m.item_code}
                        trigger={
                          <>
                            <td className="px-3 py-2">
                              {m.item_name}
                              <span className="ml-1 text-ink-faint/60">›</span>
                            </td>
                            <td className="px-3 py-2 text-right text-ink-faint">{formatWon(m.priorAvgPrice)}</td>
                            <td className="px-3 py-2 text-right">{formatWon(m.recentAvgPrice)}</td>
                            <td
                              className={`px-3 py-2 text-right font-semibold ${
                                m.changePct > 0 ? "text-warn" : m.changePct < 0 ? "text-accent-ink" : "text-ink-faint"
                              }`}
                            >
                              {formatPct(m.changePct)}
                            </td>
                          </>
                        }
                        title={`${m.item_name} (${m.item_code}) · 이전 12개월 vs 최근 12개월`}
                        description={`이전 12개월 수량가중평균단가 ${formatWon(
                          m.priorAvgPrice
                        )} → 최근 12개월 ${formatWon(m.recentAvgPrice)} = ${formatPct(
                          m.changePct
                        )}. 수량가중평균 = Σ(수량×단가)÷Σ수량(발주 단위가 다른 여러 건을 동일 가중치로 섞지 않기 위함). 아래는 24개월간 이 품목의 원본 구매 전표입니다 — 어떤 거래처/날짜/수량이 평균에 반영됐는지 직접 확인할 수 있습니다.`}
                        filter={{ itemCode: m.item_code, sinceIso: priceVariance.priorStartIso }}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">업체별 가격차이 · 절감 기회 상위 품목</h3>
            <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
              {priceVariance.supplierGapItems.length === 0 ? (
                <EmptyNote>최근 12개월에 같은 품목을 2곳 이상 업체에서 구매한 사례가 없습니다.</EmptyNote>
              ) : (
                <table className="w-full text-left text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2 font-semibold">품목</th>
                      <th className="px-3 py-2 font-semibold text-right">최저가 업체</th>
                      <th className="px-3 py-2 font-semibold text-right">최고가 업체</th>
                      <th className="px-3 py-2 font-semibold text-right">절감 기회</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceVariance.supplierGapItems.map((g) => (
                      <PurchaseDetailDrilldown
                        as="row"
                        key={g.item_code}
                        trigger={
                          <>
                            <td className="px-3 py-2">
                              {g.item_name}
                              <span className="ml-1 text-ink-faint/60">›</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div>{formatWon(g.minPrice)}</div>
                              <div className="text-[11px] text-ink-faint">{g.minSupplier}</div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="text-warn">{formatWon(g.maxPrice)}</div>
                              <div className="text-[11px] text-ink-faint">{g.maxSupplier}</div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="font-semibold">{formatWon(g.potentialSavings)}</div>
                              <div className="text-[11px] text-ink-faint">{formatPct(g.gapPct)}</div>
                            </td>
                          </>
                        }
                        title={`${g.item_name} (${g.item_code}) · 업체별 가격차이`}
                        description={`최근 12개월 동안 최저가 업체(${g.minSupplier}, ${formatWon(
                          g.minPrice
                        )})와 최고가 업체(${g.maxSupplier}, ${formatWon(g.maxPrice)}) 사이 ${formatPct(
                          g.gapPct
                        )} 차이가 있습니다. 잠재 절감액 ${formatWon(
                          g.potentialSavings
                        )} = 최저가보다 비싸게 산 수량 × (해당 업체 평균단가 − 최저가). 아래는 최근 12개월 이 품목의 원본 구매 전표입니다 — 거래처별로 실제 얼마에 샀는지 직접 확인하세요.`}
                        filter={{ itemCode: g.item_code, sinceIso: priceVariance.recentStartIso }}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader
          title="표준원가 대비 실제단가 (이카운트 등록 표준원가 기준, 2026-09-21 추가)"
          note={
            costVariance.itemsWithMaterialCost === 0
              ? "아직 표준원가(MATERIAL_COST)가 등록된 품목이 없습니다 — 다음 이카운트 동기화 이후 이 값이 채워진 품목부터 나타납니다."
              : `표준원가 등록 품목 ${formatNumber(costVariance.itemsWithMaterialCost)}개 중 최신 실제단가와 비교 가능한 품목 ${formatNumber(
                  costVariance.comparableItemCount
                )}개 기준`
          }
        />
        <p className="text-[12px] leading-relaxed text-ink-faint">
          이 표준원가는 실제 매입 이력으로 계산한 값이 아니라 이카운트에 담당자가 입력해둔 값입니다 — 회사가 이 필드를
          꾸준히 관리하지 않았다면 오래됐거나 비어있는 품목이 많을 수 있으니, 위 두 섹션(실측 기반)의 보조 참고로만
          쓰세요.
        </p>

        {costVariance.comparableItemCount === 0 ? (
          <EmptyNote>표준원가와 최신 실제단가를 모두 가진 품목이 아직 없습니다.</EmptyNote>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
            <table className="w-full text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">품목</th>
                  <th className="px-3 py-2 font-semibold text-right">표준원가</th>
                  <th className="px-3 py-2 font-semibold text-right">최신 실제단가</th>
                  <th className="px-3 py-2 font-semibold text-right">차이</th>
                </tr>
              </thead>
              <tbody>
                {[...costVariance.topOverStandard.slice(0, 5), ...costVariance.topUnderStandard.slice(0, 5)].map((r) => (
                  <Drilldown
                    as="row"
                    key={r.item_code}
                    trigger={
                      <>
                        <td className="px-3 py-2">
                          {r.item_name}
                          <span className="ml-1 text-ink-faint/60">›</span>
                        </td>
                        <td className="px-3 py-2 text-right text-ink-faint">{formatWon(r.materialCost)}</td>
                        <td className="px-3 py-2 text-right">{formatWon(r.latestActualPrice)}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            r.variancePct > 0 ? "text-warn" : r.variancePct < 0 ? "text-accent-ink" : "text-ink-faint"
                          }`}
                        >
                          {formatPct(r.variancePct)}
                        </td>
                      </>
                    }
                    title={`${r.item_name} (${r.item_code}) · 표준원가 대비`}
                    description={`이카운트 등록 표준원가(MATERIAL_COST) ${formatWon(
                      r.materialCost
                    )} 대비 최신 실제 입고단가(price_history) ${formatWon(r.latestActualPrice)} = ${formatPct(
                      r.variancePct
                    )}. 표준원가는 실제 매입 이력이 아니라 이카운트에 등록된 값이라 최신화 여부에 따라 신뢰도가 다를 수 있습니다.`}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
