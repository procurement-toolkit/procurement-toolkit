import Link from "next/link";
import { getPurchaseOrderSummary, getPurchaseOrderList, type PurchaseOrderRow } from "@/lib/actions/purchase-orders";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Drilldown } from "@/components/Drilldown";

function formatNumber(n: number) {
  return n.toLocaleString("ko-KR");
}
function formatWon(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}
function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}
function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<PurchaseOrderRow["status"], { text: string; className: string }> = {
  in_progress: { text: "진행중", className: "bg-trace-soft text-trace" },
  closed: { text: "종결", className: "bg-bg-sunken text-ink-faint" },
  unknown: { text: "상태 미상", className: "bg-warn-soft text-warn" },
};

const TABS: { key: "all" | "in_progress" | "closed" | "unknown"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "in_progress", label: "진행중" },
  { key: "closed", label: "종결" },
  { key: "unknown", label: "상태 미상" },
];

function poDetailRows(po: PurchaseOrderRow): Record<string, unknown>[] {
  return [
    { field: "발주번호", value: po.po_no },
    { field: "발주일", value: formatDate(po.po_date) },
    { field: "거래처", value: po.supplier_name ?? (po.supplier_code ? `(코드만 있음: ${po.supplier_code})` : "미지정") },
    { field: "담당자", value: po.buyer ?? "-" },
    { field: "상태", value: STATUS_LABEL[po.status].text },
    { field: "수량 합계", value: formatNumber(po.qty) },
    // 2026-09-21, Kevin 요청(Part 3, E-Count 발주서조회 화면 대조 피드백):
    // "금액이 부가세 포함인지 별도인지 표시되어야" — 공급가액/부가세/
    // 합계(부가세포함) 세 줄로 분리해서 명확히 보여준다. vatAmount가
    // null이면(아직 이 컬럼이 채워지기 전 동기화 데이터) 그 사실을 그대로 표시.
    { field: "공급가액 (부가세 별도)", value: `${formatWon(po.amount)} (${po.currency})` },
    { field: "부가세액", value: po.vatAmount === null ? "정보 없음(다음 동기화 이후 채워짐)" : formatWon(po.vatAmount) },
    { field: "합계 (부가세포함)", value: po.vatAmount === null ? "-" : `${formatWon(po.totalAmount)} (${po.currency})` },
    { field: "요청납기일", value: formatDate(po.requested_delivery_date) },
    { field: "창고", value: po.warehouse_name ?? "-" },
    { field: "발주 내용", value: po.item_summary ?? "-" },
    { field: "이카운트 동기화 시각", value: formatDateTime(po.ecount_synced_at) },
  ];
}

