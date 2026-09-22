"use client";

// 2026-09-21, Kevin 요청: "현장 작업자라도 pis로 넘어 갈 수 있는 접근권한을
// 관리자가 주거나 막을 수 있도록" — ActiveToggle.tsx와 완전히 같은 패턴
// (Switch + useTransition + router.refresh). role='admin' 계정은 이 값과
// 무관하게 항상 전체 접근이므로(proxy.ts 참고), 그 경우엔 토글을 비활성화
// 해서 "관리자는 항상 전체 접근"임을 그대로 보여준다 — 끌 수 있는 것처럼
// 보이는 게 오히려 오해를 부르기 때문.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { togglePisAccess } from "@/lib/actions/users";
import { Switch } from "@/components/Switch";

export function PisAccessToggle({
  userId,
  isAdmin,
  pisAccess,
}: {
  userId: string;
  isAdmin: boolean;
  pisAccess: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await togglePisAccess(userId, !pisAccess);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (isAdmin) {
    return <span className="text-[12px] text-ink-faint">전체 (관리자)</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <Switch
        checked={pisAccess}
        label={pending ? "처리 중…" : pisAccess ? "허용" : "차단"}
        onColor="var(--dash)"
        onClick={toggle}
        disabled={pending}
        ariaLabel={pisAccess ? "PIS 접근 권한 해제하기" : "PIS 접근 권한 부여하기"}
      />
      {error && <span className="text-[11px] text-warn">{error}</span>}
    </div>
  );
}
