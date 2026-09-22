"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; syncWarning?: string }
  | { ok: false; error: string };

// PRD/MOV/RET transactions no longer push to E-Count synchronously here —
// see src/lib/ecount-flush.ts for why (창고이동입력 is rate-limited to 1
// call per 10 minutes on E-Count's real production server; calling it once
// per transaction would silently fail for anything beyond the first
// transfer in a 10-minute window). Every transaction below is just inserted
// with ecount_sync_status left at its DB default ('PENDING' — see
// 0001_init.sql); a scheduled batch job picks up every PENDING row and
// pushes them all to E-Count together. `syncWarning` on ActionResult is
// kept for the mobile forms that still read it, but nothing sets it
// anymore — there's no longer an immediate sync result to report at save
// time, only later via ecount_sync_status on the transaction's history row.

async function requireProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  return { supabase, userId: user.id };
}

// 2026-09-17 (Kevin: "입고, 불출, 택배, 창고 이동이 장바구니 형태로 변경되어야
// 할 것 같아... 한번에 여러 아이템을 입고하거나, 생산불출하거나, 택배불출,
// 창고 이동이 한번에 이루어지는 상황에 대한 대처법으로서 필요함") — 입고
// (IN)/생산불출(PRD)/택배불출(SHP)/창고이동(MOV)은 이제 한 번의 제출에 여러
// 품목(cart line)을 담을 수 있다. 반납(RET)은 이번 요청에 포함되지 않아
// 단일 품목 그대로 둠. DB는 이미 header(transactions) + N개 detail
// (transaction_details) 구조로 설계되어 있었음(migration 0001) — 지금까지는
// 매 트랜잭션이 우연히 detail을 1개만 넣었을 뿐, 스키마 변경은 필요 없다.
const cartLineSchema = z.object({
  itemCode: z.string().min(1),
  qty: z.coerce.number().positive(),
});
type CartLineInput = z.infer<typeof cartLineSchema>;
const cartItemsSchema = z.array(cartLineSchema).min(1, "품목을 1개 이상 담아주세요");

// Server-side duplicate guard (Tier1 #3, ① Data Integrity), now cart-aware.
// Mobile forms already disable their submit button while pending
// (useTransition), but that only stops a second click from the SAME render —
// it can't catch a flaky-network retry, a user tapping "다시 시도" after a
// slow response, or two taps that both land before React re-renders the
// disabled state. Scoped narrowly (same user, same txn type, same locations,
// same exact set of item+qty lines, within a short window) so it only ever
// catches something indistinguishable from a duplicate tap of the whole
// cart — submitting a genuinely different cart (even one item different, or
// one qty different) is never blocked. On any query failure this fails OPEN
// (proceeds with the insert) rather than ever blocking a real save because
// the duplicate-check itself broke.
const DUPLICATE_WINDOW_SECONDS = 5;

type ActionSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function normalizeCart(items: CartLineInput[]): string {
  return [...items]
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode))
    .map((i) => `${i.itemCode}:${i.qty}`)
    .join("|");
}

async function findRecentDuplicateCartTxnId(
  supabase: ActionSupabaseClient,
  params: {
    userId: string;
    txnType: string;
    items: CartLineInput[];
    fromLocationCode?: string | null;
    toLocationCode?: string | null;
  }
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - DUPLICATE_WINDOW_SECONDS * 1000).toISOString();
    let query = supabase
      .from("transactions")
      .select("id")
      .eq("processed_by", params.userId)
      .eq("txn_type", params.txnType)
      .gte("created_at", since);

    if (params.fromLocationCode !== undefined) {
      query =
        params.fromLocationCode === null
          ? query.is("from_location_code", null)
          : query.eq("from_location_code", params.fromLocationCode);
    }
    if (params.toLocationCode !== undefined) {
      query =
        params.toLocationCode === null
          ? query.is("to_location_code", null)
          : query.eq("to_location_code", params.toLocationCode);
    }

    const { data: candidates, error: candidatesErr } = await query;
    if (candidatesErr || !candidates || candidates.length === 0) return false;

    const { data: details, error: detailsErr } = await supabase
      .from("transaction_details")
      .select("txn_id, item_code, qty")
      .in(
        "txn_id",
        candidates.map((c) => c.id)
      );
    if (detailsErr || !details) return false;

    const wanted = normalizeCart(params.items);
    const byTxn = new Map<string, CartLineInput[]>();
    for (const d of details) {
      const list = byTxn.get(d.txn_id) ?? [];
      list.push({ itemCode: d.item_code, qty: d.qty });
      byTxn.set(d.txn_id, list);
    }
    for (const lines of byTxn.values()) {
      if (normalizeCart(lines) === wanted) return true;
    }
    return false;
  } catch (e) {
    console.error("duplicate-check failed, proceeding without it:", e);
    return false;
  }
}

