// 2026-09-21, Kevin 요청("메뉴 구조 재설계 — HOME은 요약만, 상세는 각자
// 화면으로") — HOME(admin/page.tsx) 한 파일에 몰려있던 재고/업체/가격
// 섹션을 /admin/inventory, /admin/suppliers, /admin/pricing, /admin/
// supply-risk 등 여러 화면으로 쪼개면서, 그 화면들이 전부 똑같이 쓰던
// KpiTile/SectionHeader/EmptyNote/format 함수들을 여기로 뽑아냈다.
// (기존 admin 하위 다른 페이지들(purchases/purchase-orders/...)은 각자
// 파일에 이미 자기 것을 갖고 있어 그대로 두고, 이번에 새로 만들거나
// 쪼갠 화면들만 이 공용 모듈을 쓴다 — 기존 코드를 불필요하게 건드리지
// 않기 위함.)

export function formatNumber(n: number) {
  return n.toLocaleString("ko-KR");
}

export function formatWon(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export function formatPct(n: number | null) {
  if (n === null) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

export function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}

// 2026-09-18, Kevin 요청: 대시보드 숫자를 눌렀을 때 실제 계산 근거로 이동해
// 인사이트를 얻을 수 있도록 — KpiTile이 클릭 가능할 때 오른쪽 위에 작은
// "›" 힌트를 붙여 "여기 더 볼 게 있다"는 걸 시각적으로 알려준다. 클릭
// 자체의 눌리는 느낌은 이 컴포넌트를 감싸는 <Drilldown>의 .pressable
// 버튼이 담당한다.
export function KpiTile({ label, value, sub, interactive }: { label: string; value: string; sub?: string; interactive?: boolean }) {
  return (
    <div className="relative flex flex-col gap-1 rounded-xl border border-line bg-bg-raised px-4 py-3">
      {interactive && <span className="absolute right-2 top-2 text-[13px] leading-none text-ink-faint/60">›</span>}
      <span className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="font-mono text-xl font-bold tabular-nums text-ink">{value}</span>
      {sub && <span className="text-[11px] text-ink-faint">{sub}</span>}
    </div>
  );
}

export function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-[14px] font-bold text-ink">{title}</h2>
      {note && <p className="mt-0.5 text-[11px] text-ink-faint">{note}</p>}
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-[13px] text-ink-faint">{children}</p>;
}

// 2026-09-21: 03 품목분석/08 구매계획/10 통합조회처럼 메뉴 구조(프레임)는
// 먼저 만들되 실제 화면은 다음 단계에 순차로 만들기로 한 곳에 쓰는 공용
// "준비중" 안내 — 메뉴에서 아예 숨기지 않고, 왜 아직 없는지/무엇이
// 갖춰지면 채워지는지를 정직하게 보여준다(Kevin의 "재고가 적정한가"
// 섹션에서 이미 쓰던 "버그가 아니라 데이터가 쌓이면 채워지는 구조"
// 안내와 같은 톤).
export function ComingSoon({ what, needs }: { what: string; needs: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-bg-raised px-4 py-6 text-center">
      <p className="text-[13px] font-semibold text-ink-soft">{what} — 준비 중입니다</p>
      <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-ink-faint">{needs}</p>
    </div>
  );
}
