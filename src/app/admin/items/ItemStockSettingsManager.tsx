"use client";

import { useEffect, useState, useTransition } from "react";
import {
  searchItemsForAdmin,
  updateItemStockSettings,
  type AdminItemRow,
} from "@/lib/actions/item-management";
import { Switch } from "@/components/Switch";

type RowState = AdminItemRow & { savedAt?: number; error?: string };

export function ItemStockSettingsManager() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchItemsForAdmin(query, 30);
        setRows(results);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function updateLocal(itemCode: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.item_code === itemCode ? { ...r, ...patch } : r)));
  }

  function save(row: RowState) {
    startTransition(async () => {
      const result = await updateItemStockSettings({
        itemCode: row.item_code,
        safetyStock: row.safety_stock,
        reorderPoint: row.reorder_point,
        isKeyItem: row.is_key_item,
      });
      if (result.ok) {
        updateLocal(row.item_code, { savedAt: Date.now(), error: undefined });
      } else {
        updateLocal(row.item_code, { error: result.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="품목코드 또는 품목명 검색"
        className="w-full max-w-sm rounded-lg border border-line bg-bg-sunken px-3 py-2 text-[14px] outline-none focus:border-line-strong"
      />

      <div className="overflow-hidden rounded-xl border border-line bg-bg-raised">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line bg-bg-sunken text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">품목</th>
              <th className="px-3 py-2 font-semibold">카테고리</th>
              <th className="px-3 py-2 font-semibold text-right">안전재고</th>
              <th className="px-3 py-2 font-semibold text-right">재주문점</th>
              <th className="px-3 py-2 font-semibold">핵심품목</th>
              <th className="px-3 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-faint">
                  {query.trim() ? "검색 결과가 없습니다" : "품목을 검색해서 안전재고/재주문점을 설정하세요"}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.item_code} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2">
                  <div className="font-mono text-[12px] font-semibold">{row.item_code}</div>
                  <div className="text-ink-soft">
                    {row.item_name}
                    {row.spec ? ` · ${row.spec}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2 text-ink-faint">{row.item_category ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={row.safety_stock ?? ""}
                    onChange={(e) =>
                      updateLocal(row.item_code, {
                        safety_stock: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-20 rounded border border-line bg-bg-sunken px-2 py-1 text-right outline-none focus:border-line-strong"
                  />
                  {row.suggestedSafetyStock !== null && (
                    <div className="mt-1 text-[11px] text-ink-faint">
                      추천 {row.suggestedSafetyStock}{" "}
                      <button
                        type="button"
                        onClick={() => updateLocal(row.item_code, { safety_stock: row.suggestedSafetyStock })}
                        className="pressable rounded px-1 py-0.5 text-trace underline underline-offset-2 active:bg-trace-soft"
                      >
                        적용
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={row.reorder_point ?? ""}
                    onChange={(e) =>
                      updateLocal(row.item_code, {
                        reorder_point: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-20 rounded border border-line bg-bg-sunken px-2 py-1 text-right outline-none focus:border-line-strong"
                  />
                  {row.suggestedReorderPoint !== null && (
                    <div className="mt-1 text-[11px] text-ink-faint">
                      추천 {row.suggestedReorderPoint}{" "}
                      <button
                        type="button"
                        onClick={() => updateLocal(row.item_code, { reorder_point: row.suggestedReorderPoint })}
                        className="pressable rounded px-1 py-0.5 text-trace underline underline-offset-2 active:bg-trace-soft"
                      >
                        적용
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Switch
                    checked={row.is_key_item}
                    label={row.is_key_item ? "핵심" : "일반"}
                    onColor="var(--itm)"
                    onClick={() => updateLocal(row.item_code, { is_key_item: !row.is_key_item })}
                    ariaLabel={row.is_key_item ? "핵심품목 해제" : "핵심품목으로 지정"}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => save(row)}
                    disabled={pending}
                    className="pressable btn-itm rounded-lg px-2.5 py-1 text-[12px] font-semibold active:scale-95 active:brightness-90 disabled:opacity-50 disabled:active:scale-100"
                  >
                    저장
                  </button>
                  {row.savedAt && <div className="mt-1 text-[11px] text-trace">저장됨</div>}
                  {row.error && <div className="mt-1 text-[11px] text-warn">{row.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
