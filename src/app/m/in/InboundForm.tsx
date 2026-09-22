"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SupplierPicker, type SupplierOption } from "@/components/SupplierPicker";
import { ItemCart, type CartLine } from "@/components/ItemCart";
import { createInboundTransaction } from "@/lib/actions/transactions";

export function InboundForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [supplier, setSupplier] = useState<SupplierOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CartLine[] | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (lines.length === 0) {
      setError("품목을 1개 이상 담아주세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createInboundTransaction({
        items: lines.map((l) => ({ itemCode: l.item_code, qty: l.qty })),
        toLocationCode: "M2000",
        note,
        supplierCode: supplier?.code,
      });
      if (result.ok) {
        setDone(lines);
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="tag tag-in">IN</div>
        <div className="text-[15px] font-bold">입고 등록 완료</div>
        <div className="flex flex-col gap-0.5 text-[13px] text-ink-soft">
          {done.map((l) => (
            <div key={l.item_code}>
              {l.item_code} · {l.qty} {l.unit}
            </div>
          ))}
          <div className="mt-1 text-ink-faint">→ M2000 ({done.length}건)</div>
        </div>
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
      <ItemCart lines={lines} onChange={setLines} addLabel="입고 목록에 담기" locationCode="M2000" />

      {lines.length > 0 && (
        <>
          <div className="flex items-center justify-between rounded-lg bg-bg-sunken px-3 py-2.5 text-[13px]">
            <span className="text-ink-faint">입고창고</span>
            <span className="font-mono font-semibold">M2000</span>
          </div>

          <div>
            <div className="mb-1.5 text-[12px] text-ink-faint">거래처 (선택, 이 제출 전체에 적용)</div>
            <SupplierPicker suppliers={suppliers} value={supplier} onChange={setSupplier} />
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
        {pending ? "등록 중…" : `입고 등록 (${lines.length}건)`}
      </button>
    </div>
  );
}
