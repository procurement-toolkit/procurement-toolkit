// 2026-09-21, Kevin 요청("메뉴 구조 재설계 — 03 품목분석: 무엇을 얼마나
// 사고 있는가?") 종속 기능 구현. 검색창(품목코드/품목명)으로 품목을 찾고,
// 클릭하면 품목 하나의 통합 상세(연간 구매금액/수량/횟수/최근·평균단가/
// 현재고/월평균사용량/재고커버리지/공급업체 수 + 구매이력/가격이력/
// 재고이력/공급업체 탭)로 이동한다. 검색어가 없으면 최근 12개월 구매금액
// 상위 품목을 기본으로 보여준다(01 구매현황과 동일 소스라 숫자가 어긋나지
// 않음).
import Link from "next/link";
import { searchItems } from "@/lib/actions/pis-dashboard";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, formatWon } from "@/components/admin/dashboard-ui";

export default async function ItemAnalysisPage({ searchParams }: PageProps<"/admin/item-analysis">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const results = await searchItems(q);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="sku"
        title="03. 품목분석 — 무엇을 얼마나 사고 있는가?"
        description="품목코드나 품목명으로 검색해 품목 하나의 통합 상세(구매이력/가격이력/재고이력/공급업체)를 확인할 수 있습니다. 검색어가 없으면 최근 12개월 구매금액 상위 품목을 기본으로 보여줍니다."
      />

      <form className="flex gap-2" action="/admin/item-analysis">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="품목코드 또는 품목명으로 검색"
          className="w-full max-w-md rounded-lg border border-line bg-bg-raised px-3 py-2 text-[13px] outline-none focus:border-[var(--sku)]"
        />
        <button type="submit" className="pressable rounded-lg bg-[var(--sku)] px-4 py-2 text-[13px] font-semibold text-white">
          검색
        </button>
        {q && (
          <Link href="/admin/item-analysis" className="pressable rounded-lg border border-line px-4 py-2 text-[13px] text-ink-faint">
            초기화
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
        {results.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-ink-faint">
            {q ? `"${q}"에 맞는 품목이 없습니다.` : "최근 12개월 구매 이력이 있는 품목이 없습니다."}
          </p>
        ) : (
          <table className="w-full text-left text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 font-semibold">품목코드</th>
                <th className="px-3 py-2 font-semibold">품목명</th>
                <th className="px-3 py-2 font-semibold">카테고리</th>
                <th className="px-3 py-2 font-semibold text-right">최근단가</th>
                <th className="px-3 py-2 font-semibold text-right">현재고</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.item_code} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/admin/item-analysis/${encodeURIComponent(r.item_code)}`} className="font-mono text-[12px] text-[var(--sku)] underline">
                      {r.item_code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/item-analysis/${encodeURIComponent(r.item_code)}`} className="hover:underline">
                      {r.item_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-faint">{r.item_category ?? "미분류"}</td>
                  <td className="px-3 py-2 text-right text-ink-faint">{r.latestPrice === null ? "-" : formatWon(r.latestPrice)}</td>
                  <td className="px-3 py-2 text-right">{r.qtyOnHand === null ? "-" : formatNumber(r.qtyOnHand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
