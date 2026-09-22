"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ItemCart, type CartLine } from "@/components/ItemCart";
import { createIssueTransaction } from "@/lib/actions/transactions";

const PROCESSES = ["조립", "포장", "검사", "가공"];

export function IssueForm({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [process, setProcess] = useState(PROCESSES[0]);
  const [departmentId, setDepartmentId] = useState<string | undefined>(departments[0]?.id);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ lines: CartLine[]; syncWarning?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (lines.length === 0) {
      setError("품목을 1개 이상 담아주세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createIssueTransaction({
        items: lines.map((l) => ({ itemCode: l.item_code, qty: l.qty })),
        fromLocationCode: "M2000",
        process,
        departmentId,
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
        <div className="tag tag-prd">PRD</div>
        <div className="text-[15px] font-bold">불출 등록 완료</div>
        <div className="flex flex-col gap-0.5 text-[13px] text-ink-soft">
          {done.lines.map((l) => (
            <div key={l.item_code}>
              {l.item_code} · {l.qty} {l.unit}
            </div>
          ))}
          <div className="mt-1 text-ink-faint">
            {process} ({done.lines.length}건)
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
      <ItemCart lines={lines} onChange={setLines} addLabel="불출 목록에 담기" locationCode="M2000" />

      {lines.length > 0 && (
        <>
          <div>
            <div className="mb-1.5 text-[12px] text-ink-faint">공정 (이 제출 전체에 적용)</div>
            <div className="flex flex-wrap gap-2">
              {PROCESSES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProcess(p)}
                  className={`rounded-full border px-3 py-1 text-[12px] ${
                    process === p
                      ? "border-ink bg-ink text-bg"
                      : "border-line-strong text-ink-soft"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {departments.length > 0 && (
            <div>
              <div className="mb-1.5 text-[12px] text-ink-faint">요청 부서</div>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-bg-sunken px-3 py-2.5 text-[13px]">
            <span className="text-ink-faint">출발창고</span>
            <span className="font-mono font-semibold">M2000</span>
          </div>
        </>
      )}

      {error && <div className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{error}</div>}

      <button
        onClick={submit}
        disabled={lines.length === 0 || pending}
        className="pressable mt-2 rounded-lg bg-accent py-3 font-semibold text-white transition-transform active:scale-[0.97] active:brightness-90 disabled:opacity-40 disabled:active:scale-100"
      >
        {pending ? "등록 중…" : `불출 등록 (${lines.length}건)`}
      </button>
    </div>
  );
}
