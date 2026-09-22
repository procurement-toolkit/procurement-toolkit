"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleUserActive } from "@/lib/actions/users";
import { Switch } from "@/components/Switch";

export function ActiveToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await toggleUserActive(userId, !isActive);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Switch
        checked={isActive}
        label={pending ? "처리 중…" : isActive ? "활성" : "비활성"}
        onColor="var(--trace)"
        offBg="var(--warn-soft)"
        offBorder="var(--warn)"
        onClick={toggle}
        disabled={pending}
        ariaLabel={isActive ? "계정 비활성화하기" : "계정 활성화하기"}
      />
      {error && <span className="text-[11px] text-warn">{error}</span>}
    </div>
  );
}
