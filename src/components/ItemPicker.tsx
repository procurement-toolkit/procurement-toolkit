"use client";

import { useEffect, useState } from "react";
import { StockBadge } from "./StockBadge";

export type PickedItem = {
  item_code: string;
  item_name: string;
  spec: string | null;
  unit: string;
};

export function ItemPicker({
  value,
  onChange,
  locationCode,
  locationLabel,
}: {
  value: PickedItem | null;
  onChange: (item: PickedItem | null) => void;
  // 2026-09-21, Kevin 요청: 품목을 고르는 즉시 이 창고의 실시간 재고를
  // 보여준다 — 안 주면 재고 표시를 생략(예: 아직 창고를 안 고른 시점).
  locationCode?: string;
  locationLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/items/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.items ?? []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (value && !open) {
    return (
      <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[12px] font-semibold">{value.item_code}</div>
            <div className="text-[13px] text-ink-soft">
              {value.item_name}
              {value.spec ? ` · ${value.spec}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(true);
              setQuery("");
            }}
            className="text-[12px] text-accent-ink underline underline-offset-2"
          >
            변경
          </button>
        </div>
        <StockBadge
          key={value.item_code}
          itemCode={value.item_code}
          unit={value.unit}
          locationCode={locationCode}
          locationLabel={locationLabel}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        autoFocus={open}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="품목코드 또는 품목명 검색"
        className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none focus:border-line-strong"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-bg-raised shadow-lg">
          {loading && <div className="px-3 py-2 text-[12px] text-ink-faint">검색 중…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-ink-faint">검색 결과가 없습니다</div>
          )}
          {results.map((item) => (
            <button
              type="button"
              key={item.item_code}
              onClick={() => {
                onChange(item);
                setOpen(false);
              }}
              className="flex w-full flex-col items-start gap-0.5 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-bg-sunken"
            >
              <span className="font-mono text-[12px] font-semibold">{item.item_code}</span>
              <span className="text-[13px] text-ink-soft">
                {item.item_name}
                {item.spec ? ` · ${item.spec}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
