import Link from "next/link";
import { Tile } from "@/components/Tile";
import { getMyProfile } from "@/lib/queries";

// 2026-09-21, Kevin 요청: "IMMS 에서 PIS로 넘어갈 수 도 있게 만들어줘" —
// PIS(웹, /admin) → IMMS(모바일, /m) 전환은 이미 있었다(2026-09-17,
// admin/layout.tsx의 "IMMS 화면" 링크). 반대 방향(IMMS → PIS)도
// `/m/layout.tsx` 상단 헤더에 "PIS 화면" 링크로 이미 존재하긴 했지만
// 작은 텍스트 링크 하나뿐이라 눈에 잘 안 띄었을 수 있다 — 홈 화면에도
// 눈에 띄는 카드를 추가해 더 확실히 넘어갈 수 있게 한다. 관리자(role=
// 'admin')에게만 보이도록 함 — PIS(/admin/*)는 전부 관리자 권한을
// 요구하므로, 현장 역할 계정에 보여줘도 눌러보면 "관리자만 사용할 수
// 있습니다" 에러만 만나게 되어 오히려 혼란만 준다.
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

      {profile?.role === "admin" && (
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
