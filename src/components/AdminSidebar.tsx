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
// 2026-11-12, Kevin 요청("외자와 내자 메뉴바를 마우스로 눌러서 끌어 위아래로 재배치"): 메뉴를 끌어다 놓으면 순서가 바뀌고,
// 계정별로 DB(user_menu_order)에 저장되어 다음 접속에도 그대로다. 키보드는 Alt+↑/↓. "순서 초기화"로 기본 순서로 돌아간다.
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { NavLink } from "@/components/NavLink";
import { PopoverEsc } from "@/components/PopoverEsc";
import { AdminFullscreenButton } from "@/components/AdminFullscreenButton";
import { getMenuOrder, saveMenuOrder, type MenuOrder } from "@/lib/actions/menu-order";

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
  { href: "/admin/purchase-closing", code: "cls", label: "11 매입마감" },
  // 2026-10-19, Kevin 요청: "견적을 받으면 입력을 하고 견적에 대한 결과를
  // 보고 그에 맞춰서 발주를 할 수 있도록" — 업체 견적 접수부터 발주 대상
  // 선택까지가 지금까지 PIS에 아예 없던 단계였다(02 발주관리는 이카운트
  // 발주서 읽기 전용, 11 매입마감은 입고 이후).
  { href: "/admin/plate-quotes", code: "plq", label: "12 원판견적" },
  // 2026-11-10, Kevin 요청: 12 원판견적 밑에 발주서(내자) — 확정한 발주 대상을 이카운트 발주서로.
  { href: "/admin/plate-orders", code: "plq", label: "13 발주서(내자)" },
];


// 2026-10-12, Kevin 요청: "외자 발주서, 수입원가에 대해서 pis로 전환하고
// 싶어 ... 외자팀만 접근을 하게 하고, 다른 직원들을 접근권한을 주지 말고"
// — "업무"/"관리"와 완전히 독립된 세 번째 그룹. role='admin'이거나
// profiles.foreign_trade_access=true인 계정에게만 보인다(일반 pis_access
// 보유자에게는 숨김 — 위 두 그룹과 권한 축이 다르다). 이 목록은
// proxy.ts의 FOREIGN_TRADE_PATHS와 정확히 일치해야 한다.
const FOREIGN_TRADE_ITEMS: NavItem[] = [
  { href: "/admin/foreign-trade", code: "fto", label: "외자 발주현황", exact: true },
  // 2026-11-10, Kevin 요청("발주서 생성기능도 외자 메뉴바에 추가해주고"):
  // 새 발주서 작성 전용 페이지. /admin/foreign-trade 하위라 proxy.ts의
  // FOREIGN_TRADE_PATHS(startsWith)가 그대로 덮는다 — 목록 변경 불필요.
  { href: "/admin/foreign-trade/new", code: "fto", label: "발주서(외자)" },
  { href: "/admin/foreign-trade/master", code: "fto", label: "수출입 품목대장" },
  // 2026-11-11, Kevin 요청(고도화 ②): 품목 단가·리드타임 분석. /admin/foreign-trade 하위라 proxy.ts가 그대로 덮는다.
  { href: "/admin/foreign-trade/analysis", code: "fto", label: "단가·리드타임 분석" },
  { href: "/admin/foreign-trade/alerts", code: "fta", label: "알림 센터" },
  { href: "/admin/foreign-trade/insights", code: "fti", label: "통계·인사이트·보고서" },
  { href: "/admin/foreign-trade/dictionary", code: "ftd", label: "영문 품목 사전" },
  { href: "/admin/foreign-trade/vendors", code: "fmr", label: "해외업체 DB" },
];

