import { AdminPageHeader } from "@/components/AdminPageHeader";
import { ReconciliationButton } from "./ReconciliationButton";

export default function StockReconciliationPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="rec"
        title="재고 Reconciliation"
        description={
          <>
            IMMS의 재고 수량은 100% 자체 거래 원장(입고/생산불출/창고이동/택배발송/반납)에서
            계산됩니다 — 이카운트 실재고와 자동으로 맞춰보는 절차가 지금까지 없었습니다.
            아래 버튼은 이카운트 재고현황(현재고 스냅샷)과 IMMS 계산 재고를 품목별로 비교해
            차이가 있는 품목만 보여줍니다. 이카운트 쪽 API 경로는 아직 실제 인증키로
            검증되지 않았습니다 — 자세한 내용은 CLAUDE.md 참고.
          </>
        }
      />

      <ReconciliationButton />
    </div>
  );
}
