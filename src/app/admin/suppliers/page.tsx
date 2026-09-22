// 2026-09-21, Kevin 요청("메뉴 구조 재설계 — 05 업체분석: 누구에게 사고
// 있는가?") — 이 화면은 새 페이지지만 새 백엔드 로직은 아니다.
// getPurchaseInsights()가 이미 계산해 두던 bySupplier(업체별 구매액·비중)
// 를 최근 365일 창으로 뽑아 전용 화면에 표로 보여준다. "단일 공급업체
// 품목"과 "구매 집중도"는 07 공급 Risk로 분리했다(Kevin 설계안 최종
// 구조 기준 — 05는 "얼마나/누구에게 샀나", 07은 "공급에 문제가 생길
// 가능성이 있는가").
import { getPurchaseInsights } from "@/lib/actions/pis-dashboard";
import { PurchaseDetailDrilldown } from "@/components/Drilldown";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, formatWon, SectionHeader, EmptyNote } from "@/components/admin/dashboard-ui";

export default async function SuppliersPage() {
  const insights = await getPurchaseInsights(365, 25);

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        code="sup"
        title="05. 업체분석 — 누구에게 사고 있는가?"
        description="최근 365일 구매현황 전표(purchase_records) 기준, 거래처별 구매액과 전체 대비 비중입니다. 거래처는 supplier_name(항상 기록됨) 기준으로 묶었습니다 — supplier_code는 거래처명 완전일치 best-effort 매칭이라 일부 품목은 미매칭일 수 있지만, 그룹핑 자체에는 영향이 없습니다. 단일 공급업체 위험/구매 집중도는 07 공급 Risk에서 확인하세요."
      />

      <div className="flex flex-col gap-4">
        <SectionHeader
          title={`업체별 구매액 (상위 ${insights.bySupplier.length})`}
          note={`최근 365일 · 전표 ${formatNumber(insights.recordCount)}건 · 총 ${formatWon(
            insights.totalAmount
          )} · 거래처코드 매칭률 ${insights.supplierCoveragePct}%`}
        />
        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          {insights.bySupplier.length === 0 ? (
            <EmptyNote>최근 365일 구매 전표가 없습니다.</EmptyNote>
          ) : (
            <table className="w-full text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">거래처</th>
                  <th className="px-3 py-2 font-semibold text-right">구매액</th>
                  <th className="px-3 py-2 font-semibold text-right">비중</th>
                </tr>
              </thead>
              <tbody>
                {insights.bySupplier.map((s, i) => (
                  <PurchaseDetailDrilldown
                    as="row"
                    key={s.supplier_name}
                    trigger={
                      <>
                        <td className="px-3 py-2 text-ink-faint">{i + 1}</td>
                        <td className="px-3 py-2">
                          {s.supplier_name}
                          <span className="ml-1 text-ink-faint/60">›</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{formatWon(s.amount)}</td>
                        <td className="px-3 py-2 text-right text-ink-faint">{s.sharePct}%</td>
                      </>
                    }
                    title={`${s.supplier_name} · 최근 365일 구매액`}
                    description={`최근 365일 동안 ${s.supplier_name}에서 산 구매현황 전표(purchase_records) 합계는 ${formatWon(
                      s.amount
                    )}로, 같은 기간 전체 구매액의 ${s.sharePct}%를 차지합니다. 아래는 이 업체의 원본 구매 전표입니다.`}
                    filter={{ supplierName: s.supplier_name, sinceIso: insights.windowSinceIso }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
