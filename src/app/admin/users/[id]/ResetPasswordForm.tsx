"use client";

// 2026-09-21, Kevin 요청: "사용자계정 비번좀 다시 리셋해줘... 리셋할 수
// 있는 기능이 없네. 관리자가 리셋할 수 있는 기능을 주고" — 로그인 자체를
// 못 하는(비번을 잊은) 직원을 관리자가 대신 구제하는 화면. 실수로 누르는
// 걸 막기 위해 확인 절차(펼치기 → 새 비밀번호 직접 입력 → 초기화 버튼)를
// 거치도록 2단계로 구성했다. **의도적으로 기본값을 미리 채워두지 않음** —
// 고정된 기본 비밀번호를 소스코드(클라이언트 번들, 누구나 devtools로
// 볼 수 있음)에 박아두면 그 자체로 보안 문제가 되므로, 매번 관리자가
// 직접 입력하도록 함.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetUserPassword } from "@/lib/actions/users";

export function ResetPasswordForm({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await resetUserPassword({ userId, newPassword: password });
      if (result.ok) {
        setSuccess(true);
        setPassword("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pressable btn-usr rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
      >
        비밀번호 초기화
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-bg-raised p-3">
      <div className="mb-2 text-[13px] font-bold">{userName}의 비밀번호 초기화</div>
      <p className="mb-2 text-[11.5px] text-ink-faint">
        본인 확인 없이 즉시 적용됩니다 — 새 비밀번호(6자 이상)를 입력하고 직원에게 직접 전달해주세요.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="새 비밀번호"
          className="w-40 rounded-lg border border-line bg-bg-sunken px-3 py-2 font-mono text-[14px] outline-none focus:border-line-strong"
        />
        <button
          onClick={submit}
          disabled={password.length < 6 || pending}
          className="pressable btn-usr rounded-lg px-3 py-2 text-[13px] font-semibold disabled:opacity-40"
        >
          {pending ? "초기화 중…" : "초기화"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
            setSuccess(false);
          }}
          className="pressable rounded-lg border border-line px-3 py-2 text-[13px] text-ink-faint"
        >
          취소
        </button>
      </div>
      {error && <div className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{error}</div>}
      {success && (
        <div className="mt-2 rounded-lg bg-trace-soft px-3 py-2 text-[13px] text-trace">
          비밀번호가 초기화되었습니다.
        </div>
      )}
    </div>
  );
}
