"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ItemCart, type CartLine } from "@/components/ItemCart";
import { createMoveTransaction } from "@/lib/actions/transactions";

type Location = { code: string; name: string; location_type: string };

export function MoveForm({ locations }: { locations: Location[] }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [fromCode, setFromCode] = useState(locations[0]?.code ?? "");
  const [toCode, setToCode] = useState(locations[1]?.code ?? locations[0]?.code ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ lines: CartLine[]; syncWarning?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (lines.length === 0) {
      setError("품목을 1개 이상 담아주세요");
      return;
    }
    if (fromCode === toCode) {
      setError("출발창고와 도착창고가 같을 수 없습니다");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createMoveTransaction({
        items: lines.map((l) => ({ itemCode: l.item_code, qty: l.qty })),
        fromLocationCode: fromCode,
        toLocationCode: toCode,
        note,
      });
      if (result.ok) {
        setDone({ lines, syncWarning: result.syncWarning });
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="tag tag-mov">MOV</div>
        <div className="text-[15px] font-bold">창고이동 등록 완료</div>
        <div className="flex flex-col gap-0.5 text-[13px] text-ink-soft">
          {done.lines.map((l) => (
            <div key={l.item_code}>
              {l.item_code} · {l.qty} {l.unit}
            </div>
          ))}
          <div className="mt-1 text-ink-faint">
            {fromCode} → {toCode} · {done.lines.length}건
          </div>
        </div>
        {done.syncWarning && (
          <div className="rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn">
            {done.syncWarning}
          </div>
        )}
        <button
          onClick={() => router.push("/m")}
          className="mt-2 w-full max-w-[200px] rounded-lg bg-trace py-2.5 font-semibold text-white"
        >
          홈으로
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <ItemCart lines={lines} onChange={setLines} addLabel="이동 목록에 담기" locationCode={fromCode} />

      {lines.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1.5 text-[12px] text-ink-faint">출발창고</div>
              <select
                value={fromCode}
                onChange={(e) => setFromCode(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none"
              >
                {locations.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code} · {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1.5 text-[12px] text-ink-faint">도착창고</div>
              <select
                value={toCode}
                onChange={(e) => setToCode(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none"
              >
                {locations.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code} · {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[12px] text-ink-faint">비고 (선택)</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none focus:border-line-strong"
            />
          </div>
        </>
      )}

      {error && <div className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{error}</div>}

      <button
        onClick={submit}
        disabled={lines.length === 0 || pending}
        className="pressable mt-2 rounded-lg bg-accent py-3 font-semibold text-white transition-transform active:scale-[0.97] active:brightness-90 disabled:opacity-40 disabled:active:scale-100"
      >
        {pending ? "등록 중…" : `창고이동 등록 (${lines.length}건)`}
      </button>
    </div>
  );
}
