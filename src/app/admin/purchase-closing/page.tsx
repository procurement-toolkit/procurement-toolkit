import { getPendingInboundForClosing, getRecentPurchaseClosings } from "@/lib/actions/purchase-closing";
import { getSuppliers } from "@/lib/queries";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { PurchaseClosingWorkspace } from "./PurchaseClosingWorkspace";
import { InsightSection } from "@/components/charts/InsightSection";
import { BarChart, type BarDatum } from "@/components/charts/BarChart";

export default async function PurchaseClosingPage() {
  const [pending, recent, suppliers] = await Promise.all([
    getPendingInboundForClosing(),
    getRecentPurchaseClosings(30),
    getSuppliers(),
  ]);

  // recent는 closing_date 내림차순이라, 시계열 차트는 오래된 → 최신
  // 순으로 뒤집어서 보여준다(2026-09-23, Kevin 요청: 메뉴 하단 인사이트).
  const recentClosingChartData: BarDatum[] = [...recent]
    .reverse()
    .map((c) => ({ label: c.closingDate, value: c.totalAmount }));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="cls"
        title="11. 매입마감 — 입고 대사 및 확정"
        description={
          <>
            IMMS 모바일에서 검수·수량입력이 끝난 입고(IN) 건이 여기 <strong>마감 대기</strong>로 뜹니다. 같은
            거래처의 입고 건을 여러 개 묶어 하나의 세금계산서/청구서로 마감할 수 있고, 공급업체가 실제
            청구한 수량·단가는 회계가 이 화면에서 직접 입력해 최종 확정합니다 — IMMS 입고 수량과 다르면
            차이만 참고로 보여줄 뿐 자동으로 재검수를 요구하지 않습니다. 마감이 끝나야 세금계산서 발행/매입전표
            생성 단계로 넘어갈 수 있다는 업무 프로세스에 따른 화면입니다.
            <br />
            <span className="text-ink-faint">
              ※ Phase 1(이 화면 — IMMS/PIS 안에서 마감을 기록·추적)까지만 구현되어 있습니다. 이카운트
              구매입력(SavePurchases)으로 실제 전표를 쏘는 Phase 2는 이카운트 API 필드 스펙/레이트리밋 확인 후
              별도로 추가됩니다.
            </span>
          </>
        }
      />

      <PurchaseClosingWorkspace pending={pending} recent={recent} suppliers={suppliers} />

      {recentClosingChartData.length > 0 && (
        <InsightSection title="최근 마감 금액 추이" description="합계(부가세포함) 기준, 오래된 순 → 최신순">
          <BarChart data={recentClosingChartData} color="var(--cls)" unit="won" />
        </InsightSection>
      )}
    </div>
  );
}
