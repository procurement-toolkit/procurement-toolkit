import { MobileHeader } from "@/components/MobileHeader";
import { getSuppliers } from "@/lib/queries";
import { InboundForm } from "./InboundForm";

export default async function InboundPage() {
  const suppliers = await getSuppliers();
  return (
    <div>
      <MobileHeader title="입고" subtitle="구매·외주 자재가 M2000으로 들어올 때" back="/m" code="IN" />
      <InboundForm suppliers={suppliers} />
    </div>
  );
}
