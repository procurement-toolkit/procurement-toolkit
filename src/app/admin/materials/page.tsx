// 2026-09-21, Kevin 요청("메뉴 구조 재설계 — 09 자재이동: 현장에서 자재가
// 어떻게 움직였는가?") — 자재 이동의 "실행"은 IMMS 모바일 앱(입고/
// 생산불출/창고이동/택배발송/반납)이 담당하고, 여기 관리자 화면은
// "조회/관리" 역할이다(Kevin 표현: "Mobile = 실행, Web = 관리/조회").
// 사용자별/팀별/일자별/품목별/창고별로 필터링하는 통합 이동 로그 조회는
// 10 통합조회에서 만들 예정이라, 지금은 누적 건수 요약 + IMMS 모바일
// 바로가기만 둔다.
import Link from "next/link";
import { getDashboardKpis } from "@/lib/actions/pis-dashboard";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { formatNumber, KpiTile, ComingSoon } from "@/components/admin/dashboard-ui";

export default async function MaterialsPage() {
  const kpis = await getDashboardKpis();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        code="mtl"
        title="09. 자재이동 — 현장에서 자재가 어떻게 움직였는가?"
        description="자재 이동의 실행(입고/생산불출/창고이동/택배발송/반납 기록)은 IMMS 모바일 앱에서 이루어지고, 여기서는 그 기록을 조회·관리합니다. 사용자별/팀별/일자별/품목별/창고별 통합 이동 로그 조회는 10 통합조회에서 만들 예정입니다."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiTile label="IMMS 누적 거래 건수" value={formatNumber(kpis.totalTransactions)} sub="입고·생산불출·창고이동·택배발송·반납 합계" />
        <Link
          href="/m"
          className="pressable flex items-center justify-between rounded-xl border border-line bg-bg-raised px-4 py-3 hover:border-[var(--mtl)]"
        >
          <div>
            <div className="text-[13px] font-semibold text-ink">IMMS 모바일 화면 열기 →</div>
            <div className="mt-0.5 text-[12px] text-ink-faint">입고/생산불출/창고이동/택배발송/반납을 현장에서 직접 기록합니다.</div>
          </div>
          <span className="tag tag-mtl shrink-0">mtl</span>
        </Link>
      </div>

      <ComingSoon
        what="자재이동 통합 로그 조회 (사용자별 / 팀별 / 일자별 / 품목별 / 창고별)"
        needs="10 통합조회 화면에서 검색조건(기간·품목·창고·거래유형·사용자)으로 stock_ledger 원장을 직접 조회하고 Excel/PDF로 출력할 수 있도록 만들 예정입니다."
      />
    </div>
  );
}
