import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/actions/users";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { PisAccessToggle } from "../PisAccessToggle";

const TXN_LABEL: Record<string, string> = {
  IN: "입고",
  PRD: "생산불출",
  MOV: "창고이동",
  SHP: "택배발송",
  RET: "반납",
  ADJ: "재고실사",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function UserDetailPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const { profile, logins, activity } = await getUserDetail(id);

  if (!profile) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="usr"
        back={{ href: "/admin/users", label: "사용자 관리" }}
        title={profile.name}
        description={
          <>
            {profile.email} · {profile.departments?.name ?? "부서 없음"} ·{" "}
            {profile.role === "admin" ? "관리자" : "현장"} ·{" "}
            <span className={profile.is_active ? "text-trace" : "text-warn"}>
              {profile.is_active ? "활성" : "비활성"}
            </span>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-bg-raised px-3 py-2.5">
          <span className="text-[12.5px] text-ink-faint">PIS 접근 권한</span>
          <PisAccessToggle userId={profile.id} isAdmin={profile.role === "admin"} pisAccess={profile.pis_access} />
        </div>
        <ResetPasswordForm userId={profile.id} userName={profile.name} />
      </div>

      <div>
        <h2 className="mb-1 text-[13px] font-bold">로그인 기록 (최근 30건)</h2>
        <p className="mb-2 text-[11.5px] text-ink-faint">
          2026-09-09 업데이트 이후의 로그인부터 기록됩니다. 그 이전 로그인 이력은 조회되지 않습니다.
        </p>
        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          {logins.length === 0 ? (
            <div className="px-3 py-4 text-[13px] text-ink-faint">기록이 없습니다</div>
          ) : (
            <table className="w-full text-left text-[13px]">
              <tbody>
                {logins.map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink-soft">로그인</td>
                    <td className="px-3 py-2 text-ink-faint">{formatDateTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-[13px] font-bold">작업 이력 (최근 50건)</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          {activity.length === 0 ? (
            <div className="px-3 py-4 text-[13px] text-ink-faint">기록이 없습니다</div>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">구분</th>
                  <th className="px-3 py-2 font-semibold">일시</th>
                  <th className="px-3 py-2 font-semibold">품목</th>
                  <th className="px-3 py-2 font-semibold">수량</th>
                  <th className="px-3 py-2 font-semibold">경로</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((txn) =>
                  (txn.transaction_details ?? []).map((d, i) => (
                    <tr key={`${txn.id}-${i}`} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        <span className={`tag tag-${txn.txn_type.toLowerCase()}`}>
                          {TXN_LABEL[txn.txn_type] ?? txn.txn_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-ink-faint">{formatDateTime(txn.txn_date)}</td>
                      <td className="px-3 py-2">
                        {d.item_code}
                        {d.items?.item_name ? ` (${d.items.item_name})` : ""}
                      </td>
                      <td className="px-3 py-2 font-mono">{d.qty}</td>
                      <td className="px-3 py-2 text-ink-faint">
                        {txn.txn_type === "SHP" && txn.shipments?.recipient
                          ? `${txn.from_location_code} → ${txn.shipments.recipient}${
                              txn.shipments.carrier ? ` (${txn.shipments.carrier})` : ""
                            }`
                          : `${txn.from_location_code ?? "-"} → ${txn.to_location_code ?? "-"}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
