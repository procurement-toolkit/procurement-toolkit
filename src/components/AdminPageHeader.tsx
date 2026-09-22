import Link from "next/link";

// 2026-09-18, Kevin 요청: "생산불출 페이지에 들어가면 상단에 PRD 배지가
// 떠서 어느 기능인지 재확인 가능한" MobileHeader의 개념을 PIS(관리자)
// 쪽에도 그대로 적용 — 어떤 admin 페이지에 있든 상단에 그 메뉴 고유 색의
// 배지가 항상 보여서, 상단 내비를 다시 보지 않아도 지금 어느 기능
// 안에 있는지 재확인할 수 있다. code는 NavLink와 동일한 8개
// (dash/usr/itm/sync/pur/rec/rank/ord — rank/ord는 2026-09-18 대시보드
// 재구성으로 추가된 "구매 분석"/"발주서 현황" 메뉴).
const TONE_CLASS: Record<string, string> = {
  dash: "tag-dash",
  usr: "tag-usr",
  itm: "tag-itm",
  sync: "tag-sync",
  pur: "tag-pur",
  rec: "tag-rec",
  rank: "tag-rank",
  ord: "tag-ord",
  // 2026-09-21, 메뉴 구조 재설계로 추가된 8개 업무 메뉴.
  sku: "tag-sku",
  inv: "tag-inv",
  sup: "tag-sup",
  prc: "tag-prc",
  risk: "tag-risk",
  plan: "tag-plan",
  mtl: "tag-mtl",
  rpt: "tag-rpt",
};

export function AdminPageHeader({
  code,
  title,
  description,
  back,
}: {
  code: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  // 사용자 상세 페이지처럼 목록으로 돌아가는 링크가 필요한 하위 페이지용.
  back?: { href: string; label: string };
}) {
  const tone = code.toLowerCase();

  return (
    <div>
      {back && (
        <Link
          href={back.href}
          className="pressable mb-1 inline-block rounded px-1 py-0.5 text-[12px] text-trace underline underline-offset-2 active:bg-trace-soft"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex items-center gap-2">
        <span className={`tag ${TONE_CLASS[tone] ?? "tag-log"}`}>{code}</span>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
      {description && <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">{description}</p>}
    </div>
  );
}