const DUPLICATE_ERROR: ActionResult = {
  ok: false,
  error: `방금 같은 내용을 이미 저장했습니다 (${DUPLICATE_WINDOW_SECONDS}초 이내 중복 제출 감지). 다른 건이라면 잠시 후 다시 시도해주세요.`,
};

const inboundSchema = z.object({
  items: cartItemsSchema,
  toLocationCode: z.string().min(1),
  note: z.string().optional(),
  // Optional (migration 0010) — see its comment for why this isn't
  // required at the form level. Powers PIS's 업체별 구매금액/비중 and
  // 단일 공급업체 위험 metrics once populated; null is honest when unknown,
  // never guessed. One supplier per submission (header-level), same as a
  // single delivery from one supplier containing several items.
  supplierCode: z.string().optional(),
});

export async function createInboundTransaction(input: unknown): Promise<ActionResult> {
  const parsed = inboundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" };

  try {
    const { supabase, userId } = await requireProfile();

    if (
      await findRecentDuplicateCartTxnId(supabase, {
        userId,
        txnType: "IN",
        items: parsed.data.items,
        toLocationCode: parsed.data.toLocationCode,
      })
    ) {
      return DUPLICATE_ERROR;
    }

    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert({
        txn_type: "IN",
        to_location_code: parsed.data.toLocationCode,
        processed_by: userId,
        note: parsed.data.note || null,
        supplier_code: parsed.data.supplierCode || null,
      })
      .select("id")
      .single();
    if (txnErr || !txn) throw txnErr;

    const { error: detailErr } = await supabase.from("transaction_details").insert(
      parsed.data.items.map((line) => ({
        txn_id: txn.id,
        item_code: line.itemCode,
        qty: line.qty,
      }))
    );
    if (detailErr) throw detailErr;

    revalidatePath("/m/stock");
    revalidatePath("/m/history");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "저장 중 오류가 발생했습니다" };
  }
}

const issueSchema = z.object({
  items: cartItemsSchema,
  fromLocationCode: z.string().min(1),
  // 공정(process)은 카트 전체에 한 번만 선택 — 여러 공정에 걸친 불출을
  // 한 번에 등록하고 싶다면 공정별로 따로 제출해야 함(현재 UX와 동일한
  // 제약, 스키마상 detail별 process 저장은 가능하지만 입력 UX를 단순하게
  // 유지하기 위해 의도적으로 header 레벨 선택 하나만 둠).
  process: z.string().optional(),
  departmentId: z.string().optional(),
});

export async function createIssueTransaction(input: unknown): Promise<ActionResult> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" };

  try {
    const { supabase, userId } = await requireProfile();

    if (
      await findRecentDuplicateCartTxnId(supabase, {
        userId,
        txnType: "PRD",
        items: parsed.data.items,
        fromLocationCode: parsed.data.fromLocationCode,
      })
    ) {
      return DUPLICATE_ERROR;
    }

    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert({
        txn_type: "PRD",
        from_location_code: parsed.data.fromLocationCode,
        department_id: parsed.data.departmentId || null,
        processed_by: userId,
        reason: "생산",
      })
      .select("id")
      .single();
    if (txnErr || !txn) throw txnErr;

    const { error: detailErr } = await supabase.from("transaction_details").insert(
      parsed.data.items.map((line) => ({
        txn_id: txn.id,
        item_code: line.itemCode,
        qty: line.qty,
        process: parsed.data.process || null,
      }))
    );
    if (detailErr) throw detailErr;

    revalidatePath("/m/stock");
    revalidatePath("/m/history");
    revalidatePath("/admin");

    // E-Count push (창고이동입력, M2000→2000) happens later via the
    // scheduled batch flush — see src/lib/ecount-flush.ts. This row is left
    // at ecount_sync_status='PENDING' (the DB default) for that job to pick
    // up; process (담당 공정) is read back from each transaction_details row
    // for the note it builds ("생산불출 · <process>") — the flush now loops
    // over every line under a header instead of assuming exactly one.
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "저장 중 오류가 발생했습니다" };
  }
}

const moveSchema = z.object({
  items: cartItemsSchema,
  fromLocationCode: z.string().min(1),
  toLocationCode: z.string().min(1),
  note: z.string().optional(),
});

