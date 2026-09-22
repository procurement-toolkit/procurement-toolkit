"use client";

// Shared "cart" building block for the four /m transaction forms that got
// upgraded from single-item to multi-item entry (2026-09-17, Kevin: "입고,
// 불출, 택배, 창고 이동이 장바구니 형태로 변경되어야 할 것 같아... 한번에
// 여러 아이템을 입고하거나, 생산불출하거나, 택배불출, 창고 이동이 한번에
// 이루어지는 상황에 대한 대처법으로서 필요함").
//
// Deliberately generic across all four types: it only knows about
// item + qty. Type-specific fields (창고, 거래처, 받는곳, 공정 등) stay on
// each Form component as header-level state entered once, same as before —
// only the item+qty part repeats per line. This matches the DB shape
// exactly: one `transactions` header row + N `transaction_details` rows
// (that table was already designed for multiple lines per header, see
// migration 0001 — every existing form just happened to only ever insert
// one).
import { useState } from "react";
import { ItemPicker, type PickedItem } from "./ItemPicker";
import { Stepper } from "./Stepper";

export type CartLine = {
  item_code: string;
  item_name: string;
  spec: string | null;
  unit: string;
  qty: number;
};

export function ItemCart({
  lines,
  onChange,
  addLabel = "담기",
  locationCode,
  locationLabel,
}: {
  lines: CartLine[];
  onChange: (lines: CartLine[]) => void;
  addLabel?: string;
  // 2026-09-21, Kevin 요청: 담기 전에 이 창고의 실시간 재고를 보여준다 —
  // ItemPicker로 그대로 전달.
  locationCode?: string;
  locationLabel?: string;
}) {
  const [item, setItem] = useState<PickedItem | null>(null);
  const [qty, setQty] = useState(1);

  function addToCart() {
    if (!item) return;
    const existingIdx = lines.findIndex((l) => l.item_code === item.item_code);
    if (existingIdx >= 0) {
      // Same item added twice in one session — merge into the existing line
      // rather than showing two rows for the same item_code (transaction_details
      // has no unique constraint stopping that, but a merged line is what a
      // person scanning the same box twice actually means).
      const next = [...lines];
      next[existingIdx] = { ...next[existingIdx], qty: next[existingIdx].qty + qty };
      onChange(next);
    } else {
      onChange([
        ...lines,
        { item_code: item.item_code, item_name: item.item_name, spec: item.spec, unit: item.unit, qty },
      ]);
    }
    setItem(null);
    setQty(1);
  }

  function updateQty(idx: number, nextQty: number) {
    const next = [...lines];
    next[idx] = { ...next[idx], qty: nextQty };
    onChange(next);
  }

  function removeLine(idx: number) {
    onChange(lines.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1.5 text-[12px] text-ink-faint">자재 검색</div>
        <ItemPicker value={item} onChange={setItem} locationCode={locationCode} locationLabel={locationLabel} />
      </div>

      {item && (
        <div className="flex items-center gap-3">
          <Stepper value={qty} onChange={setQty} />
          <button
            type="button"
            onClick={addToCart}
            className="pressable flex-1 rounded-lg border border-line-strong bg-bg-raised py-2.5 text-[13px] font-semibold text-ink active:bg-trace-soft active:text-trace"
          >
            {addLabel}
          </button>
        </div>
      )}

      {lines.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12px] text-ink-faint">
            담은 품목 ({lines.length}건 · 총 {lines.reduce((sum, l) => sum + l.qty, 0)}개)
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-bg-sunken p-2">
            {lines.map((line, idx) => (
              <div
                key={line.item_code}
                className="flex items-center justify-between gap-2 rounded-lg bg-bg-raised px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[12px] font-semibold">{line.item_code}</div>
                  <div className="truncate text-[12px] text-ink-soft">
                    {line.item_name}
                    {line.spec ? ` · ${line.spec}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Stepper value={line.qty} onChange={(n) => updateQty(idx, n)} />
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="pressable rounded px-1.5 py-0.5 text-[12px] text-warn underline underline-offset-2 active:bg-warn-soft"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
