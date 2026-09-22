import Link from "next/link";
import { listUsers } from "@/lib/actions/users";
import { getDepartments } from "@/lib/queries";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { UserForm } from "./UserForm";
import { ActiveToggle } from "./ActiveToggle";
import { PisAccessToggle } from "./PisAccessToggle";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function UsersPage() {
  const [users, departments] = await Promise.all([listUsers(), getDepartments()]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="usr"
        title="사용자 관리"
        description="회사 이메일(hk0000@hkk.co.kr) 형식으로 현장 직원 계정을 추가/비활성화합니다."
      />

      <UserForm departments={departments} />

      <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">이름</th>
              <th className="px-3 py-2 font-semibold">이메일</th>
              <th className="px-3 py-2 font-semibold">부서</th>
              <th className="px-3 py-2 font-semibold">권한</th>
              <th className="px-3 py-2 font-semibold">PIS 접근</th>
              <th className="px-3 py-2 font-semibold">등록일</th>
              <th className="px-3 py-2 font-semibold">상태</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-medium">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="text-trace underline underline-offset-2"
                  >
                    {u.name}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-[12px] text-ink-soft">{u.email}</td>
                <td className="px-3 py-2 text-ink-soft">{u.departments?.name ?? "-"}</td>
                <td className="px-3 py-2 text-ink-soft">
                  {u.role === "admin" ? "관리자" : "현장"}
                </td>
                <td className="px-3 py-2">
                  <PisAccessToggle userId={u.id} isAdmin={u.role === "admin"} pisAccess={u.pis_access} />
                </td>
                <td className="px-3 py-2 text-ink-faint">{formatDate(u.created_at)}</td>
                <td className="px-3 py-2">
                  <ActiveToggle userId={u.id} isActive={u.is_active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
