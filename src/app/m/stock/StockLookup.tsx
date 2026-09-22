"use client";

import { useState } from "react";
import { ItemPicker, type PickedItem } from "@/components/ItemPicker";

type StockRow = { location_code: string; qty_on_hand: number };

export function StockLookup() {
  const [item, setItem] = useState<PickedItem | null>(null);
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSelect(picked: PickedItem | null) {
    setItem(picked);
    setStock(null);
    if (!picked) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/stock?item=${encodeURIComponent(picked.item_code)}`);
      const data = await res.json();
      setStock(data.stock ?? []);
    } finally {
      setLoading(false);
    }
  }

  const total = stock?.reduce((sum, row) => sum + row.qty_on_hand, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <ItemPicker value={item} onChange={handleSelect} />

      {loading && <div className="text-[13px] text-ink-faint">조회 중…</div>}

      {stock && !loading && (
        <div className="rounded-lg border border-line bg-bg-raised">
          {stock.length === 0 && (
            <div className="px-3 py-4 text-center text-[13px] text-ink-faint">
              재고 이력이 없습니다
            </div>
          )}
          {stock.map((row) => (
            <div
              key={row.location_code}
              className="flex items-center justify-between border-b border-line px-3 py-2.5 text-[13px] last:border-b-0"
            >
              <span className="font-mono">{row.location_code}</span>
              <span className="font-mono font-semibold tabular-nums">
                {row.qty_on_hand} {item?.unit}
              </span>
            </div>
          ))}
          {stock.length > 0 && (
            <div className="flex items-center justify-between border-t border-line-strong px-3 py-2.5 text-[13px] font-bold">
              <span>합계</span>
              <span className="font-mono tabular-nums">
                {total} {item?.unit}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
