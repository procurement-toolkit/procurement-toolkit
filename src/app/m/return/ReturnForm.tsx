"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ItemPicker, type PickedItem } from "@/components/ItemPicker";
import { Stepper } from "@/components/Stepper";
import { createReturnTransaction } from "@/lib/actions/transactions";

type Location = { code: string; name: string; location_type: string };

const REASONS = ["잔여반납", "불량반납", "기타"];

export function ReturnForm({ locations }: { locations: Location[] }) {
  const [item, setItem] = useState<PickedItem | null>(null);
  const [qty, setQty] = useState(1);
  const [fromCode, setFromCode] = useState(
    locations.find((l) => l.location_type === "factory")?.code ?? locations[0]?.code ?? ""
  );
  const [toCode, setToCode] = useState(
    locations.find((l) => l.code === "M2000")?.code ?? locations[0]?.code ?? ""
  );
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ syncWarning?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onReasonChange(r: string) {
    setReason(r);
    // 불량반납은 정상 자재창고가 아니라 불량품창고(D2000)로 보내는 게 기본
    const suggested = r === "불량반납" ? "D2000" : "M2000";
    if (locations.some((l) => l.code === suggested)) setToCode(suggested);
  }

  function submit() {
    if (!item) {
      setError("자재를 선택해주세요");
      return;
    }
    if (fromCode === toCode) {
      setError("반납 출발지와 도착창고가 같을 수 없습니다");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createReturnTransaction({
        itemCode: item.item_code,
        qty,
        fromLocationCode: fromCode,
        toLocationCode: toCode,
        reason,
        note,
      });
      if (result.ok) {
        setDone({ syncWarning: result.syncWarning });
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="tag tag-ret">RET</div>
        <div className="text-[15px] font-bold">반납 등록 완료</div>
        <div className="text-[13px] text-ink-soft">
          {item?.item_code} · {qty} {item?.unit} · {fromCode} → {toCode} · {reason}
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
      <div>
        <div className="mb-1.5 text-[12px] text-ink-faint">자재 검색</div>
        <ItemPicker value={item} onChange={setItem} locationCode={fromCode} />
      </div>

      {item && (
        <>
          <div>
            <div className="mb-1.5 text-[12px] text-ink-faint">반납 수량</div>
            <Stepper value={qty} onChange={setQty} />
          </div>

          <div>
            <div className="mb-1.5 text-[12px] text-ink-faint">반납 사유</div>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onReasonChange(r)}
                  className={`rounded-full border px-3 py-1 text-[12px] ${
                    reason === r ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-soft"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1.5 text-[12px] text-ink-faint">반납 출발지</div>
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
        disabled={!item || pending}
        className="pressable mt-2 rounded-lg bg-accent py-3 font-semibold text-white transition-transform active:scale-[0.97] active:brightness-90 disabled:opacity-40 disabled:active:scale-100"
      >
        {pending ? "등록 중…" : "반납 등록"}
      </button>
    </div>
  );
}
