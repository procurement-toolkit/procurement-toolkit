"use client";

// 2026-11-12, Kevin 요청(모든 작업 화면에 전체화면 전환·복귀 — 아이콘으로 통일, 화면 오른쪽 위에 항상): 외자·내자 모든 /admin 화면에 한 번에 붙는다.
// 아이콘은 Material Symbols의 fullscreen / fullscreen_exit (Apache 2.0) 원본 경로를 그대로 쓴다.
// 사이드바(AdminSidebar) 안에서 한 번만 그리고, 화면 바깥(body)에 고정해서 어느 화면·어느 스크롤에서도 같은 자리에 있다.
// 전체화면 중에는 레이아웃의 메뉴·상단 줄(data-print-hide)을 숨겨서 표·본문만 넓게 본다.
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useAdminFullscreen } from "@/lib/admin-fullscreen";

const ICON_ENTER = "M120-120v-193h60v133h133v60H120Zm527 0v-60h133v-133h60v193H647ZM120-647v-193h193v60H180v133h-60Zm660 0v-133H647v-60h193v193h-60Z";
const ICON_EXIT = "M253-120v-133H120v-60h193v193h-60Zm394 0v-193h193v60H707v133h-60ZM120-647v-60h133v-133h60v193H120Zm527 0v-193h60v133h133v60H647Z";

// 큰 화면에서만 쓴다(좁은 화면은 위쪽 줄이 따로 있다). 오른쪽에 단추 자리(40px)를 비워 두어 표 오른쪽 위와 겹치지 않게 한다.
const CSS = `
@media (min-width: 768px) {
  div[class*="max-w-[1600px]"]:has(> [data-print-hide]) { padding-right: 40px; }
}
html.hk-fs div[class*="max-w-[1600px]"] { max-width: none !important; }
html.hk-fs div[class*="max-w-[1600px]"] > [data-print-hide] { display: none !important; }
.hk-fs-btn { position: fixed; top: 8px; right: 6px; z-index: 300; }
@media (min-width: 1608px) { html:not(.hk-fs) .hk-fs-btn { right: calc((100vw - 1600px) / 2 + 6px); } }
`;

export function AdminFullscreenButton() {
  const [fs, setFs] = useAdminFullscreen();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <>
      <style>{CSS}</style>
      <button
        type="button"
        onClick={() => setFs(!fs)}
        title={fs ? "전체화면 끝내기 (Esc)" : "전체화면으로 보기"}
        aria-label={fs ? "전체화면 끝내기" : "전체화면으로 보기"}
        aria-pressed={fs}
        data-print-hide
        className="hk-fs-btn pressable hidden h-8 w-8 items-center justify-center rounded-lg border border-line bg-bg-raised text-ink-soft shadow-sm hover:border-line-strong hover:text-ink md:flex"
      >
        <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
          <path d={fs ? ICON_EXIT : ICON_ENTER} />
        </svg>
      </button>
    </>,
    document.body
  );
}
