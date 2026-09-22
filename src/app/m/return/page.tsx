import { MobileHeader } from "@/components/MobileHeader";
import { getLocations } from "@/lib/queries";
import { ReturnForm } from "./ReturnForm";

export default async function ReturnPage() {
  const locations = (await getLocations()).filter((l) => l.location_type !== "external");
  return (
    <div>
      <MobileHeader title="반납" subtitle="사용하지 않은 자재를 창고로 반납" back="/m" code="RET" />
      <ReturnForm locations={locations} />
    </div>
  );
}
