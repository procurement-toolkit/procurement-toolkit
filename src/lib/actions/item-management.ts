"use server";

// Tier3 PIS dashboard follow-up: 재고부족위험/과잉재고 need safety_stock/
// reorder_point per item, and as of 2026-09-11 every one of 18,565 items
// had both unset (confirmed by direct query against the live DB — not a
// guess). There was no UI anywhere to set them; getLowStockItems()
// (src/lib/queries.ts) has been reading safety_stock since early in this
// project, it just never had anything to read. This file is the missing
// write path — an admin searches for an item and sets the two numbers by
// hand. No bulk import: 18,565 items is too many to guess sensible
// defaults for, and a wrong default (e.g. 0) would silently suppress the
// exact "재고부족" alert it's meant to power.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { M2000_DEPARTMENT } from "@/lib/pis-scope";
import { z } from "zod";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    throw new Error("관리자만 사용할 수 있습니다");
  }
}

export type AdminItemRow = {
  item_code: string;
  item_name: string;
  spec: string | null;
  unit: string;
  item_category: string | null;
  safety_stock: number | null;
  reorder_point: number | null;
  is_key_item: boolean;
  // 2026-09-17 고도화: purchase_records 최근 12개월 구매 이력이 있는
  // 품목에 한해 계산되는 "추천값" — 확정값이 아니라 출발점일 뿐이며,
  // 관리자가 직접 확인 후 반영해야 저장된다(자동 저장 없음). 구매
  // 이력이 없으면 null — 0을 추천하면 "안전재고 필요 없음"으로
  // 잘못 읽힐 수 있어, 계산 불가 상태를 명시적으로 구분한다.
  suggestedSafetyStock: number | null;
  suggestedReorderPoint: number | null;
};

// 추천 안전재고 = 일평균 구매량 × SAFETY_BUFFER_DAYS(1주 버퍼).
// 추천 재주문점 = 일평균 구매량 × 리드타임(일) + 추천 안전재고 — 전형적인
// "리드타임 수요 + 안전재고" 공식. 일평균 구매량은 IMMS 자체 소비 기록
// (stock_ledger)이 아직 거의 0건이라 대신 purchase_records의 실제 구매
// 수량을 수요의 대리 지표로 쓴다 — 구매량 ≈ 소비량이라는 전제가 완벽하진
// 않지만(재고 비축 목적 구매 등), 아무 기준도 없는 것보다는 훨씬 낫다.
const SAFETY_BUFFER_DAYS = 7;
// items.lead_time_days는 2026-09-11 기준 18,622개 중 10,000개만 이카운트
// 품목조회로 채워짐 — 나머지 품목엔 이 보수적 기본값(2주)을 대신 쓴다.
const DEFAULT_LEAD_TIME_DAYS = 14;
const DEMAND_WINDOW_DAYS = 365;

export async function searchItemsForAdmin(query: string, limit = 30): Promise<AdminItemRow[]> {
  await requireAdmin();
  const admin = createAdminClient();

  let q = admin
    .from("items")
    .select("item_code, item_name, spec, unit, item_category, safety_stock, reorder_point, is_key_item, lead_time_days")
    .order("item_code")
    .limit(limit);

  if (query.trim()) {
    q = q.or(`item_code.ilike.%${query}%,item_name.ilike.%${query}%`);
  }

  const { data } = await q;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const itemCodes = rows.map((r) => r.item_code);
  const sinceIso = new Date(Date.now() - DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: demandRows } = await admin
    .from("purchase_records")
    .select("item_code, qty")
    .in("item_code", itemCodes)
    .eq("department", M2000_DEPARTMENT) // 2026-09-21, M2000 스코프 — src/lib/pis-scope.ts 참고
    .gte("purchase_date", sinceIso);

  const qtyByItem = new Map<string, number>();
  for (const d of demandRows ?? []) qtyByItem.set(d.item_code, (qtyByItem.get(d.item_code) ?? 0) + d.qty);

  return rows.map((r) => {
    const totalQty = qtyByItem.get(r.item_code);
    let suggestedSafetyStock: number | null = null;
    let suggestedReorderPoint: number | null = null;
    if (totalQty && totalQty > 0) {
      const avgDailyQty = totalQty / DEMAND_WINDOW_DAYS;
      const leadTimeDays = r.lead_time_days ?? DEFAULT_LEAD_TIME_DAYS;
      suggestedSafetyStock = Math.round(avgDailyQty * SAFETY_BUFFER_DAYS);
      suggestedReorderPoint = Math.round(avgDailyQty * leadTimeDays) + suggestedSafetyStock;
    }
    return {
      item_code: r.item_code,
      item_name: r.item_name,
      spec: r.spec,
      unit: r.unit,
      item_category: r.item_category,
      safety_stock: r.safety_stock,
      reorder_point: r.reorder_point,
      is_key_item: r.is_key_item,
      suggestedSafetyStock,
      suggestedReorderPoint,
    };
  });
}

const settingsSchema = z.object({
  itemCode: z.string().min(1),
  safetyStock: z.union([z.coerce.number().nonnegative(), z.null()]),
  reorderPoint: z.union([z.coerce.number().nonnegative(), z.null()]),
  isKeyItem: z.boolean(),
});

export async function updateItemStockSettings(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해주세요" };

  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("items")
    .update({
      safety_stock: parsed.data.safetyStock,
      reorder_point: parsed.data.reorderPoint,
      is_key_item: parsed.data.isKeyItem,
    })
    .eq("item_code", parsed.data.itemCode);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
