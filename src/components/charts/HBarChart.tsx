"use client";

// 가로 막대 차트 — 순위/비교용(예: 업체별 구매액, 재고 커버리지 낮은 순).
// diverging=true면 0을 중심으로 좌/우로 뻗는 상승/하락 대비 차트가 된다
// (예: 06 가격분석의 YoY 상승/하락 품목). diverging 모드는 색만으로
// 상승/하락을 구분하지 않도록 막대 끝에 항상 값(+/-%)을 직접 라벨로
// 붙인다 — dataviz 스킬의 "색은 보조 인코딩과 함께" 원칙을 색맹 대비
// 검증이 애매한 경우에도 지키기 위함(CLAUDE.md 참고).
import { useState } from "react";
import { formatChartValue, type ChartUnit } from "@/components/charts/chart-format";

export type HBarDatum = { label: string; value: number };

export function HBarChart({
  data,
  color = "var(--accent-ink)",
  negativeColor,
  diverging = false,
  unit,
  barHeight = 22,
  gap = 8,
}: {
  data: HBarDatum[];
  color?: string;
  negativeColor?: string;
  diverging?: boolean;
  unit?: ChartUnit;
  barHeight?: number;
  gap?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) {
    return <div className="py-6 text-center text-[12px] text-ink-faint">표시할 데이터가 없습니다.</div>;
  }

  const W = 600;
  const rowH = barHeight + gap;
  const H = data.length * rowH + gap;
  const labelW = 108;
  const padR = 56;
  const plotW = W - labelW - padR;
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const zeroX = diverging ? labelW + plotW / 2 : labelW;
  const scale = diverging ? plotW / 2 / maxAbs : plotW / maxAbs;

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
        <line x1={zeroX} x2={zeroX} y1={0} y2={H} stroke="var(--line)" strokeWidth={1} opacity={0.6} />
        {data.map((d, i) => {
          const y = gap / 2 + i * rowH;
          const isNeg = d.value < 0;
          const barLen = Math.abs(d.value) * scale;
          const barColor = isNeg && negativeColor ? negativeColor : color;
          const x = diverging ? (isNeg ? zeroX - barLen : zeroX) : labelW;
          const isHover = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((v) => (v === i ? null : v))}>
              <text x={labelW - 8} y={y + barHeight / 2 + 4} textAnchor="end" fontSize={11} fill="var(--ink-soft)">
                {d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label}
              </text>
              <rect
                x={x}
                y={y}
                width={Math.max(1, barLen)}
                height={barHeight}
                rx={Math.min(4, barHeight / 3)}
                fill={barColor}
                opacity={isHover ? 1 : 0.85}
              />
              <text
                x={diverging ? (isNeg ? x - 6 : x + barLen + 6) : x + barLen + 6}
                y={y + barHeight / 2 + 4}
                textAnchor={diverging && isNeg ? "end" : "start"}
                fontSize={11}
                fontWeight={600}
                fill="var(--ink)"
              >
                {formatChartValue(d.value, unit)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute right-1 rounded-md border border-line bg-bg-raised px-2 py-1 text-[11px] shadow-lg"
          style={{ top: `${(hover * rowH) / H * 100}%` }}
        >
          <div className="font-semibold text-ink">{data[hover].label}</div>
          <div className="tabular-nums text-ink-soft">{formatChartValue(data[hover].value, unit)}</div>
        </div>
      )}
    </div>
  );
}
