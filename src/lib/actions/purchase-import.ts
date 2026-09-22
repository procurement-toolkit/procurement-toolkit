"use server";

// Self-service recurring upload for real 구매현황 (Purchase Status) data —
// the answer to "구매현황을 지속적으로 반영하려면 어떻게 해야하나" (Kevin,
// 2026-09-07). Until this existed, getting new purchase periods into
// `purchase_records` meant hand-running a Python parsing script and chunked
// SQL inserts (see CLAUDE.md and migration 0011) — this lets an admin just
// upload the next xlsx export from E-Count's 구매관리현황 > 구매현황 screen.
//
// Parsing/hashing lives in src/lib/purchase-import-parse.ts and MUST stay
// byte-for-byte compatible with the original historical-backfill algorithm
// so re-uploading an overlapping period dedupes correctly against the
// 18,309 already-loaded rows via row_hash, not just against this file's own
// contents.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePurchaseStatusWorkbook, type ParsedPurchaseRow } from "@/lib/purchase-import-parse";

const INSERT_BATCH_SIZE = 500;
const ITEM_CHECK_BATCH_SIZE = 1000;
const SAMPLE_LIMIT = 50;

export interface PurchaseImportSuccess {
  ok: true;
  filename: string;
  totalDataRowsScanned: number;
  skippedNoItemCode: number;
  duplicatesWithinFile: number;
  parseFailureCount: number;
  parseFailureSample: { excelRow: number; reason: string; raw: string | null }[];
  unknownItemCodeCount: number;
  unknownItemCodeSample: { item_code: string; item_name: string }[];
  insertedCount: number;
  duplicateAgainstExistingCount: number;
  newTotalRowCount: number | null;
}

export interface PurchaseImportFailure {
  ok: false;
  error: string;
}

export type PurchaseImportResult = PurchaseImportSuccess | PurchaseImportFailure;

async function requireAdmin(): Promise<{ userId: string }> {
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
  return { userId: user.id };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function importPurchaseRecords(formData: FormData): Promise<PurchaseImportResult> {
  const { userId } = await requireAdmin();
  const admin = createAdminClient();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "업로드할 xlsx 파일을 선택해주세요." };
  }

  const buffer = await file.arrayBuffer();
  const parsed = await parsePurchaseStatusWorkbook(buffer);

  if (!parsed.ok) {
    await admin.from("purchase_import_log").insert({
      filename: file.name,
      uploaded_by: userId,
      status: "error",
      error: parsed.error,
    });
    return { ok: false, error: parsed.error };
  }

  // Resolve supplier_code by exact (trimmed) name match against the live
  // suppliers table — identical lookup rule to the original backfill.
  const { data: suppliers } = await admin.from("suppliers").select("code, name");
  const nameToCode = new Map<string, string>();
  for (const s of suppliers ?? []) {
    if (s.name) nameToCode.set(s.name.trim(), s.code);
  }

  // purchase_records.item_code has a hard FK to items(item_code) — a row for
  // an item E-Count's item master doesn't (yet) know about would otherwise
  // fail the whole batch with a bare FK-violation error. Check up front so
  // it's reported clearly instead.
  const distinctItemCodes = Array.from(new Set(parsed.rows.map((r) => r.item_code)));
  const knownItemCodes = new Set<string>();
  for (const codeChunk of chunk(distinctItemCodes, ITEM_CHECK_BATCH_SIZE)) {
    const { data } = await admin.from("items").select("item_code").in("item_code", codeChunk);
    for (const row of data ?? []) knownItemCodes.add(row.item_code);
  }

  const insertable: (ParsedPurchaseRow & { supplier_code: string | null })[] = [];
  const unknownItemCodeMap = new Map<string, string>();
  for (const row of parsed.rows) {
    if (!knownItemCodes.has(row.item_code)) {
      if (!unknownItemCodeMap.has(row.item_code)) unknownItemCodeMap.set(row.item_code, row.item_name);
      continue;
    }
    insertable.push({ ...row, supplier_code: nameToCode.get(row.supplier_name.trim()) ?? null });
  }

  let insertedCount = 0;
  for (const batch of chunk(insertable, INSERT_BATCH_SIZE)) {
    const { data, error } = await admin
      .from("purchase_records")
      .upsert(batch, { onConflict: "row_hash", ignoreDuplicates: true })
      .select("row_hash");
    if (error) {
      await admin.from("purchase_import_log").insert({
        filename: file.name,
        uploaded_by: userId,
        status: "error",
        rows_read: parsed.totalDataRowsScanned,
        error: `insert 실패: ${error.message}`,
        detail: { insertedSoFar: insertedCount },
      });
      return { ok: false, error: `저장 중 오류가 발생했습니다: ${error.message} (그 전까지 ${insertedCount}건 저장됨)` };
    }
    insertedCount += data?.length ?? 0;
  }

  const duplicateAgainstExistingCount = insertable.length - insertedCount;

  const { count: newTotalRowCount } = await admin
    .from("purchase_records")
    .select("*", { count: "exact", head: true });

  const unknownItemCodeSample = Array.from(unknownItemCodeMap.entries())
    .slice(0, SAMPLE_LIMIT)
    .map(([item_code, item_name]) => ({ item_code, item_name }));
  const parseFailureSample = parsed.parseFailures.slice(0, SAMPLE_LIMIT);

  await admin.from("purchase_import_log").insert({
    filename: file.name,
    uploaded_by: userId,
    status: "success",
    rows_read: parsed.totalDataRowsScanned,
    rows_inserted: insertedCount,
    rows_duplicate: parsed.duplicatesWithinFile + duplicateAgainstExistingCount,
    rows_skipped_no_item_code: parsed.skippedNoItemCode,
    rows_parse_failed: parsed.parseFailures.length,
    detail: JSON.parse(
      JSON.stringify({
        unknownItemCodeCount: unknownItemCodeMap.size,
        unknownItemCodeSample,
        parseFailureSample,
      })
    ),
  });

  return {
    ok: true,
    filename: file.name,
    totalDataRowsScanned: parsed.totalDataRowsScanned,
    skippedNoItemCode: parsed.skippedNoItemCode,
    duplicatesWithinFile: parsed.duplicatesWithinFile,
    parseFailureCount: parsed.parseFailures.length,
    parseFailureSample,
    unknownItemCodeCount: unknownItemCodeMap.size,
    unknownItemCodeSample,
    insertedCount,
    duplicateAgainstExistingCount,
    newTotalRowCount: newTotalRowCount ?? null,
  };
}

export async function getPurchaseRecordCount(): Promise<number | null> {
  await requireAdmin();
  const admin = createAdminClient();
  const { count } = await admin.from("purchase_records").select("*", { count: "exact", head: true });
  return count ?? null;
}

export async function getRecentImportLog(limit = 20) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("purchase_import_log")
    .select("id, filename, status, rows_read, rows_inserted, rows_duplicate, rows_skipped_no_item_code, rows_parse_failed, error, run_at, profiles(name)")
    .order("run_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
