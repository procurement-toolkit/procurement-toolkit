import { MobileHeader } from "@/components/MobileHeader";
import { StockLookup } from "./StockLookup";

export default function StockPage() {
  return (
    <div>
      <MobileHeader title="재고조회" subtitle="품목별 창고 재고 확인" back="/m" code="QTY" />
      <StockLookup />
    </div>
  );
}
