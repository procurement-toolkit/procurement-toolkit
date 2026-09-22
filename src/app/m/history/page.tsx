import { MobileHeader } from "@/components/MobileHeader";
import { getRecentTransactions } from "@/lib/queries";

const TAG_CLASS: Record<string, string> = {
  IN: "tag-in",
  PRD: "tag-prd",
  MOV: "tag-mov",
  SHP: "tag-shp",
  RET: "tag-ret",
  // 2026-09-21: 재고 실사/보정 거래(migration 0015) — 진짜 입출고가 아니라
  // "계산된 재고를 실제 수량에 맞춘 보정"이므로 별도 태그로 구분.
  ADJ: "tag-adj",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HistoryPage() {
  const transactions = await getRecentTransactions(50);

  return (
    <div>
      <MobileHeader title="이력조회" subtitle="최근 입출고 내역" back="/m" code="LOG" />

      <div className="flex flex-col gap-2 p-4">
        {transactions.length === 0 && (
          <div className="py-12 text-center text-[13px] text-ink-faint">
            등록된 이력이 없습니다
          </div>
        )}

        {transactions.map((txn) => {
          const details = txn.transaction_details ?? [];
          const processedByName = Array.isArray(txn.processed_by)
            ? txn.processed_by[0]?.name
            : (txn.processed_by as { name: string } | null)?.name;
          const shipment = Array.isArray(txn.shipments)
            ? txn.shipments[0]
            : (txn.shipments as { recipient: string | null; carrier: string | null } | null);

          return (
            <div
              key={txn.id}
              className="rounded-lg border border-line bg-bg-raised px-3 py-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`tag ${TAG_CLASS[txn.txn_type] ?? "tag-log"}`}>
                    {txn.txn_type}
                  </span>
                  <span className="font-mono text-[11px] text-ink-faint">
                    {txn.txn_type === "SHP" && shipment
                      ? `${txn.from_location_code} → ${shipment.recipient}${
                          shipment.carrier ? ` (${shipment.carrier})` : ""
                        }`
                      : `${txn.from_location_code ?? "—"}${
                          txn.to_location_code ? ` → ${txn.to_location_code}` : ""
                        }`}
                  </span>
                </div>
                <span className="text-[11px] text-ink-faint">{formatDate(txn.txn_date)}</span>
              </div>

              {details.map((d, i) => {
                const itemName = Array.isArray(d.items)
                  ? d.items[0]?.item_name
                  : (d.items as { item_name: string } | null)?.item_name;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[13px]"
                  >
                    <span>
                      <span className="font-mono text-ink-soft">{d.item_code}</span>
                      {itemName ? <span className="text-ink-faint"> · {itemName}</span> : null}
                      {d.process ? (
                        <span className="text-ink-faint"> · {d.process}</span>
                      ) : null}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">{d.qty}</span>
                  </div>
                );
              })}

              <div className="mt-1 flex items-center justify-between text-[11px] text-ink-faint">
                <span>{processedByName ?? "—"}</span>
                {(txn.reason || txn.note) && <span>{txn.reason || txn.note}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
