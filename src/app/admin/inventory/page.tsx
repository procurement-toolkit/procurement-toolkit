// 2026-09-21, Kevin 요청("메뉴 구조 재설계") — HOME(admin/page.tsx)에 있던
// "적정재고" 섹션(getInventoryHealth)을 04 재고관리 전용 화면으로 옮겼다.
// 계산 로직/문구는 그대로이고, 위치와 페이지 헤더(code="inv")만 바뀌었다.
import { getInventoryHealth } from "@/lib/actions/pis-dashboard";
import { PurchaseDetailDrilldown } from "@/components/Drilldown";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, formatDate, SectionHeader, EmptyNote } from "@/components/admin/dashboard-ui";

export default async function InventoryPage() {
  const inventory = await getInventoryHealth();

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        code="inv"
        title="04. 재고관리 — 재고가 적정한가?"
        description={
          <>
            재고부족위험 = 현재고 &lt; 안전재고, 과잉재고 = 현재고 &gt; 재주문점 × 3(임의 기준). 장기재고 =
            재고&gt;0인데 최근 90일 내 출고(생산불출/창고이동/택배발송 출발) 기록이 없는 품목. 현재고/출고 기록은
            100% IMMS 자체 거래 원장(stock_ledger) 기준이며, 안전재고/재주문점은 <strong>/admin/items</strong>
            에서 관리자가 설정합니다.
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <SectionHeader
          title="재고 현황"
          note={`전체 ${formatNumber(inventory.itemsTracked)}개 품목 중 재고 보유 ${formatNumber(
            inventory.itemsWithStock
          )}개 · 안전재고 설정 ${formatNumber(inventory.itemsWithSafetyStockSet)}개 · 재주문점 설정 ${formatNumber(
            inventory.itemsWithReorderPointSet
          )}개`}
        />

        {inventory.itemsWithStock === 0 && (
          <div className="rounded-xl border border-line bg-bg-raised px-4 py-3 text-[13px] text-ink-faint">
            IMMS 거래 원장에 기록된 재고 보유 품목이 아직 없습니다. 재고는 100% IMMS 자체 거래 기록으로
            계산되므로, 현장에서 입고/생산불출/창고이동을 기록하기 시작하면 자동으로 채워집니다.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">재고부족 위험</h3>
            <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
              {inventory.lowStockItems.length === 0 ? (
                <EmptyNote>
                  {inventory.itemsWithSafetyStockSet === 0
                    ? "안전재고가 설정된 품목이 없습니다 — /admin/items에서 설정하세요."
                    : "안전재고 미달 품목이 없습니다."}
                </EmptyNote>
              ) : (
                inventory.lowStockItems.map((i) => (
                  <PurchaseDetailDrilldown
                    key={i.item_code}
                    trigger={
                      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px] last:border-0">
                        <span className="text-ink-soft">
                          {i.item_name}
                          <span className="ml-1 text-ink-faint/60">›</span>
                        </span>
                        <span className="font-mono text-warn">
                          {formatNumber(i.qty_on_hand)} / {formatNumber(i.safety_stock)}
                        </span>
                      </div>
                    }
                    title={`${i.item_name} (${i.item_code}) · 재고부족 위험`}
                    description={`현재고 ${formatNumber(i.qty_on_hand)} < 안전재고 ${formatNumber(
                      i.safety_stock
                    )}. 현재고는 IMMS stock_ledger(입고/생산불출/창고이동/택배발송/반납 거래 기록) 누계이며, 안전재고는 /admin/items에서 관리자가 설정한 값입니다 — 아래는 이 품목의 최근 실제 구매 이력(purchase_records)으로, 얼마나 자주/얼마에 사왔는지 참고용입니다.`}
                    filter={{ itemCode: i.item_code }}
                  />
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">과잉재고</h3>
            <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
              {inventory.excessStockItems.length === 0 ? (
                <EmptyNote>
                  {inventory.itemsWithReorderPointSet === 0
                    ? "재주문점이 설정된 품목이 없습니다 — /admin/items에서 설정하세요."
                    : "재주문점 대비 과잉 품목이 없습니다."}
                </EmptyNote>
              ) : (
                inventory.excessStockItems.map((i) => (
                  <PurchaseDetailDrilldown
                    key={i.item_code}
                    trigger={
                      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px] last:border-0">
                        <span className="text-ink-soft">
                          {i.item_name}
                          <span className="ml-1 text-ink-faint/60">›</span>
                        </span>
                        <span className="font-mono text-ink">
                          {formatNumber(i.qty_on_hand)} / {formatNumber(i.reorder_point)}
                        </span>
                      </div>
                    }
                    title={`${i.item_name} (${i.item_code}) · 과잉재고`}
                    description={`현재고 ${formatNumber(i.qty_on_hand)} > 재주문점 ${formatNumber(
                      i.reorder_point
                    )}. 현재고는 IMMS stock_ledger 누계, 재주문점은 /admin/items에서 설정한 값입니다 — 아래는 이 품목의 최근 실제 구매 이력입니다.`}
                    filter={{ itemCode: i.item_code }}
                  />
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">장기재고 (90일 이상 미출고)</h3>
            <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
              {inventory.agingStockItems.length === 0 ? (
                <EmptyNote>재고 보유 품목이 없어 장기재고를 판단할 수 없습니다.</EmptyNote>
              ) : (
                inventory.agingStockItems.map((i) => (
                  <PurchaseDetailDrilldown
                    key={i.item_code}
                    trigger={
                      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px] last:border-0">
                        <span className="text-ink-soft">
                          {i.item_name}
                          <span className="ml-1 text-ink-faint/60">›</span>
                        </span>
                        <span className="font-mono text-ink-faint">{i.lastOutboundDate ? formatDate(i.lastOutboundDate) : "출고 기록 없음"}</span>
                      </div>
                    }
                    title={`${i.item_name} (${i.item_code}) · 장기재고`}
                    description="재고>0인데 최근 90일 내 출고(생산불출/창고이동/택배발송 출발) 기록이 IMMS stock_ledger에 없는 품목입니다 — 아래는 이 품목의 최근 실제 구매 이력입니다."
                    filter={{ itemCode: i.item_code }}
                  />
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">
              재고 커버리지 낮은 순 (최근 {inventory.usageWindowDays}일 월평균 사용량 기준)
            </h3>
            <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
              {inventory.lowCoverageItems.length === 0 ? (
                <EmptyNote>
                  최근 {inventory.usageWindowDays}일간 출고 기록이 있는 품목이 없어 사용량/커버리지를 계산할 수
                  없습니다.
                </EmptyNote>
              ) : (
                inventory.lowCoverageItems.map((i) => (
                  <PurchaseDetailDrilldown
                    key={i.item_code}
                    trigger={
                      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px] last:border-0">
                        <span className="text-ink-soft">
                          {i.item_name}
                          <span className="ml-1 text-ink-faint/60">›</span>
                        </span>
                        <span className="font-mono text-ink">
                          {i.coverageMonths.toFixed(1)}개월{" "}
                          <span className="text-ink-faint">(월 {formatNumber(Math.round(i.avgMonthlyUsage))})</span>
                        </span>
                      </div>
                    }
                    title={`${i.item_name} (${i.item_code}) · 재고 커버리지`}
                    description={`커버리지(개월) = 현재고 ÷ 월평균 사용량. 월평균 사용량은 최근 ${inventory.usageWindowDays}일간 IMMS stock_ledger의 출고(음수 delta) 합계를 30일 단위로 환산한 값(월 ${formatNumber(
                      Math.round(i.avgMonthlyUsage)
                    )})입니다 — 창고이동의 출발 레그도 "출고"로 잡혀 실제보다 다소 과대해질 수 있습니다. 아래는 이 품목의 최근 실제 구매 이력입니다.`}
                    filter={{ itemCode: i.item_code }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
