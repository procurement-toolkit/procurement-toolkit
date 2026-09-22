// 2026-09-21, Kevin 요청("메뉴 구조 재설계 — 07 공급 Risk: 공급에 문제가
// 생길 가능성이 있는가?") — HOME(admin/page.tsx)에 있던 "업체가
// 위험한가?" 섹션(단일 공급업체 품목 + 구매 집중도)을 여기로 옮겼다.
// 계산 로직은 그대로다(getSupplierRiskSummary, getPurchaseInsights의
// top1SupplierSharePct). 가격 변동성/납기 Risk는 아직 계산할 수 있는
// 데이터가 없어(이카운트 발주서조회에 실제 입고일이 없고, IMMS 입고도
// 특정 발주서와 연결되지 않음) Kevin의 설계안대로 "준비 중" 안내만
// 남긴다 — 메뉴에서 숨기지 않고, 왜 아직 없는지 정직하게 보여준다.
import { getSupplierRiskSummary, getPurchaseInsights } from "@/lib/actions/pis-dashboard";
import { PurchaseDetailDrilldown } from "@/components/Drilldown";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, KpiTile, SectionHeader, EmptyNote, ComingSoon } from "@/components/admin/dashboard-ui";
import Link from "next/link";

export default async function SupplyRiskPage() {
  const [supplierRisk, purchase] = await Promise.all([getSupplierRiskSummary(), getPurchaseInsights(365)]);

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        code="risk"
        title="07. 공급 Risk — 공급에 문제가 생길 가능성이 있는가?"
        description={`거래처가 기록된 품목 ${formatNumber(supplierRisk.itemsWithAnySupplierRecorded)}개 기준. 업체별 구매액/비중 자체는 05 업체분석에서 확인하고, 여기서는 "한 곳에만 의존하는 품목"과 "구매가 한 업체에 몰려 있는 정도"를 봅니다.`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">
            단일 공급업체 품목 ({formatNumber(supplierRisk.singleSourceItemCount)}개)
          </h3>
          <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
            {supplierRisk.singleSourceItems.length === 0 ? (
              <EmptyNote>거래처가 기록된 입고 건이 없어 판단할 수 없습니다.</EmptyNote>
            ) : (
              supplierRisk.singleSourceItems.map((i) => (
                <PurchaseDetailDrilldown
                  key={i.item_code}
                  trigger={
                    <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px] last:border-0">
                      <span className="text-ink-soft">
                        {i.item_name}
                        <span className="ml-1 text-ink-faint/60">›</span>
                      </span>
                      <span className="text-ink-faint">{i.supplier_name}</span>
                    </div>
                  }
                  title={`${i.item_name} (${i.item_code}) · 단일 공급업체 품목`}
                  description={`purchase_records 전체 이력에서 이 품목을 산 거래처가 ${i.supplier_name} 한 곳뿐입니다 — 그 업체가 공급을 중단하면 대체 업체가 없다는 뜻입니다. 아래는 전체 구매 이력입니다.`}
                  filter={{ itemCode: i.item_code }}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <KpiTile
            label="구매 집중도 (상위 1개 거래처)"
            value={purchase.top1SupplierSharePct === null ? "데이터 없음" : `${purchase.top1SupplierSharePct}%`}
            sub="최근 365일 구매액 기준"
          />
          <p className="text-[12px] text-ink-faint">
            최근 365일 구매액 중 1위 거래처가 차지하는 비중입니다 — 값이 높을수록 그 업체 의존도가 높다는
            뜻입니다.{" "}
            <Link href="/admin/suppliers" className="pressable text-trace underline underline-offset-2">
              05 업체분석에서 업체별 순위 보기 →
            </Link>
          </p>

          <ComingSoon
            what="가격 변동성 (공급사별)"
            needs="이카운트가 품목당 단가를 1개만 제공해 공급사 간 단가 변동성 비교가 불가능합니다. 품목별 변동률은 06 가격분석에서 확인할 수 있습니다."
          />
          <ComingSoon
            what="납기 지연 / 납기 Risk"
            needs="발주서조회(GetPurchasesOrderList) 응답에 실제 입고일 필드가 없고, IMMS 입고도 특정 발주서와 연결되지 않습니다 — E-Count API에서 발주-입고 연결(PO Tracking)을 확인해야 계산할 수 있습니다."
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title="앞으로 추가될 지표" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ComingSoon what="공급업체 품질 (불량률/클레임)" needs="E-Count 또는 IMMS에 품질/클레임 기록이 연결되면 계산할 수 있습니다." />
          <ComingSoon what="OTIF (정시·정량 납품률)" needs="발주-입고 연결과 요청납기 대비 실제 입고일 데이터가 필요합니다." />
          <ComingSoon what="공급 중단 Risk 종합 점수" needs="위 지표들이 갖춰진 뒤 단일 공급업체·집중도·납기·품질을 종합해 계산할 예정입니다." />
        </div>
      </div>
    </div>
  );
}
