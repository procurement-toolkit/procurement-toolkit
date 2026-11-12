// 2026-11-12, Kevin 요청(모든 작업 화면에 전체화면 전환·복귀를 쉽게, 아이콘으로 통일) — 전체화면 상태를 한 곳에서 관리한다.
// 오른쪽 위의 공통 단추(AdminFullscreenButton)와 표 화면(외자 발주현황·수출입 품목대장)의 리본 단추가 같은 상태를 쓴다.
// 켜면 브라우저 전체화면을 요청하고(거부돼도 화면 안에서는 메뉴를 숨겨 전체화면처럼 보인다), Esc나 같은 단추로 돌아온다.
import { useSyncExternalStore } from "react";

let on = false;
let wired = false;
const subs = new Set<() => void>();

function emit() {
  subs.forEach((f) => f());
}

function apply(next: boolean) {
  if (next === on) return;
  on = next;
  if (typeof document !== "undefined") document.documentElement.classList.toggle("hk-fs", next);
  emit();
}

function wire() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  // 사용자가 브라우저의 Esc로 전체화면을 빠져나오면 우리 상태도 함께 끈다
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement == null) apply(false);
  });
  // 브라우저 전체화면을 못 쓰는 환경(화면 안 전체화면)에서도 Esc로 돌아온다. 열린 팝업이나 칸 수정이 Esc를 먼저 쓰면 양보한다.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !on || e.defaultPrevented || document.fullscreenElement != null) return;
    if (document.querySelector("details[data-popover][open]")) return;
    apply(false);
  });
}

export function setAdminFullscreen(next: boolean) {
  wire();
  if (next === on) return;
  apply(next);
  try {
    if (next && document.fullscreenElement == null) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (!next && document.fullscreenElement != null) void document.exitFullscreen?.().catch(() => {});
  } catch {
    /* 브라우저가 막아도 화면 안 전체화면은 그대로 동작한다 */
  }
}

/** [전체화면인지, 켜고 끄는 함수] — 어느 화면에서든 같은 상태를 본다 */
export function useAdminFullscreen(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      wire();
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => on,
    () => false
  );
  return [value, setAdminFullscreen];
}
