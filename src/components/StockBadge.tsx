"use client";

// 2026-09-21, Kevin 요청: "불출 하는 그 상황, 해당 현장에서 실제로 몇 개
// 남았는지 바로 매칭 해볼 수도 있고" — 불출/이동/발송/반납/입고 화면에서
// 품목코드를 고르는 즉시 그 창고의 현재 재고가 바로 떠야 한다는 요청. 기존
// /m/stock(StockLookup)이 쓰던 `/api/stock?item=` 응답을 그대로 재사용해서
// 창고별 재고를 가져오고, `locationCode`가 주어지면 그 창고의 수치만 강조
// 표시한다(ItemPicker/ItemCart가 각 폼의 출발/도착 창고를 넘겨줌).
//
// 같은 요청의 두 번째 절반: "재고가 안 잡혀 있는 제품코드는 재고를 잡아야
// 할텐데 어떻게 해야 제대로 해놓는 것일까?" — 전체 품목을 한 번에 입력할 수
// 없으니, 평소 업무(불출/이동 등)를 하다가 화면에 뜬 재고가 실제와 다르면
// 그 자리에서 "실사 등록"으로 바로잡는다. 서버(adjustStockToActualCount)가
// (실제 수량 − 계산된 재고) 차이만큼만 'ADJ' 거래를 기록하므로, 여러 사람이
// 여러 화면에서 조금씩 등록해도 누적된다 — 한 번에 다 안 해도 됨.
import { useEffect, useState } from "react";
import { adjustStockToActualCount } from "@/lib/actions/transactions";

type StockRow = { location_code: string; qty_on_hand: number };

export function StockBadge({
  itemCode,
  unit,
  locationCode,
  locationLabel,
}: {
  itemCode: string;
  unit: string;
  // 어느 창고 재고를 강조해서 보여줄지 — 폼마다 다름(불출/발송: 고정 M2000,
  // 이동/반납: 사용자가 고른 출발창고). 안 주면 전체 합계만 보여준다.
  locationCode?: string;
  locationLabel?: string;
}) {
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [actualQty, setActualQty] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; warn?: boolean } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/stock?item=${encodeURIComponent(itemCode)}`);
      const data = await res.json();
      setStock(data.stock ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCode]);

  const qtyAtLocation = locationCode
    ? stock?.find((s) => s.location_code === locationCode)?.qty_on_hand ?? 0
    : null;
  const total = stock?.reduce((sum, row) => sum + row.qty_on_hand, 0) ?? 0;
  const displayQty = locationCode ? qtyAtLocation! : total;
  const displayLabel = locationCode ? locationLabel ?? locationCode : "전체 재고";

  async function submitAdjust() {
    if (!locationCode || actualQty === "") return;
    setPending(true);
    setMessage(null);
    try {
      const result = await adjustStockToActualCount({
        itemCode,
        locationCode,
        actualQty: Number(actualQty),
      });
      if (result.ok) {
        if (result.noChange) {
          setMessage({ text: "이미 실제 수량과 일치합니다" });
        } else {
          setMessage({ text: `${result.delta > 0 ? "+" : ""}${result.delta}${unit} 보정 등록 완료` });
        }
        setAdjustOpen(false);
        setActualQty("");
        await load();
      } else {
        setMessage({ text: result.error, warn: true });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-1.5 rounded-lg bg-bg-sunken px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="text-ink-faint">{displayLabel} 재고</span>
        {loading ? (
          <span className="text-ink-faint">조회 중…</span>
        ) : (
          <span className={`font-mono font-semibold tabular-nums ${displayQty <= 0 ? "text-warn" : ""}`}>
            {displayQty} {unit}
          </span>
        )}
      </div>

      {!loading && locationCode && !adjustOpen && (
        <button
          type="button"
          onClick={() => {
            setAdjustOpen(true);
            setActualQty(String(displayQty));
          }}
          className="mt-1 text-[11px] text-accent-ink underline underline-offset-2"
        >
          실제 수량이 다른가요? 실사 등록
        </button>
      )}

      {adjustOpen && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={actualQty}
            onChange={(e) => setActualQty(e.target.value)}
            placeholder="실제 수량"
            className="w-20 rounded-md border border-line bg-bg-raised px-2 py-1.5 font-mono text-[13px] outline-none focus:border-line-strong"
          />
          <button
            type="button"
            onClick={submitAdjust}
            disabled={actualQty === "" || pending}
            className="pressable rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {pending ? "등록 중…" : "등록"}
          </button>
          <button
            type="button"
            onClick={() => setAdjustOpen(false)}
            className="pressable rounded-md border border-line px-2 py-1.5 text-[12px] text-ink-faint"
          >
            취소
          </button>
        </div>
      )}

      {message && (
        <div className={`mt-1 text-[11px] ${message.warn ? "text-warn" : "text-trace"}`}>{message.text}</div>
      )}
    </div>
  );
}