export async function createMoveTransaction(input: unknown): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" };
  if (parsed.data.fromLocationCode === parsed.data.toLocationCode) {
    return { ok: false, error: "출발창고와 도착창고가 같을 수 없습니다" };
  }

  try {
    const { supabase, userId } = await requireProfile();

    if (
      await findRecentDuplicateCartTxnId(supabase, {
        userId,
        txnType: "MOV",
        items: parsed.data.items,
        fromLocationCode: parsed.data.fromLocationCode,
        toLocationCode: parsed.data.toLocationCode,
      })
    ) {
      return DUPLICATE_ERROR;
    }

    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert({
        txn_type: "MOV",
        from_location_code: parsed.data.fromLocationCode,
        to_location_code: parsed.data.toLocationCode,
        processed_by: userId,
        note: parsed.data.note || null,
      })
      .select("id")
      .single();
    if (txnErr || !txn) throw txnErr;

    const { error: detailErr } = await supabase.from("transaction_details").insert(
      parsed.data.items.map((line) => ({
        txn_id: txn.id,
        item_code: line.itemCode,
        qty: line.qty,
      }))
    );
    if (detailErr) throw detailErr;

    revalidatePath("/m/stock");
    revalidatePath("/m/history");
    revalidatePath("/admin");

    // E-Count push happens later via the scheduled batch flush — see
    // src/lib/ecount-flush.ts. Row stays at ecount_sync_status='PENDING'.
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "저장 중 오류가 발생했습니다" };
  }
}

const returnSchema = z.object({
  itemCode: z.string().min(1),
  qty: z.coerce.number().positive(),
  fromLocationCode: z.string().min(1),
  toLocationCode: z.string().min(1),
  reason: z.string().optional(),
  note: z.string().optional(),
});

// 반납(RET)은 2026-09-17 장바구니 요청 범위에 포함되지 않아 단일 품목 그대로
// 둠 — Kevin이 요청한 4가지는 입고/생산불출/택배불출/창고이동뿐.
export async function createReturnTransaction(input: unknown): Promise<ActionResult> {
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해주세요" };
  if (parsed.data.fromLocationCode === parsed.data.toLocationCode) {
    return { ok: false, error: "반납 출발지와 도착창고가 같을 수 없습니다" };
  }

  try {
    const { supabase, userId } = await requireProfile();

    if (
      await findRecentDuplicateCartTxnId(supabase, {
        userId,
        txnType: "RET",
        items: [{ itemCode: parsed.data.itemCode, qty: parsed.data.qty }],
        fromLocationCode: parsed.data.fromLocationCode,
        toLocationCode: parsed.data.toLocationCode,
      })
    ) {
      return DUPLICATE_ERROR;
    }

    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert({
        txn_type: "RET",
        from_location_code: parsed.data.fromLocationCode,
        to_location_code: parsed.data.toLocationCode,
        processed_by: userId,
        reason: parsed.data.reason || null,
        note: parsed.data.note || null,
      })
      .select("id")
      .single();
    if (txnErr || !txn) throw txnErr;

    const { error: detailErr } = await supabase.from("transaction_details").insert({
      txn_id: txn.id,
      item_code: parsed.data.itemCode,
      qty: parsed.data.qty,
    });
    if (detailErr) throw detailErr;

    revalidatePath("/m/stock");
    revalidatePath("/m/history");
    revalidatePath("/admin");

    // E-Count push happens later via the scheduled batch flush — see
    // src/lib/ecount-flush.ts. Row stays at ecount_sync_status='PENDING'.
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "저장 중 오류가 발생했습니다" };
  }
}

const SHIPMENT_ORIGIN = "M2000";
const SHIPMENT_DEST_PLACEHOLDER = "EXT";

const shipmentSchema = z.object({
  items: cartItemsSchema,
  recipient: z.string().min(1, "받는 곳을 입력해주세요"),
  carrier: z.string().optional(),
  trackingNo: z.string().optional(),
  note: z.string().optional(),
});