const DETAIL_COLUMNS = [
  { key: "field", label: "항목" },
  { key: "value", label: "내용" },
];

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/admin/purchase-orders">) {
  const params = await searchParams;
  const statusParam = typeof params.status === "string" ? params.status : "all";
  const status = (["all", "in_progress", "closed", "unknown"] as const).includes(statusParam as never)
    ? (statusParam as "all" | "in_progress" | "closed" | "unknown")
    : "all";

  const [summary, list] = await Promise.all([
    getPurchaseOrderSummary(),
    getPurchaseOrderList({ status, limit: 200 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="ord"
        title="02. 발주관리 — 발주서 현황 (진행중 · 종결)"
        description={
          <>
            이카운트 발주서조회(GetPurchasesOrderList)로 가져온 발주서 목록입니다. 진행중(P_FLAG=1)/종결(P_FLAG=9)
            상태로 지금 살아있는 발주서와 이미 마감된 발주서를 구분해 볼 수 있습니다 — 진행중 발주서를 추적해
            공급업체의 생산·납품을 챙기는 용도입니다. 아래 목록의 <strong>금액은 공급가액(부가세 별도)</strong>이고,
            부가세·합계(부가세포함)는 각 행을 눌러 상세에서 확인할 수 있습니다. 발주서조회는{" "}
            <strong>발주서 헤더 단위</strong>로만 제공되어(품목코드/라인 상세 없음), 상세보기도 헤더 정보(발주 내용
            요약 텍스트 포함) 이상은 보여줄 수 없습니다 — E-Count 자체 화면의 <strong>전자결재일자-No.(전자결재
            번호)</strong>도 이 API 응답에는 없는 필드라 저희 쪽에 표시할 방법이 아직 없습니다(2026-09-10 API
            전수조사 결과, CLAUDE.md 참고 — 필요하면 E-Count 고객지원에 확인 요청 예정). 30분마다 자동
            동기화되며, <strong>/admin/ecount-sync</strong>에서 지금 바로 동기화하거나 마지막 동기화 이력을 확인할
            수 있습니다. 결재 대기 중인 발주서를 미리 확인해야 한다면{" "}
            <Link href="/admin/purchase-orders/approval-review" className="font-semibold underline">결재검토 화면</Link>을
            참고하세요.
          </>
        }
      />

      {summary.totalCount === 0 && (
        <div className="rounded-xl border border-line bg-bg-raised px-4 py-3 text-[13px] text-ink-faint">
          아직 동기화된 발주서가 없습니다 — /admin/ecount-sync에서 &quot;지금 동기화&quot;를 실행하면 최근 30일
          발주서를 가져옵니다.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-bg-raised px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">전체 발주서</div>
          <div className="font-mono text-xl font-bold tabular-nums">{formatNumber(summary.totalCount)}</div>
        </div>
        <div className="rounded-xl border border-line bg-bg-raised px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">진행중</div>
          <div className="font-mono text-xl font-bold tabular-nums text-trace">{formatNumber(summary.inProgressCount)}</div>
          <div className="text-[11px] text-ink-faint">{formatWon(summary.inProgressAmount)}</div>
        </div>
        <div className="rounded-xl border border-line bg-bg-raised px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">종결</div>
          <div className="font-mono text-xl font-bold tabular-nums text-ink-faint">{formatNumber(summary.closedCount)}</div>
          <div className="text-[11px] text-ink-faint">{formatWon(summary.closedAmount)}</div>
        </div>
        <div className="rounded-xl border border-line bg-bg-raised px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint">마지막 동기화</div>
          <div className="text-[13px] font-semibold">{formatDateTime(summary.latestSyncedAt)}</div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/admin/purchase-orders" : `/admin/purchase-orders?status=${t.key}`}
            className={`pressable rounded-t-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
              status === t.key ? "border-b-2 border-[var(--ord)] text-[var(--ord)]" : "text-ink-faint hover:text-ink-soft"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
        {list.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-ink-faint">조건에 맞는 발주서가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">발주번호</th>
                  <th className="px-3 py-2 font-semibold">발주일</th>
                  <th className="px-3 py-2 font-semibold">거래처</th>
                  <th className="px-3 py-2 font-semibold">담당자</th>
                  <th className="px-3 py-2 font-semibold">내용</th>
                  <th className="px-3 py-2 font-semibold text-right">수량</th>
                  <th className="px-3 py-2 font-semibold text-right">금액 (공급가액)</th>
                  <th className="px-3 py-2 font-semibold">요청납기</th>
                  <th className="px-3 py-2 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {list.map((po) => {
                  const s = STATUS_LABEL[po.status];
                  return (
                    <Drilldown
                      as="row"
                      key={`${po.po_no}-${po.po_date}`}
                      trigger={
                        <>
                          <td className="px-3 py-2 font-mono text-[12px]">
                            {po.po_no}
                            <span className="ml-1 text-ink-faint/60">›</span>
                          </td>
                          <td className="px-3 py-2 text-ink-faint">{formatDate(po.po_date)}</td>
                          <td className="px-3 py-2">{po.supplier_name ?? "미지정"}</td>
                          <td className="px-3 py-2 text-ink-faint">{po.buyer ?? "-"}</td>
                          <td className="max-w-[280px] truncate px-3 py-2 text-ink-soft" title={po.item_summary ?? undefined}>
                            {po.item_summary ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(po.qty)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatWon(po.amount)}</td>
                          <td className="px-3 py-2 text-ink-faint">{formatDate(po.requested_delivery_date)}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.className}`}>{s.text}</span>
                          </td>
                        </>
                      }
                      title={`발주서 ${po.po_no}`}
                      description={`${po.supplier_name ?? "거래처 미지정"} · ${formatDate(po.po_date)} · ${s.text}`}
                      columns={DETAIL_COLUMNS}
                      rows={poDetailRows(po)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
