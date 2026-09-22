// 03 품목분석 상세 — 품목 하나의 통합 뷰. 요약 KPI + 탭(구매이력/가격이력/
// 재고이력/공급업체)은 기존 02 발주관리 페이지의 상태 탭과 동일하게
// ?tab= 쿼리파라미터 + <Link>로 구현한다(클라이언트 컴포넌트/상태 없이
// 서버 컴포넌트만으로 동작 — 이 프로젝트의 기존 패턴을 그대로 따름).
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getItemDetail,
  getItemPriceHistory,
  getItemStockLedger,
  getItemSuppliers,
  getPurchaseRecordDetail,
} from "@/lib/actions/pis-dashboard";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, formatWon, formatDate, KpiTile, EmptyNote } from "@/components/admin/dashboard-ui";

const TABS = [
  { key: "purchases", label: "구매이력" },
  { key: "price", label: "가격이력" },
  { key: "stock", label: "재고이력" },
  { key: "suppliers", label: "공급업체" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function ItemDetailPage({ params, searchParams }: PageProps<"/admin/item-analysis/[item_code]">) {
  const { item_code } = await params;
  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : "purchases";
  const tab: TabKey = (TABS.find((t) => t.key === tabParam)?.key ?? "purchases") as TabKey;

  const itemCode = decodeURIComponent(item_code);
  const result = await getItemDetail(itemCode);
  if (!result.found) notFound();
  const s = result.summary;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="sku"
        title={`${s.item_name} (${s.item_code})`}
        description={
          <>
            {s.item_category ?? "미분류"} · {s.spec ?? "규격 미등록"} · {s.unit ?? "단위 미등록"}
            {s.isKeyItem && <span className="ml-2 rounded-full bg-[var(--sku-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--sku)]">핵심품목</span>}
            {" — "}
            <Link href="/admin/item-analysis" className="underline">
              품목 검색으로 돌아가기
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="최근 12개월 구매금액" value={formatWon(s.last12moAmount)} sub={`${formatNumber(s.last12moPurchaseCount)}건`} />
        <KpiTile label="최근 12개월 구매수량" value={formatNumber(s.last12moQty)} />
        <KpiTile
          label="최근단가"
          value={s.latestPrice === null ? "-" : formatWon(s.latestPrice)}
          sub={s.latestPriceDate ? `${formatDate(s.latestPriceDate)} 기준` : undefined}
        />
        <KpiTile label="현재고" value={s.qtyOnHand === null ? "-" : formatNumber(s.qtyOnHand)} />
        <KpiTile label="월평균 사용량" value={formatNumber(s.avgMonthlyUsage)} sub="최근 90일 출고 기준" />
        <KpiTile label="재고 커버리지" value={s.coverageMonths === null ? "-" : `${s.coverageMonths}개월`} />
        <KpiTile label="공급업체 수" value={formatNumber(s.supplierCount)} sub="전체 구매이력 기준" />
        <KpiTile
          label="Lead Time / MOQ"
          value={s.leadTimeDays === null ? "-" : `${s.leadTimeDays}일`}
          sub={s.moq === null ? "MOQ 미등록" : `MOQ ${formatNumber(s.moq)}`}
        />
      </div>

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/item-analysis/${encodeURIComponent(s.item_code)}?tab=${t.key}`}
            className={`pressable rounded-t-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
              tab === t.key ? "border-b-2 border-[var(--sku)] text-[var(--sku)]" : "text-ink-faint hover:text-ink-soft"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "purchases" && <PurchaseHistoryTab itemCode={s.item_code} />}
      {tab === "price" && <PriceHistoryTab itemCode={s.item_code} />}
      {tab === "stock" && <StockLedgerTab itemCode={s.item_code} />}
      {tab === "suppliers" && <SuppliersTab itemCode={s.item_code} />}
    </div>
  );
}

async function PurchaseHistoryTab({ itemCode }: { itemCode: string }) {
  const rows = await getPurchaseRecordDetail({ itemCode, limit: 200 });
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
      {rows.length === 0 ? (
        <EmptyNote>이 품목의 구매현황 전표가 없습니다.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 font-semibold">구매일</th>
                <th className="px-3 py-2 font-semibold">거래처</th>
                <th className="px-3 py-2 font-semibold text-right">수량</th>
                <th className="px-3 py-2 font-semibold text-right">단가</th>
                <th className="px-3 py-2 font-semibold text-right">공급가액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink-faint">{formatDate(r.purchase_date)}</td>
                  <td className="px-3 py-2">{r.supplier_name || "미지정"}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.qty)}</td>
                  <td className="px-3 py-2 text-right">{formatWon(r.unit_price)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatWon(r.supply_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-ink-faint">최신 {rows.length}건까지만 표시합니다.</p>
        </div>
      )}
    </div>
  );
}

async function PriceHistoryTab({ itemCode }: { itemCode: string }) {
  const rows = await getItemPriceHistory(itemCode);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
      {rows.length === 0 ? (
        <EmptyNote>이 품목의 단가 스냅샷 기록이 없습니다(price_history) — 이카운트 동기화 이후 쌓입니다.</EmptyNote>
      ) : (
        <table className="w-full text-left text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">기준일</th>
              <th className="px-3 py-2 font-semibold">출처</th>
              <th className="px-3 py-2 font-semibold text-right">단가</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-ink-faint">{formatDate(r.effective_date)}</td>
                <td className="px-3 py-2 text-ink-faint">{r.source === "item_master" ? "이카운트 등록단가" : r.source}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatWon(r.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function StockLedgerTab({ itemCode }: { itemCode: string }) {
  const rows = await getItemStockLedger(itemCode);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
      {rows.length === 0 ? (
        <EmptyNote>이 품목의 IMMS 재고 거래 이력이 없습니다.</EmptyNote>
      ) : (
        <table className="w-full text-left text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">일자</th>
              <th className="px-3 py-2 font-semibold">창고/위치</th>
              <th className="px-3 py-2 font-semibold text-right">수량 변화</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-ink-faint">{formatDate(r.txn_date)}</td>
                <td className="px-3 py-2">{r.location_code ?? "-"}</td>
                <td className={`px-3 py-2 text-right font-semibold ${(r.delta ?? 0) > 0 ? "text-accent-ink" : (r.delta ?? 0) < 0 ? "text-warn" : "text-ink-faint"}`}>
                  {r.delta === null ? "-" : r.delta > 0 ? `+${formatNumber(r.delta)}` : formatNumber(r.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function SuppliersTab({ itemCode }: { itemCode: string }) {
  const rows = await getItemSuppliers(itemCode);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
      {rows.length === 0 ? (
        <EmptyNote>이 품목을 구매한 거래처 이력이 없습니다.</EmptyNote>
      ) : (
        <table className="w-full text-left text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">거래처</th>
              <th className="px-3 py-2 font-semibold text-right">구매 건수</th>
              <th className="px-3 py-2 font-semibold text-right">구매 수량</th>
              <th className="px-3 py-2 font-semibold text-right">구매금액</th>
              <th className="px-3 py-2 font-semibold">최근 구매일</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.supplier_name} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{r.supplier_name}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.purchaseCount)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.qty)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatWon(r.amount)}</td>
                <td className="px-3 py-2 text-ink-faint">{formatDate(r.lastPurchaseDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 1 && (
        <p className="border-t border-line px-3 py-2 text-[11px] text-ink-faint">
          2곳 이상 거래처에서 구매한 품목입니다 — 06 가격분석의 &quot;업체별 가격차이&quot;에서 절감 기회를 확인할 수 있습니다.
        </p>
      )}
    </div>
  );
}
