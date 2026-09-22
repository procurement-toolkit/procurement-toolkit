"use client";

// 2026-09-21, Kevin 요청: "한 웹페이지에 모든 지표를 넣는 방식은 피하고,
// Dashboard → 업무/분석 카테고리 → 상세화면 → Drill-down 구조로" — 기존엔
// /admin 상단에 8개 메뉴를 한 줄로 나열했지만, 이번에 10개 업무 메뉴(HOME
// 포함) + 5개 관리 메뉴로 늘어나 한 줄에 다 안 들어간다. Dynamics 365/
// Oracle/Infor 같은 ERP가 업무 목적별로 영역을 나누는 것처럼, "업무"(구매
// 의사결정에 쓰는 화면)와 "관리"(데이터 동기화/설정 같은 운영 도구)를
// 분리한 좌측 사이드바로 바꾼다. 데스크톱에서는 고정 사이드바, 좁은
// 화면에서는 그룹 라벨이 붙은 가로 스크롤 목록으로 접힌다(기존
// flex-wrap 방식과 동일한 원리, 그룹 헤더만 추가).
import { NavLink } from "@/components/NavLink";

type NavItem = { href: string; code: string; label: string; exact?: boolean };

const WORK_ITEMS: NavItem[] = [
  { href: "/admin", code: "dash", label: "HOME", exact: true },
  { href: "/admin/purchases", code: "rank", label: "01 구매현황" },
  { href: "/admin/purchase-orders", code: "ord", label: "02 발주관리" },
  { href: "/admin/item-analysis", code: "sku", label: "03 품목분석" },
  { href: "/admin/inventory", code: "inv", label: "04 재고관리" },
  { href: "/admin/suppliers", code: "sup", label: "05 업체분석" },
  { href: "/admin/pricing", code: "prc", label: "06 가격분석" },
  { href: "/admin/supply-risk", code: "risk", label: "07 공급 Risk" },
  { href: "/admin/planning", code: "plan", label: "08 구매계획" },
  { href: "/admin/materials", code: "mtl", label: "09 자재이동" },
  { href: "/admin/reports", code: "rpt", label: "10 통합조회" },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin/users", code: "usr", label: "사용자 관리" },
  { href: "/admin/items", code: "itm", label: "품목 재고기준" },
  { href: "/admin/ecount-sync", code: "sync", label: "E-Count 동기화" },
  { href: "/admin/purchase-import", code: "pur", label: "구매현황 업로드" },
  { href: "/admin/stock-reconciliation", code: "rec", label: "재고 Reconciliation" },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint/70 md:pt-2">{label}</span>
      <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {items.map((item) => (
          <NavLink key={item.href} href={item.href} exact={item.exact} code={item.code}>
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function AdminSidebar() {
  return (
    <nav className="flex flex-col gap-3 border-b border-line bg-bg-raised px-3 py-2.5 md:w-56 md:shrink-0 md:border-b-0 md:border-r md:px-2 md:py-4">
      <NavGroup label="업무" items={WORK_ITEMS} />
      <NavGroup label="관리" items={ADMIN_ITEMS} />
    </nav>
  );
}
