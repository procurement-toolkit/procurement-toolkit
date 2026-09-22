import Link from "next/link";
import { Tile } from "@/components/Tile";
import { getMyProfile } from "@/lib/queries";

// 2026-09-21, Kevin 요청: "IMMS 에서 PIS로 넘어갈 수 도 있게 만들어줘" —
// PIS(웹, /admin) → IMMS(모바일, /m) 전환은 이미 있었다(2026-09-17,
// admin/layout.tsx의 "IMMS 화면" 링크). 반대 방향(IMMS → PIS)도
// `/m/layout.tsx` 상단 헤더에 "PIS 화면" 링크로 이미 존재하긴 했지만
// 작은 텍스트 링크 하나뿐이라 눈에 잘 안 띄었을 수 있다 — 홈 화면에도
// 눈에 띄는 카드를 추가해 더 확실히 넘어갈 수 있게 한다.
//
// 2026-09-22 업데이트, Kevin 요청("현장 작업자별 PIS 접근권한"): 처음엔
// 관리자(role='admin')에게만 보였지만, 이제 개별 현장 계정에 PIS 업무
// 화면 접근을 허용하는 profiles.pis_access 플래그가 추가되어(migration
// 0016) 그 값이 true인 현장 계정도 이 카드를 볼 수 있다 — 안 보여주면
// 접근 권한은 받았는데 어떻게 들어가는지 몰라 헤매게 되므로.
export default async function MobileHome() {
  const profile = await getMyProfile();

  return (
    <div className="p-4">
      <div className="mb-4">
        <div className="text-[15px] font-bold">자재관리</div>
        <div className="text-[11px] text-ink-faint">M2000 자재창고(이천공장)</div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Tile href="/m/in" code="IN" label="입고" />
        <Tile href="/m/issue" code="PRD" label="생산불출" />
        <Tile href="/m/move" code="MOV" label="창고이동" />
        <Tile href="/m/ship" code="SHP" label="택배발송" />
        <Tile href="/m/return" code="RET" label="반납" />
        <Tile href="/m/stock" code="QTY" label="재고조회" />
        <Tile href="/m/history" code="LOG" label="이력조회" wide />
      </div>

      {(profile?.role === "admin" || profile?.pis_access) && (
        <Link
          href="/admin"
          className="pressable mt-4 flex items-center justify-between rounded-xl border border-line bg-bg-sunken p-4 active:scale-[0.98] active:bg-[var(--dash-soft)] active:border-line-strong"
        >
          <div className="flex flex-col gap-1">
            <span className="tag tag-dash w-fit">PIS</span>
            <span className="text-[15px] font-semibold text-ink">PIS 관리자 화면으로 이동</span>
            <span className="text-[11.5px] text-ink-faint">구매분석 · 발주관리 · 재고 인사이트</span>
          </div>
          <span className="text-[18px] text-ink-faint">›</span>
        </Link>
      )}
    </div>
  );
}
