"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importPurchaseRecords, type PurchaseImportResult } from "@/lib/actions/purchase-import";

function formatNumber(n: number | null) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("ko-KR");
}

export function UploadForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PurchaseImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const r = await importPurchaseRecords(formData);
      setResult(r);
      if (r.ok) {
        formRef.current?.reset();
        setFileName(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={onSubmit} className="flex flex-wrap items-center gap-3">
        <label className="pressable flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-bg-raised px-3.5 py-2 text-[13px] text-ink-soft hover:bg-bg-sunken active:bg-bg-sunken">
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          파일 선택
        </label>
        <span className="text-[12px] text-ink-faint">{fileName ?? "선택된 파일 없음"}</span>
        <button
          type="submit"
          disabled={pending || !fileName}
          className="pressable btn-pur rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-transform active:scale-[0.97] active:brightness-90 disabled:opacity-50 disabled:active:scale-100"
        >
          {pending ? "업로드 중…" : "업로드"}
        </button>
      </form>

      {result && !result.ok && <p className="text-[12px] text-warn">오류: {result.error}</p>}

      {result && result.ok && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg-raised p-3.5">
          <p className="text-[13px] font-semibold text-trace">
            완료 — {result.filename}에서 데이터 행 {formatNumber(result.totalDataRowsScanned)}건 중{" "}
            {formatNumber(result.insertedCount)}건 신규 저장
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-ink-soft sm:grid-cols-3">
            <span>이미 저장된 중복: {formatNumber(result.duplicateAgainstExistingCount)}건</span>
            <span>파일 내 중복: {formatNumber(result.duplicatesWithinFile)}건</span>
            <span>소계/합계 행 제외: {formatNumber(result.skippedNoItemCode)}건</span>
            <span>날짜 형식 오류: {formatNumber(result.parseFailureCount)}건</span>
            <span>미등록 품목코드: {formatNumber(result.unknownItemCodeCount)}건</span>
            <span>저장 후 전체 행 수: {formatNumber(result.newTotalRowCount)}건</span>
          </div>

          {result.unknownItemCodeCount > 0 && (
            <div className="mt-1">
              <p className="text-[12px] font-semibold text-warn">
                미등록 품목코드 {result.unknownItemCodeCount}건은 저장되지 않았습니다 (품목마스터에 없는 코드 —
                E-Count 동기화 후 다시 업로드하면 저장됩니다).
              </p>
              <ul className="mt-1 max-h-32 overflow-y-auto text-[11px] text-ink-faint">
                {result.unknownItemCodeSample.map((it) => (
                  <li key={it.item_code} className="font-mono">
                    {it.item_code} — {it.item_name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.parseFailureCount > 0 && (
            <div className="mt-1">
              <p className="text-[12px] font-semibold text-warn">
                날짜 형식이 예상과 달라 건너뛴 행 {result.parseFailureCount}건
              </p>
              <ul className="mt-1 max-h-32 overflow-y-auto text-[11px] text-ink-faint">
                {result.parseFailureSample.map((f, i) => (
                  <li key={i}>
                    {f.excelRow}행: {f.raw ?? "(비어있음)"} — {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
