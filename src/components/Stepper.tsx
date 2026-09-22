"use client";

export function Stepper({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-center gap-4 py-1 font-mono text-[16px] font-bold">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="pressable flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-bg-raised text-[16px] active:scale-90 active:bg-bg-sunken"
      >
        –
      </button>
      <span className="w-12 text-center tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="pressable flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-bg-raised text-[16px] active:scale-90 active:bg-bg-sunken"
      >
        +
      </button>
    </div>
  );
}
