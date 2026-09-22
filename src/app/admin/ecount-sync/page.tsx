import { getRecentPurchaseOrders, getRecentPriceSnapshots, getRecentSyncLog } from "@/lib/actions/ecount-sync";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { SyncButton } from "./SyncButton";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  if (status === "success") return { text: "성공", className: "text-trace" };
  if (status === "skipped") return { text: "설정 없음", className: "text-ink-faint" };
  return { text: "오류", className: "text-warn" };
}

function jobLabel(job: string) {
  if (job === "transfer_flush") return "창고이동 전송 (10분 주기)";
  if (job === "item_master_pull") return "품목/발주서 pull (30분 주기)";
  return job;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatNumber(n: number | null) {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("ko-KR");
}

export default async function EcountSyncPage() {
  const [purchaseOrders, priceSnapshots, syncLog] = await Promise.all([
    getRecentPurchaseOrders(30),
    getRecentPriceSnapshots(30),
    getRecentSyncLog(20),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="sync"
        title="E-Count 데이터 동기화"
        description={
          <>
            품목조회(품목 마스터 생성/갱신 + 단가/MOQ/리드타임)와 발주서조회(발주서 헤더)를
            이카운트에서 가져옵니다. 품목조회는 IMMS에 아직 없는 품목도 새로 등록합니다 —
            이카운트 품목마스터가 곧 IMMS/PIS의 품목 기준입니다. 발주서조회는 품목코드 없이
            발주서 단위(합계)로만 제공되고, 거래처조회/매입조회 API는 이카운트에 존재하지
            않습니다 — 자세한 내용은 CLAUDE.md 참고. 이제 30분마다 자동으로도 실행됩니다 —
            아래 버튼은 그 사이에 지금 바로 한 번 더 실행하고 싶을 때만 누르면 됩니다.
          </>
        }
      />

      <SyncButton />

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink-soft">자동 실행 이력</h2>
        <p className="mb-2 text-[12px] text-ink-faint">
          예약 작업(GitHub Actions) 두 개 — 창고이동 전송(10분 주기)과 품목/발주서 pull(30분
          주기) — 의 매 실행 기록입니다. &quot;성공&quot;은 실행 자체가 끝까지 도달했다는
          뜻이며 — 실행 자체가 안 됐는데 겉보기엔 성공으로 보였던 사고(2026-09-10, CLAUDE.md
          참고)가 있었던 뒤로, 워크플로우의 초록 체크 표시만 믿지 않기 위해 만들었습니다.
        </p>
        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          <table className="w-full text-left text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 font-semibold">시각</th>
                <th className="px-3 py-2 font-semibold">작업</th>
                <th className="px-3 py-2 font-semibold">상태</th>
                <th className="px-3 py-2 font-semibold text-right">시도</th>
                <th className="px-3 py-2 font-semibold text-right">성공</th>
                <th className="px-3 py-2 font-semibold text-right">실패</th>
                <th className="px-3 py-2 font-semibold">비고</th>
              </tr>
            </thead>
            <tbody>
              {syncLog.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-ink-faint">
                    아직 기록된 실행이 없습니다. (이 표는 2026-09-11 이후 실행부터 기록됩니다)
                  </td>
                </tr>
              )}
              {syncLog.map((row) => {
                const s = statusLabel(row.status);
                return (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink-faint">{formatDateTime(row.run_at)}</td>
                    <td className="px-3 py-2 text-ink-soft">{jobLabel(row.job)}</td>
                    <td className={`px-3 py-2 font-semibold ${s.className}`}>{s.text}</td>
                    <td className="px-3 py-2 text-right">{row.attempted ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{row.synced ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{row.failed ?? "-"}</td>
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

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink-soft">최근 발주서 (30건)</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 font-semibold">발주번호</th>
                <th className="px-3 py-2 font-semibold">일자</th>
                <th className="px-3 py-2 font-semibold">거래처</th>
                <th className="px-3 py-2 font-semibold">내용</th>
                <th className="px-3 py-2 font-semibold text-right">수량합계</th>
                <th className="px-3 py-2 font-semibold text-right">금액합계</th>
                <th className="px-3 py-2 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-ink-faint">
                    아직 동기화된 발주서가 없습니다.
                  </td>
                </tr>
              )}
              {purchaseOrders.map((po) => (
                <tr key={`${po.po_no}-${po.po_date}`} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-mono text-[12px]">{po.po_no}</td>
                  <td className="px-3 py-2 text-ink-faint">{formatDate(po.po_date)}</td>
                  <td className="px-3 py-2">{po.suppliers?.name ?? po.supplier_code ?? "-"}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-ink-soft" title={po.item_summary ?? ""}>
                    {po.item_summary ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-right">{formatNumber(po.qty)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(po.amount)}</td>
                  <td className="px-3 py-2 text-ink-soft">
                    {po.status === "closed" ? "종결" : po.status === "in_progress" ? "진행중" : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink-soft">최근 단가 스냅샷 (30건)</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 font-semibold">품목코드</th>
                <th className="px-3 py-2 font-semibold">품목명</th>
                <th className="px-3 py-2 font-semibold">기준일</th>
                <th className="px-3 py-2 font-semibold text-right">입고단가</th>
              </tr>
            </thead>
            <tbody>
              {priceSnapshots.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-ink-faint">
                    아직 동기화된 단가 스냅샷이 없습니다.
                  </td>
                </tr>
              )}
              {priceSnapshots.map((p, i) => (
                <tr key={`${p.item_code}-${p.effective_date}-${i}`} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-mono text-[12px]">{p.item_code}</td>
                  <td className="px-3 py-2">{p.items?.item_name ?? "-"}</td>
                  <td className="px-3 py-2 text-ink-faint">{formatDate(p.effective_date)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(p.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
