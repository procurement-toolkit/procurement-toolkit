"use client";

import { useState, useTransition } from "react";
import { runStockReconciliation, type StockReconciliationResult } from "@/lib/actions/stock-reconciliation";

function formatNumber(n: number) {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export function ReconciliationButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<StockReconciliationResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await runStockReconciliation();
      setResult(r);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={run}
        disabled={pending}
        className="pressable btn-rec w-fit rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-transform active:scale-[0.97] active:brightness-90 disabled:opacity-50 disabled:active:scale-100"
      >
        {pending ? "비교 중…" : "지금 재고 비교"}
      </button>

      {result && !result.ok && result.skipped && (
        <p className="text-[12px] text-ink-faint">
          E-Count 연동 설정(ECOUNT_* 환경변수)이 아직 없어 건너뛰었습니다.
        </p>
      )}
      {result && !result.ok && !result.skipped && (
        <p className="text-[12px] text-warn">오류: {result.error}</p>
      )}

      {result && result.ok && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-ink-faint">
            {new Date(result.checkedAt).toLocaleString("ko-KR")} 기준 · 총 {result.itemsCompared}개 품목 비교
          </p>

          {result.discrepancies.length === 0 ? (
            <p className="text-[13px] text-trace">불일치 없음 — 이카운트 재고와 IMMS 재고가 정확히 일치합니다.</p>
          ) : (
            <>
              <p className="text-[12px] text-warn">
                불일치 {result.discrepancies.length}건 발견 (절대값 큰 순)
              </p>
              <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
                <table className="w-full text-left text-[13px] tabular-nums">
                  <thead>
                    <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2 font-semibold">품목코드</th>
                      <th className="px-3 py-2 font-semibold">품목명</th>
                      <th className="px-3 py-2 font-semibold text-right">이카운트</th>
                      <th className="px-3 py-2 font-semibold text-right">IMMS</th>
                      <th className="px-3 py-2 font-semibold text-right">차이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.discrepancies.slice(0, 200).map((d) => (
                      <tr key={d.item_code} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 font-mono text-[12px]">{d.item_code}</td>
                        <td className="px-3 py-2">{d.item_name ?? "-"}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(d.ecount_qty)}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(d.imms_qty)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${d.diff > 0 ? "text-warn" : "text-accent-ink"}`}>
                          {d.diff > 0 ? "+" : ""}
                          {formatNumber(d.diff)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.discrepancies.length > 200 && (
                <p className="text-[12px] text-ink-faint">상위 200건만 표시했습니다.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
