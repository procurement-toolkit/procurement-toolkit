import { getDashboardKpis } from "@/lib/actions/pis-dashboard";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { ItemStockSettingsManager } from "./ItemStockSettingsManager";

export default async function AdminItemsPage() {
  const kpis = await getDashboardKpis();

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        code="itm"
        title="품목 재고 기준 설정"
        description={
          <>
            안전재고/재주문점을 입력한 품목만 PIS 대시보드의 재고부족위험/과잉재고 지표에
            반영됩니다. 전체 {kpis.totalItems.toLocaleString("ko-KR")}개 품목에 한 번에 값을
            넣는 자동 채우기는 없습니다 — 잘못된 기본값(예: 0)이 오히려 재고부족 경고를
            조용히 죽이는 게 더 위험하다고 판단했습니다. 대신 최근 12개월 실제 구매량
            (purchase_records) × 리드타임으로 계산한 <strong>추천값</strong>을 입력칸 아래에
            표시합니다 — 확정값이 아니라 출발점이니 확인 후 &quot;적용&quot;으로 채우고
            저장해주세요. 구매 이력이 없는 품목은 추천값이 표시되지 않습니다.
          </>
        }
      />
      <ItemStockSettingsManager />
    </div>
  );
}
