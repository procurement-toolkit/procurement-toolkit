import { getYearlyPurchaseBreakdown, type YearlyBreakdownRow } from "@/lib/actions/pis-dashboard";
import { AdminPageHeader } from "@/components/AdminPageHeader";

function formatWon(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}
function formatPct(n: number | null) {
  if (n === null) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

function YearlyTable({
  title,
  rows,
  years,
  yearTotals,
  labelHeader,
}: {
  title: string;
  rows: YearlyBreakdownRow[];
  years: string[];
  yearTotals: Record<string, number>;
  labelHeader: string;
}) {
  const lastYear = years[years.length - 1];
  const prevYear = years[years.length - 2];

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-ink-soft">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-ink-faint">구매 전표 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">{labelHeader}</th>
                  {years.map((y) => (
                    <th key={y} className="px-3 py-2 text-right font-semibold">
                      {y}
                    </th>
                  ))}
                  {prevYear && lastYear && <th className="px-3 py-2 text-right font-semibold">전년비</th>}
                  <th className="px-3 py-2 text-right font-semibold">{years.length}개년 합계</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const last = lastYear ? r.byYear[lastYear] ?? 0 : 0;
                  const prev = prevYear ? r.byYear[prevYear] ?? 0 : 0;
                  const yoy = prevYear && prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : null;
                  return (
                    <tr key={r.key} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-ink-faint">{i + 1}</td>
                      <td className="px-3 py-2">{r.label}</td>
                      {years.map((y) => (
                        <td key={y} className={`px-3 py-2 text-right ${y === lastYear ? "font-semibold text-ink" : "text-ink-soft"}`}>
                          {r.byYear[y] ? formatWon(r.byYear[y]) : "-"}
                        </td>
                      ))}
                      {prevYear && lastYear && (
                        <td
                          className={`px-3 py-2 text-right font-semibold ${
                            yoy === null ? "text-ink-faint" : yoy > 0 ? "text-warn" : yoy < 0 ? "text-accent-ink" : "text-ink-faint"
                          }`}
                        >
                          {formatPct(yoy)}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right font-semibold">{formatWon(r.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-bg-sunken text-[12px] text-ink-faint">
                  <td className="px-3 py-2" colSpan={2}>
                    연도 전체 구매액 (모든 업체/품목 합계)
                  </td>
                  {years.map((y) => (
                    <td key={y} className="px-3 py-2 text-right font-semibold text-ink">
                      {formatWon(yearTotals[y] ?? 0)}
                    </td>
                  ))}
                  {prevYear && lastYear && <td className="px-3 py-2" />}
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default async function PurchaseAnalysisPage() {
  const breakdown = await getYearlyPurchaseBreakdown(15);

  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        code="rank"
        title="01. 구매현황 — 구매 분석 (연도별 누적)"
        description={
          <>
            &quot;최근 30일&quot; 기준 랭킹은 품목마다 발주 주기·단위 금액 차이가 커서 큰 의미를 찾기 어렵다는
            피드백(2026-09-18)에 따라, 업체별/품목별/카테고리별 구매액을 연도(2023년~) 단위로 누적해 나란히
            비교하는 화면입니다. 상위 {breakdown.bySupplier.length || 0}개는 {breakdown.years.length}개년 합계
            기준으로 뽑았고, 각 행에서 연도별 금액이 어떻게 바뀌는지(전년비 포함) 볼 수 있습니다. 금액은
            purchase_records의 supply_amount(공급가액, 부가세 제외) 기준 실제 구매현황 전표 데이터입니다 — 추정치가
            아닙니다.
          </>
        }
      />

      {breakdown.recordCount === 0 ? (
        <div className="rounded-xl border border-line bg-bg-raised px-4 py-3 text-[13px] text-ink-faint">
          아직 업로드된 구매현황 전표가 없습니다 — /admin/purchase-import에서 구매현황 xlsx를 업로드하면 여기에
          연도별 랭킹이 나타납니다.
        </div>
      ) : (
        <>
          <YearlyTable
            title={`업체별 구매액 (상위 ${breakdown.bySupplier.length})`}
            rows={breakdown.bySupplier}
            years={breakdown.years}
            yearTotals={breakdown.yearTotals}
            labelHeader="거래처"
          />
          <YearlyTable
            title={`품목별 구매액 (상위 ${breakdown.byItem.length})`}
            rows={breakdown.byItem}
            years={breakdown.years}
            yearTotals={breakdown.yearTotals}
            labelHeader="품목"
          />
          <YearlyTable
            title={`카테고리별 구매액 (상위 ${breakdown.byCategory.length})`}
            rows={breakdown.byCategory}
            years={breakdown.years}
            yearTotals={breakdown.yearTotals}
            labelHeader="카테고리"
          />
        </>
      )}
    </div>
  );
}
