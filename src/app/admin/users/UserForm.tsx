"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFieldUser } from "@/lib/actions/users";

type Department = { id: string; name: string };

export function UserForm({ departments }: { departments: Department[] }) {
  const [empNo, setEmpNo] = useState("");
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const email = empNo ? `hk${empNo}@hkk.co.kr` : "";

  function submit() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await createFieldUser({
        name,
        email,
        departmentId: departmentId || undefined,
        password,
      });
      if (result.ok) {
        setEmpNo("");
        setName("");
        setDepartmentId("");
        setPassword("");
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-line bg-bg-raised p-4">
      <div className="mb-3 text-[13px] font-bold">새 직원 추가</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-ink-faint">이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2 text-[14px] outline-none focus:border-line-strong"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-faint">사번 (4자리 숫자)</label>
          <div className="flex items-center overflow-hidden rounded-lg border border-line bg-bg-sunken focus-within:border-line-strong">
            <span className="pl-3 font-mono text-[13px] text-ink-faint">hk</span>
            <input
              value={empNo}
              onChange={(e) => setEmpNo(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0301"
              inputMode="numeric"
              className="w-full bg-transparent px-1 py-2 font-mono text-[14px] outline-none"
            />
            <span className="pr-3 font-mono text-[13px] text-ink-faint">@hkk.co.kr</span>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-faint">부서</label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2 text-[14px] outline-none focus:border-line-strong"
          >
            <option value="">선택 안 함</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-faint">초기 비밀번호 (6자 이상)</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2 text-[14px] outline-none focus:border-line-strong"
          />
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{error}</div>
      )}
      {success && (
        <div className="mt-3 rounded-lg bg-trace-soft px-3 py-2 text-[13px] text-trace">
          계정이 생성되었습니다. 초기 비밀번호를 직원에게 전달해주세요.
        </div>
      )}

      <button
        onClick={submit}
        disabled={!name || empNo.length !== 4 || password.length < 6 || pending}
        className="pressable btn-usr mt-3 w-full rounded-lg py-2.5 font-semibold transition-transform active:scale-[0.98] active:brightness-90 disabled:opacity-40 disabled:active:scale-100"
      >
        {pending ? "추가 중…" : `추가 (${email || "hk0000@hkk.co.kr"})`}
      </button>
    </div>
  );
}
