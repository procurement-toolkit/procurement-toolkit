import { MobileHeader } from "@/components/MobileHeader";
import { ShipForm } from "./ShipForm";

export default function ShipPage() {
  return (
    <div>
      <MobileHeader title="택배발송" subtitle="M2000에서 외부로 택배 발송" back="/m" code="SHP" />
      <ShipForm />
    </div>
  );
}
