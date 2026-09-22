"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { signIn } from "@/lib/actions/auth";

function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, undefined);
  const searchParams = useSearchParams();
  const deactivated = searchParams.get("deactivated") === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-bg-raised p-7 shadow-sm">
        <Image src="/hk-mark.png" alt="HK" width={72} height={31} className="mb-3 h-8 w-auto" priority />
        <h1 className="mb-6 text-xl font-bold">자재관리 시스템 로그인</h1>

        <form action={formAction} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-faint">이메일</label>
            <input
              type="email"
              name="email"
              required
              className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none focus:border-line-strong"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-faint">비밀번호</label>
            <input
              type="password"
              name="password"
              required
              className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none focus:border-line-strong"
            />
          </div>

          {(state?.error || deactivated) && (
            <div className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
              {state?.error ?? "비활성화된 계정입니다. 관리자에게 문의하세요"}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-lg bg-accent py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {pending ? "로그인 중…" : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
