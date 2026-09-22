"use client";

import { useState } from "react";

export type SupplierOption = { code: string; name: string };

// Optional supplier picker for the mobile 입고 form (Tier3 PIS follow-up —
// see migration 0010's comment for why this is optional, not required).
// Suppliers are few enough (order of a few hundred) to pass down from the
// server page and filter client-side, no search API needed.
export function SupplierPicker({
  suppliers,
  value,
  onChange,
}: {
  suppliers: SupplierOption[];
  value: SupplierOption | null;
  onChange: (supplier: SupplierOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results =
    query.trim() === ""
      ? suppliers.slice(0, 30)
      : suppliers
          .filter(
            (s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.code.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 30);

  if (value && !open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg-sunken px-3 py-2.5">
        <div className="text-[13px] text-ink-soft">{value.name}</div>
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
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="거래처명 검색 (모르면 비워둬도 됩니다)"
        className="w-full rounded-lg border border-line bg-bg-sunken px-3 py-2.5 text-[14px] outline-none focus:border-line-strong"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-bg-raised shadow-lg">
          {results.length === 0 && <div className="px-3 py-2 text-[12px] text-ink-faint">검색 결과가 없습니다</div>}
          {results.map((s) => (
            <button
              type="button"
              key={s.code}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className="block w-full border-b border-line px-3 py-2 text-left text-[13px] text-ink-soft last:border-b-0 hover:bg-bg-sunken"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
