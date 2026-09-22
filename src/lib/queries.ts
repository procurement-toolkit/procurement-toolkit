import { createClient } from "@/lib/supabase/server";

export async function getMyProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role, department_id, departments(name, default_location_code)")
    .eq("id", user.id)
    .maybeSingle();

  return profile;
}

export async function getLocations() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("code, name, location_type")
    .eq("is_active", true)
    .order("code");
  return data ?? [];
}

// Small enough (order of a few hundred rows) to fetch in full and filter
// client-side — see components/SupplierPicker.tsx — rather than building a
// dedicated search API route like items has. Revisit if this ever grows
// into the thousands.
export async function getSuppliers() {
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("code, name").order("name");
  return data ?? [];
}

export async function getDepartments() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("id, name, default_location_code")
    .order("name");
  return data ?? [];
}

export async function searchItems(query: string, limit = 20) {
  const supabase = await createClient();
  let q = supabase
    .from("items")
    .select("item_code, item_name, spec, unit")
    .order("item_code")
    .limit(limit);

  if (query.trim()) {
    q = q.or(`item_code.ilike.%${query}%,item_name.ilike.%${query}%`);
  }

  const { data } = await q;
  return data ?? [];
}

export async function getStockForItem(itemCode: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_by_location")
    .select("location_code, qty_on_hand")
    .eq("item_code", itemCode)
    .order("location_code");
  return data ?? [];
}

export async function getTotalStock(limit = 200) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_total")
    .select("item_code, qty_on_hand")
    .order("item_code")
    .limit(limit);
  return data ?? [];
}

export async function getRecentTransactions(limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select(
      `id, txn_type, txn_date, from_location_code, to_location_code, reason, note,
       processed_by:profiles!transactions_processed_by_fkey(name),
       transaction_details(item_code, qty, process, items(item_name)),
       shipments(recipient, carrier, tracking_no)`
    )
    .order("txn_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getTodaysCounts() {
  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("transactions")
    .select("txn_type")
    .gte("txn_date", startOfDay.toISOString());

  const counts = { IN: 0, PRD: 0, MOV: 0, SHP: 0, RET: 0 };
  for (const row of data ?? []) {
    counts[row.txn_type as keyof typeof counts]++;
  }
  return counts;
}

export async function getLowStockItems() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items")
    .select("item_code, item_name, safety_stock")
    .not("safety_stock", "is", null);

  if (!items?.length) return [];

  const { data: totals } = await supabase
    .from("stock_total")
    .select("item_code, qty_on_hand")
    .in(
      "item_code",
      items.map((i) => i.item_code)
    );

  const totalMap = new Map(totals?.map((t) => [t.item_code, t.qty_on_hand]) ?? []);

  return items
    .map((item) => ({
      ...item,
      qty_on_hand: totalMap.get(item.item_code) ?? 0,
    }))
    .filter((item) => item.qty_on_hand < (item.safety_stock ?? 0));
}
