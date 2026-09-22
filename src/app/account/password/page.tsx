"use client";

import { useActionState } from "react";
import Link from "next/link";
import Image from "next/image";
import { changePassword } from "@/lib/actions/auth";

export default function PasswordPage() {
  const [state, formAction, pending] = useActionState(changePassword, undefined);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4">
      <div className="rounded-2xl border border-line bg-bg-raised p-7 shadow-sm">
        <Image src="/hk-mark.png" alt="HK" width={72} height={31} className="mb-3 h-8 w-auto" />
        <h1 className="mb-6 text-xl font-bold">비밀번호 변경</h1>

        <form action={formAction} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-faint">새 비밀번호 (6자 이상)</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none focus:border-line-strong"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-faint">비밀번호 확인</label>
            <input
              type="password"
              name="confirm"
              required
              minLength={6}
              className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none focus:border-line-strong"
            />
          </div>

          {state?.error && (
            <div className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
              {state.error}
            </div>
          )}
          {state?.success && (
            <div className="rounded-lg bg-trace-soft px-3 py-2 text-[13px] text-trace">
              비밀번호가 변경되었습니다
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="pressable mt-2 rounded-lg bg-accent py-2.5 font-semibold text-white transition-transform active:scale-[0.97] active:brightness-90 disabled:opacity-60 disabled:active:scale-100"
          >
            {pending ? "변경 중…" : "변경"}
          </button>
        </form>

        <ul className="mt-4 list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-ink-faint">
          <li>비밀번호는 6자 이상으로 설정해주세요.</li>
          <li>현재 사용 중인 비밀번호와 동일하게는 변경할 수 없습니다.</li>
          <li>변경 후에는 자동으로 로그아웃되지 않으니, 다음 로그인부터 새 비밀번호를 사용해주세요.</li>
        </ul>

        <Link
          href="/m"
          className="pressable mt-4 block rounded px-1 py-0.5 text-center text-[12px] text-trace underline underline-offset-2 active:bg-trace-soft"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
