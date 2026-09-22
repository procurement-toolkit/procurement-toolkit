import "server-only";
import ExcelJS from "exceljs";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Parses a raw "구매현황" (Purchase Status) xlsx export from E-Count ERP
// (Self-Customizing > 구매관리현황 > 구매현황, warehouse M2000/자재창고
// (이천공장)) into rows ready to insert into `purchase_records`.
//
// This MUST replicate, byte-for-byte in its hashing behavior, the original
// Python pipeline used for the 2023-2026 historical backfill
// (/tmp/fixed/build_rows.py + build_inserts2.py, sandbox-local, not part of
// this repo) — otherwise newly uploaded rows that overlap already-loaded
// history would compute a different row_hash and insert as spurious
// duplicates instead of being caught by `on conflict (row_hash) do nothing`.
// See migration 0011_purchase_records.sql for the schema this feeds.
//
// Known, deliberate quirk being replicated: the original pipeline computed
// every amount field (qty/unit_price/supply_amount/vat_amount/total_amount)
// as a Python `float`, then hashed `str(that float)` — which always renders
// a whole number with a trailing ".0" (`str(float(20))` == `"20.0"`, not
// `"20"`). JavaScript's `Number.prototype.toString()` omits that trailing
// zero, so `pyFloatStr()` below restores it. Fractional values are assumed
// to render identically in both languages (both use a shortest-round-trip
// decimal algorithm for the digit sequence) — true for every real value
// seen in this data (currency amounts well within safe-integer range) but
// worth re-checking if a future export ever contains scientific-notation-
// range numbers.
// ---------------------------------------------------------------------------

const DATE_SEQ_RE = /^(\d{4})\/(\d{2})\/(\d{2})-(\d+)$/;

const EXPECTED_HEADER = [
  "월/일",
  "전자결재일자-No.",
  "품목코드",
  "품명 및 규격",
  "수량",
  "단가",
  "공급가액",
  "부가세",
  "합 계",
  "구매처명",
  "부서명",
  "적요",
];

export interface ParsedPurchaseRow {
  item_code: string;
  item_name: string;
  purchase_date: string; // YYYY-MM-DD
  voucher_seq: number;
  qty: number;
  unit_price: number;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  supplier_name: string;
  department: string | null;
  note: string | null;
  source_year: number;
  row_hash: string;
}

export interface ParseFailure {
  excelRow: number;
  reason: string;
  raw: string | null;
}

export interface ParseOutcome {
  ok: true;
  rows: ParsedPurchaseRow[]; // deduped by row_hash within this one file
  totalDataRowsScanned: number;
  skippedNoItemCode: number;
  duplicatesWithinFile: number;
  parseFailures: ParseFailure[];
}

export interface ParseError {
  ok: false;
  error: string;
}

function pyFloatStr(n: number): string {
  if (Number.isInteger(n)) return `${n}.0`;
  return String(n);
}

function cellToRawString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    }
    if ("text" in value) {
      const text = (value as { text?: unknown }).text;
      return text === null || text === undefined ? null : String(text);
    }
    if ("result" in value) {
      const result = (value as { result?: unknown }).result;
      return result === null || result === undefined ? null : String(result);
    }
    if (value instanceof Date) return value.toISOString();
    return null;
  }
  return String(value);
}

// Trims like Python's str(x).strip(), but — matching the original script —
// only when the cell is non-null. A non-null cell that trims to "" stays ""
// (not null); only a genuinely blank cell becomes null.
function cellToTrimmedStringOrNull(value: ExcelJS.CellValue): string | null {
  const raw = cellToRawString(value);
  return raw === null ? null : raw.trim();
}

function cellToNumber(value: ExcelJS.CellValue): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    const n = Number(result);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function computeRowHash(r: {
  purchase_date: string;
  voucher_seq: number;
  item_code: string;
  item_name: string;
  qty: number;
  unit_price: number;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  supplier_name: string;
  department: string | null;
  note: string | null;
}): string {
  const parts = [
    r.purchase_date,
    String(r.voucher_seq),
    r.item_code,
    r.item_name,
    pyFloatStr(r.qty),
    pyFloatStr(r.unit_price),
    pyFloatStr(r.supply_amount),
    pyFloatStr(r.vat_amount),
    pyFloatStr(r.total_amount),
    r.supplier_name,
    r.department === null ? "None" : r.department,
    r.note === null ? "None" : r.note,
  ];
  const full = createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
  return full.slice(0, 16);
}

