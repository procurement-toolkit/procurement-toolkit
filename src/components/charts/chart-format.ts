// 2026-09-23 (수정), Kevin "업로드 완료, 검증해줘" 요청으로 라이브 검증 중
// /admin/materials 등 차트가 들어간 페이지 전체가 500(React 에러 #441)로
// 죽는 것을 발견 — 원인은 서버 컴포넌트(각 admin page.tsx)가 BarChart/
// HBarChart/LineChart(전부 "use client")에 formatValue={(n) => ...} 형태로
// 함수를 prop으로 넘긴 것. 이건 2026-09-18 Drilldown 500 사고와 정확히
// 같은 종류의 버그(서버→클라이언트 함수 prop 금지, tsc/eslint/로컬 build
// 전부 통과하지만 실제 로그인된 요청에서만 터짐) — 그때 Drilldown.tsx를
// "trigger: ReactNode + format 문자열 지정자" 패턴으로 고친 것과 동일한
// 해법을 차트 3종에도 적용한다: 함수 대신 이 문자열 유니언(ChartUnit)을
// prop으로 받고, 실제 포맷팅은 여기 클라이언트 파일 안에서 수행한다.
import { formatWon, formatPct, formatNumber } from "@/components/admin/dashboard-ui";

export type ChartUnit = "won" | "pct" | "count-건" | "count-개" | "month";

export function formatChartValue(n: number, unit?: ChartUnit): string {
  switch (unit) {
    case "won":
      return formatWon(n);
    case "pct":
      return formatPct(n);
    case "count-건":
      return `${formatNumber(n)}건`;
    case "count-개":
      return `${formatNumber(n)}개`;
    case "month":
      return `${Math.round(n * 10) / 10}개월`;
    default:
      return n.toLocaleString("ko-KR");
  }
}