// SHP always ships out of M2000 to the generic "EXT" placeholder location —
// the real destination (recipient/carrier/tracking) lives on the shipments
// row instead, since customer addresses aren't part of the location master.
// Never synced to E-Count: there's no matching E-Count warehouse code for an
// external recipient (see src/lib/ecount.ts). One shipment (= one box, one
// tracking number, one recipient) can now contain several items.
export async function createShipmentTransaction(input: unknown): Promise<ActionResult> {
  const parsed = shipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" };
  }

  try {
    const { supabase, userId } = await requireProfile();

    // Recipient isn't part of this check (it lives on `shipments`, not
    // `transactions`/`transaction_details`, and joining it in would add
    // real complexity for a rare case) — this only catches same cart
    // (item+qty set) shipments by the same user within the window,
    // regardless of recipient. Slightly more conservative than the other
    // three checks, but the failure mode of a false match here is the same:
    // a clear error telling the user to check history, never a silently
    // dropped real shipment.
    if (
      await findRecentDuplicateCartTxnId(supabase, {
        userId,
        txnType: "SHP",
        items: parsed.data.items,
        fromLocationCode: SHIPMENT_ORIGIN,
        toLocationCode: SHIPMENT_DEST_PLACEHOLDER,
      })
    ) {
      return DUPLICATE_ERROR;
    }

    const { data: shipment, error: shipErr } = await supabase
      .from("shipments")
      .insert({
        carrier: parsed.data.carrier || null,
        tracking_no: parsed.data.trackingNo || null,
        recipient: parsed.data.recipient,
      })
      .select("id")
      .single();
    if (shipErr || !shipment) throw shipErr;

    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert({
        txn_type: "SHP",
        from_location_code: SHIPMENT_ORIGIN,
        to_location_code: SHIPMENT_DEST_PLACEHOLDER,
        processed_by: userId,
        shipment_id: shipment.id,
        note: parsed.data.note || null,
        ecount_sync_status: "SKIPPED",
      })
      .select("id")
      .single();
    if (txnErr || !txn) throw txnErr;

    const { error: detailErr } = await supabase.from("transaction_details").insert(
      parsed.data.items.map((line) => ({
        txn_id: txn.id,
        item_code: line.itemCode,
        qty: line.qty,
      }))
    );
    if (detailErr) throw detailErr;

    revalidatePath("/m/stock");
    revalidatePath("/m/history");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "저장 중 오류가 발생했습니다" };
  }
}

const stockAdjustmentSchema = z.object({
  itemCode: z.string().min(1),
  locationCode: z.string().min(1),
  actualQty: z.coerce.number().min(0, "0 이상의 값을 입력해주세요"),
});

export type StockAdjustmentResult =
  | { ok: true; delta: number; noChange?: boolean }
  | { ok: false; error: string };

// 2026-09-21, Kevin 요청: "IMMS 상에서, 현재까지는 매입을 안 잡았기 때문에
// 최초에는 현재의 재고 수량을 수기로 입력해두어야 할 수도 있어... 1번 작업을
// 할 때마다 재고가 안 잡혀 있는 제품코드는 재고를 잡아야 할텐데 어떻게 해야
// 제대로 해놓는 것일까?" — 전체 품목을 한 번에 입력할 수 없으므로, 현장
// 작업자가 불출/이동/발송/반납 등 평소 업무를 하다가 화면에 뜬 실시간 재고가
// 실제와 다르면 그 자리에서 "실제 수량"을 입력해 바로잡는다. 재고를 직접
// 덮어쓰지 않고(0001_init.sql 설계 원칙) (실제 수량 − 현재 계산된 재고) 차이
// 만큼만 새 'ADJ' 거래로 기록한다 — 차이가 양수면 IN처럼(to_location_code만),
// 음수면 PRD처럼(from_location_code만) 한쪽만 채운다(migration 0015).
// 클라이언트가 들고 있던 화면상의 재고 값을 그대로 믿지 않고, 저장 시점에
// 서버에서 stock_by_location을 다시 읽어 delta를 계산한다 — 그 사이 다른
// 거래가 들어왔을 수 있기 때문. 절대 E-Count로 동기화되지 않도록
// ecount_sync_status를 처음부터 'SKIPPED'로 남긴다(진짜 매입이 아니므로).
export async function adjustStockToActualCount(input: unknown): Promise<StockAdjustmentResult> {
  const parsed = stockAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" };
  }

  try {
    const { supabase, userId } = await requireProfile();
    const { itemCode, locationCode, actualQty } = parsed.data;

    const { data: stockRow, error: stockErr } = await supabase
      .from("stock_by_location")
      .select("qty_on_hand")
      .eq("item_code", itemCode)
      .eq("location_code", locationCode)
      .maybeSingle();
    if (stockErr) throw stockErr;

    const currentQty = Number(stockRow?.qty_on_hand ?? 0);
    const delta = actualQty - currentQty;

    if (Math.abs(delta) < 0.0001) {
      return { ok: true, delta: 0, noChange: true };
    }

    const { data: txn, error: txnErr } = await supabase
      .from("transactions")
      .insert({
        txn_type: "ADJ",
        from_location_code: delta < 0 ? locationCode : null,
        to_location_code: delta > 0 ? locationCode : null,
        processed_by: userId,
        reason: "재고실사",
        note: `실사 등록: 계산재고 ${currentQty} → 실제 ${actualQty}`,
        ecount_sync_status: "SKIPPED",
      })
      .select("id")
      .single();
    if (txnErr || !txn) throw txnErr;

    const { error: detailErr } = await supabase.from("transaction_details").insert({
      txn_id: txn.id,
      item_code: itemCode,
      qty: Math.abs(delta),
    });
    if (detailErr) throw detailErr;

    revalidatePath("/m/stock");
    revalidatePath("/m/history");
    revalidatePath("/admin");
    return { ok: true, delta };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "재고 실사 등록 중 오류가 발생했습니다" };
  }
}
