"use client";

// 시계열 라인차트 — 예: 품목 가격 이력. 단일 시리즈라 범례 없음(dataviz
// 스킬 규칙). 마우스를 올리면 가장 가까운 점에 십자선 + 툴팁을 보여준다
// (스킬의 "line/area는 crosshair+tooltip 기본 제공" 규칙).
import { useRef, useState } from "react";
import { formatChartValue, type ChartUnit } from "@/components/charts/chart-format";

export type LinePoint = { x: string; y: number };

export function LineChart({
  data,
  color = "var(--accent-ink)",
  unit,
  height = 180,
}: {
  data: LinePoint[];
  color?: string;
  unit?: ChartUnit;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return <div className="py-6 text-center text-[12px] text-ink-faint">표시할 데이터가 없습니다.</div>;
  }

  const W = 600;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padTop = 16;
  const padBottom = 22;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const values = data.map((d) => d.y);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(1, ...values);
  const range = maxVal - minVal || 1;
  const n = data.length;

  const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const yAt = (v: number) => padTop + plotH - ((v - minVal) / range) * plotH;

  const pathD = data.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(d.y)}`).join(" ");
  const ticks = 3;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => minVal + (range / ticks) * i);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(xAt(i) - relX);
      if (dist < best) {
        best = dist;
        closest = i;
      }
    }
    setHover(closest);
  }

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {gridLines.map((g, i) => (
          <line
            key={i}
            x1={padL}
            x2={W - padR}
            y1={yAt(g)}
            y2={yAt(g)}
            stroke="var(--line)"
            strokeWidth={1}
            opacity={0.6}
          />
        ))}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xAt(i)}
            cy={yAt(d.y)}
            r={hover === i ? 4 : 2.5}
            fill={color}
            stroke="var(--bg-raised)"
            strokeWidth={1}
          />
        ))}
        {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={padTop} y2={padTop + plotH} stroke={color} strokeWidth={1} opacity={0.35} />}
        {n <= 8 &&
          data.map((d, i) => (
            <text key={i} x={xAt(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--ink-faint)">
              {d.x}
            </text>
          ))}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-bg-raised px-2 py-1 text-[11px] shadow-lg"
          style={{
            left: `${(xAt(hover) / W) * 100}%`,
            transform: `translate(${hover < n / 2 ? "0" : "-100%"}, -4px)`,
          }}
        >
          <div className="font-semibold text-ink">{data[hover].x}</div>
          <div className="tabular-nums text-ink-soft">{formatChartValue(data[hover].y, unit)}</div>
        </div>
      )}
    </div>
  );
}
