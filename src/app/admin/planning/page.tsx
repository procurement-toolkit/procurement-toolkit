// 2026-09-21, Kevin 요청("메뉴 구조 재설계 — 08 구매계획: 앞으로 무엇을
// 사야 하는가?") 종속 기능 구현. 재검토 중 Lead Time/MOQ가 실제로는 이미
// 10,004개 품목에 채워져 있음을 확인해(이전 기록과 달리 더 이상 블로커가
// 아님) 발주 추천을 만들었다 — 다만 Safety Stock/Reorder Point는 여전히
// 아무도 입력하지 않아(0/18,626) "리드타임 동안 버틸 수 있는가"만 계산하는
// 안전재고 없는 v1이다. 자세한 한계는 getReorderRecommendations 주석 참고.
import Link from "next/link";
import { getReorderRecommendations } from "@/lib/actions/pis-dashboard";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, KpiTile, EmptyNote } from "@/components/admin/dashboard-ui";

export default async function PlanningPage() {
  const result = await getReorderRecommendations();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="plan"
        title="08. 구매계획 — 앞으로 무엇을 사야 하는가?"
        description="현재고·최근 90일 월평균 사용량·Lead Time·MOQ를 함께 보고 '리드타임 안에 재고가 소진될 것으로 예상되는 품목'을 추천합니다."
      />

      <div className="rounded-xl border border-dashed border-line-strong bg-bg-raised px-4 py-3 text-[12px] leading-relaxed text-ink-faint">
        <span className="font-semibold text-ink-soft">이 화면의 한계: </span>
        안전재고(Safety Stock)가 아직 아무 품목에도 입력되어 있지 않아(수기 입력 항목, /admin/items), 안전 여유분 없이 &quot;리드타임 동안 버틸 수 있는가&quot;만 계산합니다 — 이 목록에 없다고 여유가 충분하다는 뜻은 아닙니다. 또한 이미 나가 있는 발주서(02 발주관리의 진행중 발주)를 반영하지 못합니다 — 발주서조회 API에 품목코드가 없어 특정 발주서가 어떤 품목인지 알 수 없기 때문입니다(결재검토 화면과 동일한 제약). 추천 전에 02 발주관리에서 이미 발주해뒀는지 꼭 확인하세요.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile label="Lead Time 등록 품목" value={formatNumber(result.itemsWithLeadTime)} sub="전체 품목 중 이카운트 등록 리드타임 보유" />
        <KpiTile label="사용 이력 있는 품목" value={formatNumber(result.itemsWithUsage)} sub={`최근 ${result.usageWindowDays}일 IMMS 출고 기록 기준`} />
        <KpiTile label="발주 필요 후보" value={formatNumber(result.recommendations.length)} sub="리드타임 안에 소진 예상" />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
        {result.recommendations.length === 0 ? (
          <EmptyNote>
            {result.itemsWithUsage === 0
              ? "최근 90일 IMMS 출고 기록이 있는 품목이 없어 발주 추천을 계산할 수 없습니다 — 현장에서 생산불출/창고이동 기록이 쌓이면 계산됩니다."
              : "리드타임 안에 소진될 것으로 예상되는 품목이 없습니다."}
          </EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">품목</th>
                  <th className="px-3 py-2 font-semibold text-right">현재고</th>
                  <th className="px-3 py-2 font-semibold text-right">월평균사용량</th>
                  <th className="px-3 py-2 font-semibold text-right">재고 커버리지</th>
                  <th className="px-3 py-2 font-semibold text-right">Lead Time</th>
                  <th className="px-3 py-2 font-semibold text-right">권장 발주수량</th>
                </tr>
              </thead>
              <tbody>
                {result.recommendations.map((r) => (
                  <tr key={r.item_code} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/admin/item-analysis/${encodeURIComponent(r.item_code)}`} className="hover:underline">
                        {r.item_name}
                      </Link>
                      <span className="ml-1 text-ink-faint/60">({r.item_code})</span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.qtyOnHand)}</td>
                    <td className="px-3 py-2 text-right text-ink-faint">{formatNumber(r.avgMonthlyUsage)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-warn">{r.coverageMonths}개월</td>
                    <td className="px-3 py-2 text-right text-ink-faint">{r.leadTimeDays}일</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatNumber(r.recommendedQty)}
                      {r.moq && <span className="ml-1 text-[11px] text-ink-faint">(MOQ {formatNumber(r.moq)})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/admin/inventory" className="pressable rounded-xl border border-line bg-bg-raised px-4 py-3 hover:border-[var(--inv)]">
          <div className="text-[13px] font-semibold text-ink">04 재고관리 →</div>
          <div className="mt-0.5 text-[12px] text-ink-faint">재고부족 위험 / 재고 커버리지 낮은 순 목록</div>
        </Link>
        <Link href="/admin/purchase-orders" className="pressable rounded-xl border border-line bg-bg-raised px-4 py-3 hover:border-[var(--ord)]">
          <div className="text-[13px] font-semibold text-ink">02 발주관리 →</div>
          <div className="mt-0.5 text-[12px] text-ink-faint">이미 나가 있는 미입고(Active) 발주 확인 — 위 추천과 대조 필요</div>
        </Link>
      </div>
    </div>
  );
}
