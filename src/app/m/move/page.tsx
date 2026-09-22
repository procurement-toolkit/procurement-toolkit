import { MobileHeader } from "@/components/MobileHeader";
import { getLocations } from "@/lib/queries";
import { MoveForm } from "./MoveForm";

export default async function MovePage() {
  const locations = (await getLocations()).filter((l) => l.location_type !== "external");
  return (
    <div>
      <MobileHeader title="창고이동" subtitle="공장 내 창고 간 자재 이동" back="/m" code="MOV" />
      <MoveForm locations={locations} />
    </div>
  );
}
