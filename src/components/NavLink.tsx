"use client";

// 2026-09-18, Kevin 요청: "커서를 움직여서 해당 위치로 가면 눌러진다던지,
// 선택한 영역이 확실히 어디인지 알려줄 수 있으면 좋겠다" — 지금까지 상단
// 내비게이션은 지금 어느 화면에 있는지 표시가 전혀 없었다(hover만 있고
// active-route 표시 없음). usePathname으로 현재 경로와 비교해 강조 표시하고,
// 공용 .pressable 클래스로 클릭 시 눌리는 느낌을 준다.
//
// 2026-09-18 후속, Kevin 요청: "이 기능을 PIS 모든 단추와 스위치에 적용해줘"
// — IMMS 홈 화면 타일이 기능별로 색이 다르고(Tile.tsx) 눌렀을 때 그 색으로
// 반응하는 것과 같은 개념을 PIS(관리자) 상단 메뉴에도 적용한다. `code` prop을
// 주면 ① 메뉴 앞에 항상 그 기능 고유 색의 점(dot)이 보이고, ② 지금 그 화면에
// 있을 때는(active) 그 색의 연한 배경으로 강조된다 — 이전엔 6개 메뉴가 전부
// 똑같은 accent 색 하나로만 활성 표시돼서 구분이 안 됐다.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TONE_DOT_CLASS: Record<string, string> = {
  dash: "bg-[var(--dash)]",
  usr: "bg-[var(--usr)]",
  itm: "bg-[var(--itm)]",
  sync: "bg-[var(--sync)]",
  pur: "bg-[var(--pur)]",
  rec: "bg-[var(--rec)]",
  rank: "bg-[var(--rank)]",
  ord: "bg-[var(--ord)]",
  // 2026-09-21, 메뉴 구조 재설계로 추가된 8개 업무 메뉴.
  sku: "bg-[var(--sku)]",
  inv: "bg-[var(--inv)]",
  sup: "bg-[var(--sup)]",
  prc: "bg-[var(--prc)]",
  risk: "bg-[var(--risk)]",
  plan: "bg-[var(--plan)]",
  mtl: "bg-[var(--mtl)]",
  rpt: "bg-[var(--rpt)]",
};

const TONE_ACTIVE_CLASS: Record<string, string> = {
  dash: "bg-[var(--dash-soft)] text-[var(--dash)]",
  usr: "bg-[var(--usr-soft)] text-[var(--usr)]",
  itm: "bg-[var(--itm-soft)] text-[var(--itm)]",
  sync: "bg-[var(--sync-soft)] text-[var(--sync)]",
  pur: "bg-[var(--pur-soft)] text-[var(--pur)]",
  rec: "bg-[var(--rec-soft)] text-[var(--rec)]",
  rank: "bg-[var(--rank-soft)] text-[var(--rank)]",
  ord: "bg-[var(--ord-soft)] text-[var(--ord)]",
  sku: "bg-[var(--sku-soft)] text-[var(--sku)]",
  inv: "bg-[var(--inv-soft)] text-[var(--inv)]",
  sup: "bg-[var(--sup-soft)] text-[var(--sup)]",
  prc: "bg-[var(--prc-soft)] text-[var(--prc)]",
  risk: "bg-[var(--risk-soft)] text-[var(--risk)]",
  plan: "bg-[var(--plan-soft)] text-[var(--plan)]",
  mtl: "bg-[var(--mtl-soft)] text-[var(--mtl)]",
  rpt: "bg-[var(--rpt-soft)] text-[var(--rpt)]",
};

export function NavLink({
  href,
  exact = false,
  code,
  children,
}: {
  href: string;
  // 기본은 prefix 매칭(/admin/users가 활성이면 /admin/users/123도 활성) —
  // 대시보드 루트("/admin", "/m")처럼 다른 모든 경로의 접두어가 되는
  // 경로만 exact=true로 넘겨서 항상 활성으로 뜨는 걸 방지한다.
  exact?: boolean;
  // 이 메뉴가 속한 기능의 색상 코드(dash/usr/itm/sync/pur/rec). 안 주면
  // 기존처럼 accent 색 하나로만 표시된다.
  code?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const tone = code?.toLowerCase();

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`pressable inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-[13px] transition-colors ${
        isActive
          ? `font-semibold ${(tone && TONE_ACTIVE_CLASS[tone]) ?? "bg-accent-soft text-accent-ink"}`
          : "text-ink-soft hover:bg-bg-sunken hover:text-ink active:bg-bg-sunken"
      }`}
    >
      {tone && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT_CLASS[tone] ?? "bg-ink-faint"}`} aria-hidden />}
      {children}
    </Link>
  );
}
