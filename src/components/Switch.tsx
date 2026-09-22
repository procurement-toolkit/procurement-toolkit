// 2026-09-18, Kevin 요청: "PIS 모든 단추와 스위치에 적용해줘" — 지금까지
// PIS의 온/오프 토글(사용자 활성/비활성, 핵심품목 여부)이 그냥 색만 다른
// 알약 모양 버튼/기본 체크박스였던 걸, 눈으로 바로 "켜짐/꺼짐"이 보이는
// 진짜 스위치(트랙+원)로 바꾼다. 순수 프레젠테이션 컴포넌트라 "use client"가
// 필요 없다 — onClick은 이미 클라이언트 컴포넌트인 호출부(ActiveToggle,
// ItemStockSettingsManager)에서 그 자리에서 정의해 넘기므로 서버→클라이언트
// 경계를 넘지 않는다(Drilldown.tsx 사고의 교훈: 이 규칙은 서버 컴포넌트가
// 클라이언트 컴포넌트에 함수를 넘길 때만 적용되고, 클라이언트 트리 내부에서
// 컴포넌트끼리 함수를 주고받는 건 평범한 React라 문제 없음).
export function Switch({
  checked,
  label,
  onColor = "var(--trace)",
  offBg,
  offBorder,
  onClick,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  // 스위치 옆에 보여줄 텍스트(예: "활성"/"비활성", "핵심"/"일반").
  label?: string;
  // 켜짐 상태 트랙 색. 기본은 공용 trace(초록)이고, 필요하면 그 화면
  // 고유 색(예: 핵심품목은 --itm)을 넘긴다.
  onColor?: string;
  // 꺼짐 상태를 중립 회색이 아니라 의미 있는 색(예: 비활성 계정=warn)으로
  // 보여주고 싶을 때만 지정.
  offBg?: string;
  offBorder?: string;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const style: React.CSSProperties = {
    ["--switch-on" as string]: onColor,
    ...(offBg ? { ["--switch-off-bg" as string]: offBg } : {}),
    ...(offBorder ? { ["--switch-off-border" as string]: offBorder } : {}),
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      disabled={disabled}
      className="pressable inline-flex items-center gap-2 rounded-full disabled:opacity-50"
    >
      <span className="switch" data-checked={checked} style={style}>
        <span className="switch-thumb" />
      </span>
      {label && (
        <span className="text-[12px] font-semibold" style={{ color: checked ? onColor : undefined }}>
          {label}
        </span>
      )}
    </button>
  );
}
