import { MobileHeader } from "@/components/MobileHeader";
import { getDepartments } from "@/lib/queries";
import { IssueForm } from "./IssueForm";

export default async function IssuePage() {
  const departments = await getDepartments();
  return (
    <div>
      <MobileHeader title="생산불출" subtitle="M2000에서 생산에 바로 투입" back="/m" code="PRD" />
      <IssueForm departments={departments} />
    </div>
  );
}
