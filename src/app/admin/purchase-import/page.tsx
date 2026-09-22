import { getPurchaseRecordCount, getRecentImportLog } from "@/lib/actions/purchase-import";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { UploadForm } from "./UploadForm";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  return status === "success" ? { text: "성공", className: "text-trace" } : { text: "오류", className: "text-warn" };
}

export default async function PurchaseImportPage() {
  const [log, recordCount] = await Promise.all([getRecentImportLog(20), getPurchaseRecordCount()]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="pur"
        title="구매현황 업로드"
        description={
          <>
            E-Count ERP의 구매관리현황 &gt; 구매현황 화면에서 내려받은 xlsx 파일을 그대로 업로드하면{" "}
            <code className="rounded bg-bg-sunken px-1">purchase_records</code>에 저장됩니다 (현재{" "}
            {recordCount !== null ? recordCount.toLocaleString("ko-KR") : "?"}건의 2023-2026년 역사 데이터가 이미 이
            방식으로 적재되어 있음). 이미 저장된 기간을 다시 업로드해도 안전합니다 — 행마다 고유한
            지문(row_hash)으로 중복을 걸러내므로 겹치는 기간은 건너뛰고 새 기간만 추가됩니다. 품목마스터(E-Count 동기화)에
            아직 없는 품목코드가 포함된 행은 저장되지 않고 별도로 안내됩니다. E-Count Open API에는 구매현황을 직접
            조회하는 엔드포인트가 없어(CLAUDE.md 2026-09-10/11 참고) 자동 연동이 아닌 수동 업로드 방식입니다.
          </>
        }
      />

      <UploadForm />

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink-soft">업로드 이력 (최근 20건)</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          <table className="w-full text-left text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 font-semibold">시각</th>
                <th className="px-3 py-2 font-semibold">파일명</th>
                <th className="px-3 py-2 font-semibold">업로드한 사람</th>
                <th className="px-3 py-2 font-semibold">상태</th>
                <th className="px-3 py-2 font-semibold text-right">읽음</th>
                <th className="px-3 py-2 font-semibold text-right">저장</th>
                <th className="px-3 py-2 font-semibold text-right">중복</th>
                <th className="px-3 py-2 font-semibold">비고</th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-ink-faint">
                    아직 업로드 기록이 없습니다.
                  </td>
                </tr>
              )}
              {log.map((row) => {
                const s = statusLabel(row.status);
                return (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink-faint">{formatDateTime(row.run_at)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2" title={row.filename}>
                      {row.filename}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{row.profiles?.name ?? "-"}</td>
                    <td className={`px-3 py-2 font-semibold ${s.className}`}>{s.text}</td>
                    <td className="px-3 py-2 text-right">{row.rows_read ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{row.rows_inserted ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{row.rows_duplicate ?? "-"}</td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-warn" title={row.error ?? ""}>
                      {row.error ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
