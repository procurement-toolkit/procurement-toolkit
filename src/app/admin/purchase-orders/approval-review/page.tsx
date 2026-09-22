import Link from "next/link";
import { getApprovalReviewList, type ApprovalFlag } from "@/lib/actions/approval-review";
import { AdminPageHeader } from "@/components/AdminPageHeader";

function formatNumber(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}
function formatWon(n: number) {
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}
function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}

const FLAG_CLASS: Record<ApprovalFlag["severity"], string> = {
  warn: "bg-warn-soft text-warn",
  info: "bg-trace-soft text-trace",
};

export default async function ApprovalReviewPage() {
  const { rows, limitation, historyWindowDays, generatedAt } = await getApprovalReviewList();
  const flaggedCount = rows.filter((r) => r.flags.length > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="ord"
        title="02-1. 결재검토 — 발주서 결재 전 확인"
        description={
          <>
            지금 <strong>진행중(결재 대기 중)</strong> 상태인 발주서를 대상으로, 거래처 구매이력·금액·중복 여부 등
            신뢰 가능한 헤더 단위 신호로 &quot;결재 전에 한 번 더 봐야 할 발주서&quot;를 걸러줍니다. 품목(라인) 단위
            가격/수량 자동 비교는 아래 안내대로 현재 불가능합니다 — <Link href="/admin/purchase-orders" className="underline">02 발주관리</Link>로
            돌아가기.
          </>
        }
      />

      <div className="rounded-xl border border-dashed border-line-strong bg-bg-raised px-4 py-3 text-[12px] leading-relaxed text-ink-faint">
        <span className="font-semibold text-ink-soft">이 화면의 한계: </span>
        {limitation}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-bg-raised px-4 py-3 text-[13px] text-ink-faint">
          지금 결재 대기 중(진행중)인 발주서가 없습니다.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-bg-raised px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">결재 대기 발주서</div>
              <div className="font-mono text-xl font-bold tabular-nums">{formatNumber(rows.length)}</div>
            </div>
            <div className="rounded-xl border border-line bg-bg-raised px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">확인 신호 있음</div>
              <div className="font-mono text-xl font-bold tabular-nums text-warn">{formatNumber(flaggedCount)}</div>
            </div>
            <div className="rounded-xl border border-line bg-bg-raised px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">비교 기준 기간</div>
              <div className="text-[13px] font-semibold">최근 {historyWindowDays}일 구매현황</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {rows.map((po) => (
              <div key={`${po.po_no}-${po.po_date}`} className="rounded-xl border border-line bg-bg-raised px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold">발주 {po.po_no}</span>
                    <span className="text-[12px] text-ink-faint">{formatDate(po.po_date)}</span>
                    <span className="text-[13px] text-ink-soft">{po.supplier_name ?? (po.supplier_code ? `(코드만 있음: ${po.supplier_code})` : "거래처 미지정")}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[13px]">
                    <span className="text-ink-faint">{formatNumber(po.qty)}개</span>
                    <span className="font-semibold tabular-nums">{formatWon(po.amount)}</span>
                  </div>
                </div>

                {po.item_summary && (
                  <p className="mt-1.5 truncate text-[12px] text-ink-faint" title={po.item_summary}>
                    {po.item_summary}
                  </p>
                )}

                {po.flags.length === 0 ? (
                  <p className="mt-2 text-[12px] text-ink-faint">확인해볼 만한 신호가 없습니다.</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {po.flags.map((flag) => (
                      <div key={flag.key} className="flex items-start gap-2 text-[12px]">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${FLAG_CLASS[flag.severity]}`}>
                          {flag.label}
                        </span>
                        <span className="leading-relaxed text-ink-soft">{flag.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-ink-faint">마지막 계산: {new Date(generatedAt).toLocaleString("ko-KR")}</p>
        </>
      )}
    </div>
  );
}