// 저장된 순서대로 정렬한다. 저장 뒤에 새로 생긴 메뉴는 기본 순서 그대로 맨 뒤에 붙고, 없어진 메뉴는 무시한다.
function applyOrder(items: NavItem[], saved: string[] | undefined): NavItem[] {
  if (!saved || saved.length === 0) return items;
  const rank = new Map(saved.map((h, i) => [h, i]));
  return items
    .map((it, i) => ({ it, key: rank.has(it.href) ? (rank.get(it.href) as number) : saved.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.it);
}

function NavGroup({
  label,
  items,
  saved,
  onChange,
  onReset,
  notice,
}: {
  label: string;
  items: NavItem[];
  saved: string[] | undefined;
  onChange: (hrefs: string[]) => void;
  onReset: () => void;
  notice?: string | null;
}) {
  const ordered = applyOrder(items, saved);
  const [dragHref, setDragHref] = useState<string | null>(null);
  const [over, setOver] = useState<{ href: string; after: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const custom = !!saved && saved.length > 0;

  const move = (from: string, to: string, after: boolean) => {
    if (from === to) return;
    const list = ordered.map((x) => x.href).filter((h) => h !== from);
    let at = list.indexOf(to);
    if (at < 0) return;
    if (after) at += 1;
    list.splice(at, 0, from);
    onChange(list);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>, href: string) => {
    if (!dragHref) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const row = listRef.current ? getComputedStyle(listRef.current).flexDirection.startsWith("row") : false;
    const after = row ? e.clientX > rect.left + rect.width / 2 : e.clientY > rect.top + rect.height / 2;
    setOver((cur) => (cur && cur.href === href && cur.after === after ? cur : { href, after }));
  };
  const endDrag = () => {
    setDragHref(null);
    setOver(null);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>, href: string) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const list = ordered.map((x) => x.href);
    const i = list.indexOf(href);
    const k = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (i < 0 || k < 0 || k >= list.length) return;
    e.preventDefault();
    list.splice(k, 0, list.splice(i, 1)[0]);
    onChange(list);
    // 순서가 바뀌어도 방금 움직인 메뉴에 계속 포커스가 있도록 다음 화면 그린 뒤 다시 잡는다
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[data-nav-href="' + href + '"] a')?.focus());
  };

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2 pb-1 md:pt-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint/70">{label}</span>
        {custom && (
          <button type="button" onClick={onReset} title="이 메뉴 순서를 처음(기본) 순서로 되돌려요" className="pressable whitespace-nowrap text-[10px] text-ink-faint underline-offset-2 hover:underline">
            순서 초기화
          </button>
        )}
      </div>
      <div ref={listRef} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {ordered.map((item) => {
          const showBefore = over?.href === item.href && !over.after && dragHref !== item.href;
          const showAfter = over?.href === item.href && over.after && dragHref !== item.href;
          return (
            <div
              key={item.href}
              data-nav-href={item.href}
              draggable
              title="끌어서 순서를 바꿀 수 있어요 (Alt+↑/↓)"
              onDragStart={(e) => {
                setDragHref(item.href);
                e.dataTransfer.effectAllowed = "move";
                try {
                  e.dataTransfer.setData("text/plain", item.href);
                } catch {
                  /* 일부 브라우저는 데이터 설정을 막는다 — 끌기 자체는 state로 처리한다 */
                }
              }}
              onDragOver={(e) => onDragOver(e, item.href)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragHref && over) move(dragHref, over.href, over.after);
                endDrag();
              }}
              onDragEnd={endDrag}
              onKeyDown={(e) => onKey(e, item.href)}
              className={
                "shrink-0 rounded-lg transition-shadow " +
                (dragHref === item.href ? "opacity-40 " : "") +
                (showBefore ? "shadow-[0_-2px_0_0_var(--accent,#3b82f6)] " : "") +
                (showAfter ? "shadow-[0_2px_0_0_var(--accent,#3b82f6)] " : "")
              }
            >
              <NavLink href={item.href} exact={item.exact} code={item.code}>
                {item.label}
              </NavLink>
            </div>
          );
        })}
      </div>
      {notice && <span className="px-2 pt-1 text-[10px] text-warn">{notice}</span>}
    </div>
  );
}

export function AdminSidebar({
  hasForeignTradeAccess,
}: {
  // 2026-10-12 추가. admin/layout.tsx가 profiles.foreign_trade_access를
  // 반영해 넘겨준다 — isAdmin이면 이미 true로 넘어온다.
  hasForeignTradeAccess?: boolean;
}) {
  // 계정별로 저장된 메뉴 순서(없으면 기본 순서)
  const [order, setOrder] = useState<MenuOrder>({});
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getMenuOrder()
      .then((res) => {
        if (alive && res.ok) setOrder(res.order);
      })
      .catch(() => {
        /* 불러오지 못하면 기본 순서로 보인다 */
      });
    return () => {
      alive = false;
    };
  }, []);
  const update = (group: "work" | "foreign", list: string[] | undefined) => {
    const next: MenuOrder = { ...order, [group]: list };
    setOrder(next);
    setNotice(null);
    saveMenuOrder(next)
      .then((res) => {
        if (!res.ok) setNotice("순서를 저장하지 못했어요 (새로고침하면 처음 순서로 돌아가요)");
      })
      .catch(() => setNotice("순서를 저장하지 못했어요 (새로고침하면 처음 순서로 돌아가요)"));
  };
  return (
    <nav className="flex flex-col gap-3 border-b border-line bg-bg-raised px-3 py-2.5 md:w-56 md:shrink-0 md:border-b-0 md:border-r md:px-2 md:py-4">
      <PopoverEsc />
      <AdminFullscreenButton />
      <NavGroup label="업무" items={WORK_ITEMS} saved={order.work} onChange={(l) => update("work", l)} onReset={() => update("work", undefined)} notice={notice} />
      {/* 2026-11-09, Kevin 요청("사용자관리, 비밀번호변경, imms화면,
          로그아웃, 이카운트 동기화 … 한곳으로 모으는게 좋을 것 같아"):
          여기 있던 "관리" 6개 메뉴는 AccountMenu(이름 클릭 패널)로 옮겼다.
          계정 관련 항목과 같은 성격인데 화면 양 끝으로 떨어져 있었고,
          업무 메뉴가 13개로 늘면서 사이드바가 너무 길어진 것도 겹쳤다.
          권한에 따라 숨기는 규칙(admin만)은 AccountMenu가 그대로 이어받고,
          경로 차단은 전과 같이 proxy.ts의 ADMIN_ONLY_PATHS가 한다. */}
      {hasForeignTradeAccess && <NavGroup label="외자" items={FOREIGN_TRADE_ITEMS} saved={order.foreign} onChange={(l) => update("foreign", l)} onReset={() => update("foreign", undefined)} />}
    </nav>
  );
}
