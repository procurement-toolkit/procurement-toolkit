"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runEcountPull, type EcountSyncResult } from "@/lib/actions/ecount-sync";

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EcountSyncResult | null>(null);
  const router = useRouter();

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await runEcountPull(30);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={pending}
        className="pressable btn-sync w-fit rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-transform active:scale-[0.97] active:brightness-90 disabled:opacity-50 disabled:active:scale-100"
      >
        {pending ? "동기화 중…" : "지금 동기화 (최근 30일)"}
      </button>

      {result && result.ok && (
        <p className="text-[12px] text-trace">
          완료 — 품목 {result.itemsSynced}건 동기화, 단가 스냅샷 {result.priceSnapshotsWritten}건,
          거래처 {result.suppliersUpserted}건, 발주서 {result.purchaseOrdersUpserted}건 저장
        </p>
      )}
      {result && !result.ok && result.skipped && (
        <p className="text-[12px] text-ink-faint">
          E-Count 연동 설정(ECOUNT_* 환경변수)이 아직 없어 건너뛰었습니다.
        </p>
      )}
      {result && !result.ok && !result.skipped && (
        <p className="text-[12px] text-warn">오류: {result.error}</p>
      )}
    </div>
  );
}
