"use client";

// 2026-09-23, Kevin 요청: "각 메뉴 하단에 인사이트를 얻을 수 있는 목적에
// 맞는 차트" — 외부 차트 라이브러리(recharts 등) 없이 순수 SVG로 만든
// 가볍고 빠른 공용 차트 컴포넌트. dataviz 스킬 가이드를 따름: 얇은 막대,
// 둥근 끝, 옅은 그리드라인, 호버 툴팁, 값 직접 라벨. 시리즈가 1개뿐인
// 막대차트는 범례가 필요 없다(스킬 규칙) — 그래서 색은 prop 하나로만
// 받는다. 색은 이 앱의 기존 메뉴별 accent 토큰(예: var(--pur))을 그대로
// 쓰면 라이트/다크 모드 전환이 자동으로 따라온다(globals.css의
// prefers-color-scheme 재정의를 그대로 상속).
import { useState } from "react";
import { formatChartValue, type ChartUnit } from "@/components/charts/chart-format";

export type BarDatum = { label: string; value: number };

export function BarChart({
  data,
  color = "var(--accent-ink)",
  unit,
  height = 180,
}: {
  data: BarDatum[];
  color?: string;
  unit?: ChartUnit;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padTop = 16;
  const padBottom = 24;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const maxVal = Math.max(1, ...data.map((d) => Math.max(0, d.value)));
  const n = Math.max(1, data.length);
  const gap = 6;
  const barW = Math.max(4, (plotW - gap * (n - 1)) / n);

  if (data.length === 0) {
    return <div className="py-6 text-center text-[12px] text-ink-faint">표시할 데이터가 없습니다.</div>;
  }

  const ticks = 3;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => (maxVal / ticks) * i);

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        {gridLines.map((g, i) => {
          const y = padTop + plotH - (g / maxVal) * plotH;
          return (
            <line
              key={i}
              x1={padL}
              x2={W - padR}
              y1={y}
              y2={y}
              stroke="var(--line)"
              strokeWidth={1}
              opacity={0.6}
            />
          );
        })}
        {data.map((d, i) => {
          const x = padL + i * (barW + gap);
          const h = maxVal > 0 ? (Math.max(0, d.value) / maxVal) * plotH : 0;
          const y = padTop + plotH - h;
          const isHover = hover === i;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(1, h)}
                rx={Math.min(4, barW / 3)}
                fill={color}
                opacity={isHover ? 1 : 0.85}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((v) => (v === i ? null : v))}
              />
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--ink-faint)"
              >
                {d.label.length > 6 ? `${d.label.slice(0, 5)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-bg-raised px-2 py-1 text-[11px] shadow-lg"
          style={{
            left: `${((hover + 0.5) / n) * 100}%`,
            transform: "translate(-50%, -4px)",
          }}
        >
          <div className="font-semibold text-ink">{data[hover].label}</div>
          <div className="tabular-nums text-ink-soft">{formatChartValue(data[hover].value, unit)}</div>
        </div>
      )}
    </div>
  );
}
