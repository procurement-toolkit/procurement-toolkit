// 2026-09-21, Kevin 요청("메뉴 구조 재설계 — 10 통합조회/Report") 종속 기능
// 구현. 기간·품목·업체·창고·거래유형·부서·사용자 조건은 실제로는 두 개의
// 서로 다른 테이블에 걸쳐 있다(reports.ts 파일 상단 주석 참고) — 그래서
// "구매현황 검색"(품목/업체 조건)과 "자재이동 이력 검색"(창고/거래유형/
// 부서 조건) 두 도구로 나눠 만들었다. 각각 화면 미리보기(최대 200건) +
// Excel 다운로드(최대 20,000건)를 제공한다.
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, formatWon, formatDate, EmptyNote } from "@/components/admin/dashboard-ui";
import { searchPurchaseRecords, searchTransactions, listDepartmentsForFilter } from "@/lib/actions/reports";

const TXN_TYPE_LABEL: Record<string, string> = { IN: "입고", PRD: "생산불출", MOV: "창고이동", SHP: "택배발송", RET: "반납", ADJ: "재고실사" };

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const purchaseFilter = {
    sinceIso: str("p_since") || undefined,
    untilIso: str("p_until") || undefined,
    itemQuery: str("p_item") || undefined,
    supplierQuery: str("p_supplier") || undefined,
    category: str("p_category") || undefined,
  };
  const txnFilter = {
    sinceIso: str("t_since") || undefined,
    untilIso: str("t_until") || undefined,
    txnType: (["IN", "PRD", "MOV", "SHP", "RET", "ADJ"] as const).includes(str("t_type") as never)
      ? (str("t_type") as "IN" | "PRD" | "MOV" | "SHP" | "RET" | "ADJ")
      : undefined,
    locationCode: str("t_location") || undefined,
    departmentId: str("t_department") || undefined,
    itemQuery: str("t_item") || undefined,
  };

  const hasPurchaseQuery = Object.values(purchaseFilter).some(Boolean);
  const hasTxnQuery = Object.values(txnFilter).some(Boolean);

  const [purchaseResult, txnResult, departments] = await Promise.all([
    hasPurchaseQuery ? searchPurchaseRecords(purchaseFilter) : Promise.resolve({ rows: [], truncated: false }),
    hasTxnQuery ? searchTransactions(txnFilter) : Promise.resolve({ rows: [], truncated: false }),
    listDepartmentsForFilter(),
  ]);

  const purchaseExportUrl = `/api/export/purchase-records${qs({
    since: purchaseFilter.sinceIso,
    until: purchaseFilter.untilIso,
    item: purchaseFilter.itemQuery,
    supplier: purchaseFilter.supplierQuery,
    category: purchaseFilter.category,
  })}`;
  const txnExportUrl = `/api/export/transactions${qs({
    since: txnFilter.sinceIso,
    until: txnFilter.untilIso,
    txnType: txnFilter.txnType,
    location: txnFilter.locationCode,
    department: txnFilter.departmentId,
    item: txnFilter.itemQuery,
  })}`;

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        code="rpt"
        title="10. 통합조회 / Report"
        description="기간·품목·업체·창고·거래유형·부서 조건으로 검색하고 Excel로 출력합니다. 업체 조건은 구매현황(이카운트 매입 데이터)에, 창고·거래유형·부서 조건은 자재이동(IMMS 현장 기록)에 있어 두 도구로 나눠뒀습니다."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-[14px] font-bold text-ink">구매현황 검색 (purchase_records)</h2>
        <form className="flex flex-wrap items-end gap-2" action="/admin/reports">
          <input type="hidden" name="t_since" value={txnFilter.sinceIso ?? ""} />
          <Field label="시작일"><input type="date" name="p_since" defaultValue={purchaseFilter.sinceIso} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" /></Field>
          <Field label="종료일"><input type="date" name="p_until" defaultValue={purchaseFilter.untilIso} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" /></Field>
          <Field label="품목(코드/명)"><input type="text" name="p_item" defaultValue={purchaseFilter.itemQuery} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" /></Field>
          <Field label="거래처"><input type="text" name="p_supplier" defaultValue={purchaseFilter.supplierQuery} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" /></Field>
          <Field label="카테고리"><input type="text" name="p_category" defaultValue={purchaseFilter.category} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" placeholder="상품/부재료/제품..." /></Field>
          <button type="submit" className="pressable rounded-lg bg-[var(--rpt)] px-4 py-2 text-[13px] font-semibold text-white">검색</button>
          {hasPurchaseQuery && (
            <a href={purchaseExportUrl} className="pressable rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-ink-soft">
              Excel 다운로드
            </a>
          )}
        </form>

        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          {!hasPurchaseQuery ? (
            <EmptyNote>검색 조건을 입력하면 결과가 여기에 나타납니다.</EmptyNote>
          ) : purchaseResult.rows.length === 0 ? (
            <EmptyNote>조건에 맞는 구매현황 전표가 없습니다.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="px-3 py-2 font-semibold">구매일</th>
                    <th className="px-3 py-2 font-semibold">거래처</th>
                    <th className="px-3 py-2 font-semibold">품목</th>
                    <th className="px-3 py-2 font-semibold text-right">수량</th>
                    <th className="px-3 py-2 font-semibold text-right">단가</th>
                    <th className="px-3 py-2 font-semibold text-right">공급가액</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseResult.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-ink-faint">{formatDate(r.purchase_date)}</td>
                      <td className="px-3 py-2">{r.supplier_name || "미지정"}</td>
                      <td className="px-3 py-2">{r.item_name} <span className="text-ink-faint/70">({r.item_code})</span></td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.qty)}</td>
                      <td className="px-3 py-2 text-right">{formatWon(r.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatWon(r.supply_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-[11px] text-ink-faint">
                화면 미리보기는 최신 {purchaseResult.rows.length}건까지만 표시합니다{purchaseResult.truncated ? " (더 있음)" : ""} — 전체 결과는 Excel 다운로드를 이용하세요(최대 20,000건).
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[14px] font-bold text-ink">자재이동 이력 검색 (IMMS transactions)</h2>
        <form className="flex flex-wrap items-end gap-2" action="/admin/reports">
          <input type="hidden" name="p_since" value={purchaseFilter.sinceIso ?? ""} />
          <Field label="시작일"><input type="date" name="t_since" defaultValue={txnFilter.sinceIso} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" /></Field>
          <Field label="종료일"><input type="date" name="t_until" defaultValue={txnFilter.untilIso} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" /></Field>
          <Field label="거래유형">
            <select name="t_type" defaultValue={txnFilter.txnType ?? ""} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]">
              <option value="">전체</option>
              {Object.entries(TXN_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="창고코드"><input type="text" name="t_location" defaultValue={txnFilter.locationCode} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" placeholder="2000, M2000..." /></Field>
          <Field label="부서">
            <select name="t_department" defaultValue={txnFilter.departmentId ?? ""} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]">
              <option value="">전체</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="품목(코드/명)"><input type="text" name="t_item" defaultValue={txnFilter.itemQuery} className="rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--rpt)]" /></Field>
          <button type="submit" className="pressable rounded-lg bg-[var(--rpt)] px-4 py-2 text-[13px] font-semibold text-white">검색</button>
          {hasTxnQuery && (
            <a href={txnExportUrl} className="pressable rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-ink-soft">
              Excel 다운로드
            </a>
          )}
        </form>

        <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
          {!hasTxnQuery ? (
            <EmptyNote>검색 조건을 입력하면 결과가 여기에 나타납니다.</EmptyNote>
          ) : txnResult.rows.length === 0 ? (
            <EmptyNote>조건에 맞는 자재이동 기록이 없습니다.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="px-3 py-2 font-semibold">일자</th>
                    <th className="px-3 py-2 font-semibold">구분</th>
                    <th className="px-3 py-2 font-semibold">경로</th>
                    <th className="px-3 py-2 font-semibold">부서/처리자</th>
                    <th className="px-3 py-2 font-semibold">품목</th>
                  </tr>
                </thead>
                <tbody>
                  {txnResult.rows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-ink-faint">{formatDate(r.txn_date)}</td>
                      <td className="px-3 py-2">{TXN_TYPE_LABEL[r.txn_type] ?? r.txn_type}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-ink-faint">
                        {r.from_location_code ?? "-"} → {r.to_location_code ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-ink-faint">{r.department_name ?? "-"} / {r.processed_by_name ?? "-"}</td>
                      <td className="px-3 py-2">{r.items.map((i) => `${i.item_name}(${formatNumber(i.qty)})`).join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-[11px] text-ink-faint">
                화면 미리보기는 최신 {txnResult.rows.length}건까지만 표시합니다{txnResult.truncated ? " (더 있음)" : ""} — 전체 결과는 Excel 다운로드를 이용하세요(최대 20,000건).
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-faint">
      {label}
      {children}
    </label>
  );
}