export async function parsePurchaseStatusWorkbook(buffer: ArrayBuffer): Promise<ParseOutcome | ParseError> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (e) {
    return { ok: false, error: `엑셀 파일을 읽을 수 없습니다: ${e instanceof Error ? e.message : String(e)}` };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { ok: false, error: "워크시트를 찾을 수 없습니다." };
  }
  if (worksheet.rowCount < 3) {
    return { ok: false, error: "데이터 행이 없습니다 — 제목/헤더 행만 있거나 빈 파일입니다." };
  }

  // Row 1: title row (e.g. "회사명 : ... / 자재창고(이천공장) / 2026/01/01 ~ ...") — skipped.
  // Row 2: header row — validated against the known 구매현황 export column order.
  const headerRow = worksheet.getRow(2);
  const actualHeader = EXPECTED_HEADER.map((_, i) => cellToTrimmedStringOrNull(headerRow.getCell(i + 1).value) ?? "");
  const headerMatches = EXPECTED_HEADER.every((col, i) => actualHeader[i] === col);
  if (!headerMatches) {
    return {
      ok: false,
      error:
        `2번째 행(헤더)이 예상한 구매현황 양식과 다릅니다. ` +
        `예상: [${EXPECTED_HEADER.join(", ")}] / 실제: [${actualHeader.join(", ")}]. ` +
        `E-Count 구매관리현황 > 구매현황에서 내려받은 원본 파일인지 확인해주세요.`,
    };
  }

  const parseFailures: ParseFailure[] = [];
  const rowsByHash = new Map<string, ParsedPurchaseRow>();
  let totalDataRowsScanned = 0;
  let skippedNoItemCode = 0;
  let duplicatesWithinFile = 0;

  for (let rowNumber = 3; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    // ExcelJS 1-indexes columns; col A (index 0 in the Python tuple) is column 1 here.
    const c0 = cellToTrimmedStringOrNull(row.getCell(1).value); // 월/일 (date-seq)
    const c2 = cellToTrimmedStringOrNull(row.getCell(3).value); // 품목코드
    const c3 = cellToTrimmedStringOrNull(row.getCell(4).value); // 품명 및 규격
    const c4 = row.getCell(5).value; // 수량
    const c5 = row.getCell(6).value; // 단가
    const c6 = row.getCell(7).value; // 공급가액
    const c7 = row.getCell(8).value; // 부가세
    const c8 = row.getCell(9).value; // 합계
    const c9 = cellToTrimmedStringOrNull(row.getCell(10).value); // 구매처명
    const c10 = cellToTrimmedStringOrNull(row.getCell(11).value); // 부서명
    const c11 = cellToTrimmedStringOrNull(row.getCell(12).value); // 적요

    // A fully blank row (no item code, no date) past the last real data row —
    // don't count it as a scanned data row at all.
    if (c2 === null && c0 === null && c3 === null) continue;

    totalDataRowsScanned++;

    if (c2 === null) {
      // Subtotal/total/footer row — item_code is always populated on real
      // purchase lines in this export.
      skippedNoItemCode++;
      continue;
    }

    const m = c0 !== null ? DATE_SEQ_RE.exec(c0) : null;
    if (!m) {
      parseFailures.push({ excelRow: rowNumber, reason: "월/일 컬럼이 YYYY/MM/DD-N 형식이 아닙니다", raw: c0 });
      continue;
    }
    const [, y, mo, d, seqStr] = m;
    const purchase_date = `${y}-${mo}-${d}`;
    const voucher_seq = parseInt(seqStr, 10);
    const item_code = c2;
    const item_name = c3 ?? "";
    const qty = cellToNumber(c4);
    const unit_price = cellToNumber(c5);
    const supply_amount = cellToNumber(c6);
    const vat_amount = cellToNumber(c7);
    const total_amount = cellToNumber(c8);
    const supplier_name = c9 ?? "";
    const department = c10;
    const note = c11;
    const source_year = Number(y);

    const row_hash = computeRowHash({
      purchase_date,
      voucher_seq,
      item_code,
      item_name,
      qty,
      unit_price,
      supply_amount,
      vat_amount,
      total_amount,
      supplier_name,
      department,
      note,
    });

    if (rowsByHash.has(row_hash)) {
      duplicatesWithinFile++;
      continue;
    }

    rowsByHash.set(row_hash, {
      item_code,
      item_name,
      purchase_date,
      voucher_seq,
      qty,
      unit_price,
      supply_amount,
      vat_amount,
      total_amount,
      supplier_name,
      department,
      note,
      source_year,
      row_hash,
    });
  }

  return {
    ok: true,
    rows: Array.from(rowsByHash.values()),
    totalDataRowsScanned,
    skippedNoItemCode,
    duplicatesWithinFile,
    parseFailures,
  };
}
