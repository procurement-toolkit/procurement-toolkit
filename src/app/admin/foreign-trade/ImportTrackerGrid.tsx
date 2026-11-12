"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useEscapeClose } from "@/lib/use-escape-close";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTrackerViewTools } from "./useTrackerViewTools";
import type { FormatRow } from "@/lib/grid-format";
import { useAdminFullscreen } from "@/lib/admin-fullscreen";
import { TrackerColumnFilter, cellFilterText, type ColumnFilters } from "./TrackerColumnFilter";
import type {
  DepartmentOption,
  ForeignSupplierOption,
  ForeignTradeOrderRow,
  ForeignTradeOrderAuditLogRow,
  ForeignTradeReferenceRates,
} from "@/lib/actions/foreign-trade";
  import {
  updateForeignTradeOrderCell,
  resolveForeignTradeDepartmentByName,
  getForeignTradeOrderAuditLog,
  acknowledgeForeignTradeAnomaly,
} from "@/lib/actions/foreign-trade";
import {
  ANOMALY_LABEL,
  ackKey,
  checkCurrencyForSupplier,
  computeAnomalies,
  splitAnomalies,
  type Anomaly,
  type AnomalyAck,
  type AnomalyKind,
} from "@/lib/foreign-trade-anomaly";
import { FOREIGN_TRADE_PRIORITY_DEPARTMENTS } from "@/lib/foreign-trade-constants";
import { QuickAddRow } from "./QuickAddRow";
import { computeForeignTradeStatus, ftSeverity, compareCustomsRate, type FtSeverity } from "@/lib/foreign-trade-status";

const CURRENCY_OPTIONS = ["USD", "JPY", "EUR", "CNY", "KRW"] as const;

const BL_TRACKING_FALLBACK = "https://www.tradlinx.com/ko/tracking?type=bl";
const CARRIER_TRACKING_SLUGS: Record<string, string> = {
  one: "one",
  msc: "msc",
  maersk: "maersk",
  cosco: "cosco",
  "cma cgm": "cma-cgm",
  "cma-cgm": "cma-cgm",
  oocl: "oocl",
  "wan hai": "wan-hai",
  "hapag-lloyd": "hapag-lloyd",
  hapag: "hapag-lloyd",
  "yang ming": "yang-ming",
  zim: "zim",
  hmm: "hmm",
  kmtc: "kmtc",
  pil: "pil",
  sealand: "sealand",
  sitc: "sitc",
  rcl: "rcl",
  cnc: "cnc",
  anl: "anl",
  interasia: "interasia",
  sinokor: "sinokor",
  emirates: "emirates",
  "gold star": "gold-star",
  evergreen: "evergreen",
  "heung-a": "heung-a",
  "heung a": "heung-a",
  흥아: "heung-a",
  "sm line": "sm-line",
  sm상선: "sm-line",
  apl: "apl",
  namsung: "namsung",
  sinotrans: "sinotrans",
  "ck line": "ck-line",
  "pan ocean": "pan-ocean",
  팬오션: "pan-ocean",
  sealead: "sealead",
  dongjin: "dongjin",
  swire: "swire-shipping",
  westwood: "swire-shipping",
  dongyoung: "dongyoung",
  volta: "volta",
  "pan continental": "pan-continental",
  "ts lines": "ts-lines",
  taiyoung: "taiyoung",
  hansung: "hansung",
  한성: "hansung",
  kambara: "kambara-kisen",
  samudera: "samudera-shipping-line",
  turkon: "turkon-line",
  matson: "matson",
  arkas: "arkas-line",
};

function blTrackingUrl(shippingLine: string | null | undefined): string {
  const norm = (shippingLine ?? "").trim().toLowerCase();
  if (norm) {
    for (const [keyword, slug] of Object.entries(CARRIER_TRACKING_SLUGS)) {
      if (norm.includes(keyword)) return `https://www.tradlinx.com/ko/tracking/${slug}`;
    }
  }
  return BL_TRACKING_FALLBACK;
}

type ColType =
  | "date"
  | "number"
  | "text"
  | "boolean"
  | "customs_paid"
  | "department"
  | "currency"
  | "readonly"
  | "select"
  | "combobox";
type NumberUnit = "foreign" | "percent";

type GridColumn = {
  key: keyof ForeignTradeOrderRow;
  label: string;
  type: ColType;
  width: number;
  unit?: NumberUnit;
  // "select"(고정 선택지만) / "combobox"(선택지 + 직접입력) 전용.
  options?: string[];
};

type GridGroup = { label: string; columns: GridColumn[] };

// 2026-11-10, Kevin 요청(그리드 10개 변경사항) — 전체 배경은
// src/lib/foreign-trade-access.ts 근처 주석과 CLAUDE.md 참고. 핵심:
// 1) 통관 신고 상세/결제·송금 그룹 전체 삭제, 2) 발주정보에서 출항지/
// Incoterms만 남기고 나머지 삭제, 물류(마스터파일) 그룹 전체 삭제,
// 3) 관세혜택 → "FTA 적용/미적용" 선택형(실데이터 분포: FTA 22건/
// 미적용 51건), 4) 운송방법("두강/해상" 같은 합성 문자열, 실데이터로
// 확인됨) → 포워더 + 운송모드로 분리, 둘 다 선택형/직접입력,
// 5) 통관료율 이상치 알람 + 사유 칸(customs_rate_note, 신규 컬럼),
// 6) 식검은 그리드에서 삭제하고 거래처 단위 플래그로 전환(suppliers.
// requires_food_inspection, 신규 컬럼) — 해당 거래처 행에서만 거래처명
// 옆에 배지로 노출, 8) 완납여부 삭제, 9) 입고지 선택형(실데이터 분포:
// 본사/이천공장/하남마트/이천공장+하남마트), 10) 인수자 삭제(인수증
// 회수일로 대체).
const FORWARDER_OPTIONS = ["두강", "페덱스", "UPS", "DHL", "화동", "화동해운", "ASM", "RGS", "LSS", "SF", "EMS", "팀버라인"];
const TRANSPORT_MODE_OPTIONS = ["해상", "항공", "특송"];
const TARIFF_BENEFIT_OPTIONS = ["FTA", "미적용"];
const RECEIVING_LOCATION_OPTIONS = ["본사", "이천공장", "하남마트", "이천공장 / 하남마트"];

const INCOTERMS_OPTIONS = ["EXW", "FCA", "FOB", "FAS", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

const GROUPS: GridGroup[] = [
  {
    label: "기본정보",
    columns: [
      { key: "bl_no", label: "B/L No.", type: "text", width: 120 },
      { key: "currency", label: "통화", type: "currency", width: 72 },
      { key: "amount_foreign", label: "수입액(외화)", type: "number", width: 130, unit: "foreign" },
      { key: "amount_krw", label: "수입액(원화)", type: "number", width: 128 },
    ],
  },
  {
    label: "일정",
    columns: [
      { key: "pi_received_date", label: "PI 접수일자", type: "date", width: 110 },
      { key: "expense_voucher_planned_date", label: "지출결의서 예정일", type: "date", width: 120 },
      { key: "expense_voucher_processed_date", label: "지출결의서 처리", type: "date", width: 120 },
      { key: "payment_planned_date", label: "대금지급예정일", type: "date", width: 120 },
      { key: "payment_actual_date", label: "실제 송금일", type: "date", width: 110 },
      { key: "production_completed_date", label: "생산완료일", type: "date", width: 110 },
      { key: "etd", label: "ETD(예정)", type: "date", width: 100 },
      { key: "atd", label: "ATD(실제출항)", type: "date", width: 110 },
      { key: "eta", label: "ETA(예정)", type: "date", width: 100 },
      { key: "ata", label: "ATA(실제입항)", type: "date", width: 110 },
      { key: "warehouse_received_date", label: "입고일", type: "date", width: 100 },
    ],
  },
  {
    // 2026-11-10, Kevin 요청("서류체크와 일정 사이에 출항지와 인코텀즈") —
    // 일정 그룹과 서류 체크 그룹 사이로 이동. 출항지 선택지는 지금까지 입력된
    // 값에서 자주 쓴 순으로 채우고(직접입력 가능), Incoterms는 2020 표준 11종.
    label: "발주정보",
    columns: [
      { key: "departure_port", label: "출항지", type: "combobox", width: 110, options: [] },
      { key: "incoterms", label: "Incoterms", type: "combobox", width: 96, options: INCOTERMS_OPTIONS },
    ],
  },
  {
    label: "서류 체크",
    columns: [
      { key: "oqc_completed", label: "OQC", type: "boolean", width: 56 },
      { key: "ci_pi_received", label: "CI/PI", type: "boolean", width: 56 },
      { key: "bl_received", label: "BL", type: "boolean", width: 56 },
      { key: "cargo_insurance_arranged", label: "적하보험", type: "boolean", width: 64 },
      { key: "coo_received", label: "COO", type: "boolean", width: 56 },
    ],
  },
  {
    label: "통관·운송",
    columns: [
      { key: "forwarder", label: "포워더", type: "combobox", width: 100, options: FORWARDER_OPTIONS },
      { key: "transport_mode", label: "운송모드", type: "combobox", width: 90, options: TRANSPORT_MODE_OPTIONS },
      { key: "tariff_benefit", label: "FTA 적용/미적용", type: "select", width: 110, options: TARIFF_BENEFIT_OPTIONS },
      { key: "customs_vat", label: "부가세", type: "number", width: 108 },
      { key: "customs_duty", label: "관세", type: "number", width: 100 },
      { key: "customs_freight_fee", label: "운임·통관료", type: "number", width: 108 },
      { key: "customs_rate", label: "통관료율(%)", type: "number", width: 96, unit: "percent" },
      { key: "customs_rate_note", label: "통관요율 사유", type: "text", width: 140 },
      { key: "customs_total", label: "총통관료", type: "number", width: 108 },
      { key: "receiving_location", label: "입고지", type: "select", width: 110, options: RECEIVING_LOCATION_OPTIONS },
      { key: "document_filed_date", label: "서류정리", type: "date", width: 100 },
      { key: "handover_completed_date", label: "인수증 회수일", type: "date", width: 110 },
      { key: "customs_duty_vat_draft_date", label: "관부가세 기안일자", type: "date", width: 120 },
      { key: "customs_fee_draft_date", label: "통관수수료 기안일자", type: "date", width: 130 },
    ],
  },
  {
    label: "비고",
    columns: [
      // 2026-11-10, Kevin 요청: 더는 안 쓰는 note_2("Note_Wade") 컬럼 제거,
      // 비고(note) 칼럼을 그만큼 더 넓게.
      { key: "note", label: "비고", type: "text", width: 520 },
    ],
  },
];

const GROUP_ACCENT: Record<string, string> = { "기본정보": "212 70% 50%", "일정": "252 65% 55%", "서류 체크": "282 60% 55%", "통관·운송": "318 65% 55%", "발주정보": "192 65% 48%", "비고": "222 10% 50%" }; function groupTint(label: string, alpha: number) { return `hsl(${GROUP_ACCENT[label] ?? "222 10% 50%"} / ${alpha})`; } function groupBorder(label: string) { return `2px solid hsl(${GROUP_ACCENT[label] ?? "222 10% 50%"})`; } const COLUMN_BY_KEY = new Map<string, GridColumn>(GROUPS.flatMap((g) => g.columns.map((c) => [String(c.key), c] as const)));

const EMPTY_FILTERABLE_TYPES = new Set<ColType>(["date", "boolean", "customs_paid", "select"]);

function isEmptyCellValue(v: string | number | boolean | null, type: ColType): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (type === "boolean") return v === false;
  if (type === "customs_paid") return v === "X";
  return false;
}

// 2026-11-10, Kevin 요청("번호대로 몇번 줄의 발주건수를 봐라") — 맨 왼쪽에
// 번호(No.) 열을 고정해서 업무 협의 때 "42번 줄 확인해주세요"처럼 말할 수 있게 한다.
const STICKY_WIDTHS = { no: 54, dot: 32, poDate: 92, supplier: 140, batch: 118 };
const STICKY_LEFT = {
  no: 0,
  dot: STICKY_WIDTHS.no,
  poDate: STICKY_WIDTHS.no + STICKY_WIDTHS.dot,
  supplier: STICKY_WIDTHS.no + STICKY_WIDTHS.dot + STICKY_WIDTHS.poDate,
  batch: STICKY_WIDTHS.no + STICKY_WIDTHS.dot + STICKY_WIDTHS.poDate + STICKY_WIDTHS.supplier,
};
const STICKY_TOTAL =
  STICKY_WIDTHS.no + STICKY_WIDTHS.dot + STICKY_WIDTHS.poDate + STICKY_WIDTHS.supplier + STICKY_WIDTHS.batch;
const DETAIL_COL_WIDTH = 190;
const TOTAL_WIDTH =
  STICKY_TOTAL + GROUPS.reduce((s, g) => s + g.columns.reduce((s2, c) => s2 + c.width, 0), 0) + DETAIL_COL_WIDTH;

// 2026-11-10, Kevin 요청 — 거래처(정식 영문명)와 회차/PO#가 길어서 잘리던 칸. 글자 수에 맞춰 폰트를
// 줄이고(최대 2줄) 전부 보이게 한다. 마우스를 올리면 굵게(BOLD) 보인다.
function FitText({
  text,
  widthPx,
  base = 12,
  min = 7,
  className = "",
}: {
  text: string;
  widthPx: number;
  base?: number;
  min?: number;
  className?: string;
}) {
  const len = Math.max(text.length, 1);
  // 2줄에 들어가도록 글자 폭(대문자·영문 기준 약 0.68em, 굵게 보일 때 여유 포함)으로 크기를 계산한다.
  const size = Math.max(min, Math.min(base, (widthPx * 2) / (len * 0.68)));
  return (
    <span
      className={`block w-full min-w-0 cursor-default [overflow-wrap:anywhere] hover:font-bold ${className}`}
      style={{ fontSize: Math.round(size * 10) / 10, lineHeight: 1.1 }}
    >
      {text}
    </span>
  );
}

const GROUP_HEADER_HEIGHT = 26;
const FIELD_HEADER_HEIGHT = 28;
const ROW_HEIGHT = 30;
const TOTALS_ROW_HEIGHT = 30;

const SEVERITY_STRIPE: Record<FtSeverity, string> = {
  critical: "row-stripe-critical",
  warn: "row-stripe-warn",
  ok: "",
  done: "row-stripe-done",
};
const SEVERITY_DOT: Record<FtSeverity, string> = {
  critical: "bg-[var(--warn)]",
  warn: "bg-[var(--ft-soon)]",
  ok: "bg-[var(--line-strong)]",
  done: "bg-[var(--ft-done)]",
};
const SEVERITY_RANK: Record<FtSeverity, number> = { critical: 0, warn: 1, ok: 2, done: 3 };

function toInputValue(v: string | number | boolean | null): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function parseNumberPaste(text: string): string | null {
  const cleaned = text.replace(/,/g, "").trim();
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  return m[0];
}

function parseDatePaste(text: string): string | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

function formatNumberDisplay(value: string | number | boolean | null, unit: NumberUnit | undefined, rowCurrency: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  const formatted = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(n);
  if (unit === "percent") return `${formatted}%`;
  if (unit === "foreign") return rowCurrency ? `${formatted} ${rowCurrency}` : formatted;
  return formatted;
}

function EditableCell({
  orderId,
  field,
  type,
  value,
  width,
  unit,
  rowCurrency,
  departments,
  options,
  cellTint,
  trailingLink,
  hint,
  onSaved,
  onBeforeChange,
}: {
  orderId: string;
  field: string;
  type: ColType;
  value: string | number | boolean | null;
  width: number;
  unit?: NumberUnit;
  rowCurrency?: string | null;
  departments?: DepartmentOption[];
  options?: string[];
  cellTint?: string;
  trailingLink?: { href: string; title: string };
  hint?: string;
  onSaved: (field: string, value: string | number | boolean | null) => void;
  onBeforeChange?: (
    orderId: string,
    field: string,
    previousValue: string | number | boolean | null,
    newValue: string | number | boolean | null,
    type: ColType
  ) => void;
}) {
  const [draft, setDraft] = useState(toInputValue(value));
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deptCustomMode, setDeptCustomMode] = useState(false);
  const [, startTransition] = useTransition();

  // 값이 바깥에서 바뀌면(되돌리기, "평소 값으로 바꾸기" 등) 입력칸에도 반영.
  useEffect(() => {
    setDraft(toInputValue(value));
  }, [value]);

  function commit(raw: string | null, parsedForLocal: string | number | boolean | null) {
    onBeforeChange?.(orderId, field, value, parsedForLocal, type);
    setSaving(true);
    setErr(null);
    startTransition(async () => {
      const result = await updateForeignTradeOrderCell(orderId, field, raw);
      setSaving(false);
      if (result.ok) {
        onSaved(field, parsedForLocal);
      } else {
        setErr(result.error);
      }
    });
  }

  const outer = "shrink-0 border-l border-line";
  const base =
    "w-full border-0 bg-transparent px-1.5 py-1 text-[12px] outline-none focus:bg-bg-raised focus:ring-1 focus:ring-line-strong rounded";
  const cls = `${base} ${cellTint ?? ""} ${err ? "ring-1 ring-warn" : ""}`;

  if (type === "boolean") {
    return (
      <div style={{ width }} className={`${outer} flex items-center justify-center`} title={err ?? hint}>
        <input
          type="checkbox"
          checked={value === true}
          disabled={saving}
          onChange={(e) => {
            onSaved(field, e.target.checked);
            commit(e.target.checked ? "true" : "false", e.target.checked);
          }}
          onCopy={(e) => {
            e.preventDefault();
            e.clipboardData.setData("text/plain", value === true ? "TRUE" : "FALSE");
          }}
          onPaste={(e) => {
            e.preventDefault();
            const t = e.clipboardData.getData("text/plain").trim().toUpperCase();
            if (!["TRUE", "FALSE", "O", "X", "1", "0"].includes(t)) return;
            const v = t === "TRUE" || t === "O" || t === "1";
            onSaved(field, v);
            commit(v ? "true" : "false", v);
          }}
          className="h-3.5 w-3.5 accent-[var(--ft-done)]"
        />
      </div>
    );
  }

  if (type === "customs_paid") {
    return (
      <div style={{ width }} className={outer} title={err ?? hint}>
        <select
          value={(value as string | null) ?? ""}
          disabled={saving}
          onChange={(e) => {
            const v = e.target.value === "" ? null : (e.target.value as "O" | "X");
            onSaved(field, v);
            commit(e.target.value === "" ? null : e.target.value, v);
          }}
          onCopy={(e) => {
            e.preventDefault();
            e.clipboardData.setData("text/plain", (value as string | null) ?? "");
          }}
          onPaste={(e) => {
            e.preventDefault();
            const t = e.clipboardData.getData("text/plain").trim().toUpperCase();
            if (t !== "O" && t !== "X" && t !== "") return;
            const v = t === "" ? null : (t as "O" | "X");
            onSaved(field, v);
            commit(v, v);
          }}
          className={cls}
        >
          <option value="">-</option>
          <option value="O">O</option>
          <option value="X">X</option>
        </select>
      </div>
    );
  }

  if (type === "select") {
    const opts = options ?? [];
    const current = (value as string | null) ?? "";
    // 과거 자유 텍스트로 입력된 값이 선택지 목록에 없어도 사라지지 않도록
    // 현재 값을 선택지에 없으면 그대로 추가해서 보여준다.
    const allOptions = current && !opts.includes(current) ? [...opts, current] : opts;
    return (
      <div style={{ width }} className={outer} title={err ?? hint}>
        <select
          value={current}
          disabled={saving}
          onChange={(e) => {
            const v = e.target.value === "" ? null : e.target.value;
            onSaved(field, v);
            commit(v, v);
          }}
          onCopy={(e) => {
            e.preventDefault();
            e.clipboardData.setData("text/plain", current);
          }}
          className={cls}
        >
          <option value="">-</option>
          {allOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "combobox") {
    const listId = `dl-${field}-${orderId}`;
    return (
      <div style={{ width }} className={outer} title={err ?? hint}>
        <input
          type="text"
          list={listId}
          value={draft}
          disabled={saving}
          title={!focused && draft.trim() !== "" ? draft : undefined}
          onFocus={() => setFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false);
            const trimmed = draft.trim();
            const raw = trimmed === "" ? null : trimmed;
            if (toInputValue(value) === draft) return;
            commit(raw, raw);
          }}
          onCopy={(e) => {
            e.preventDefault();
            e.clipboardData.setData("text/plain", toInputValue(value));
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            const trimmed = text.trim();
            const raw = trimmed === "" ? null : trimmed;
            setDraft(trimmed);
            commit(raw, raw);
          }}
          className={`${cls} min-w-0 ${!focused ? "truncate" : ""}`}
        />
        <datalist id={listId}>
          {(options ?? []).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
    );
  }

  if (type === "currency") {
    return (
      <div style={{ width }} className={outer} title={err ?? hint}>
        <select
          value={(value as string) ?? "USD"}
          disabled={saving}
          onChange={(e) => {
            onSaved(field, e.target.value);
            commit(e.target.value, e.target.value);
          }}
          onCopy={(e) => {
            e.preventDefault();
            e.clipboardData.setData("text/plain", (value as string) ?? "USD");
          }}
          onPaste={(e) => {
            e.preventDefault();
            const t = e.clipboardData.getData("text/plain").trim().toUpperCase();
            if (!(CURRENCY_OPTIONS as readonly string[]).includes(t)) return;
            onSaved(field, t);
            commit(t, t);
          }}
          className={cls}
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "department") {
    const list = departments ?? [];
    const currentName = list.find((d) => d.id === value)?.name ?? "";

    async function resolveAndCommit(name: string) {
      const trimmed = name.trim();
      if (!trimmed) {
        commit(null, null);
        return;
      }
      if (trimmed === currentName) return;
      setSaving(true);
      setErr(null);
      const result = await resolveForeignTradeDepartmentByName(trimmed);
      setSaving(false);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      commit(result.id, result.id);
    }

    if (deptCustomMode) {
      return (
        <div style={{ width }} className={outer} title={err ?? hint}>
          <input
            autoFocus
            defaultValue={currentName}
            disabled={saving}
            placeholder="부서명 직접입력"
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setDeptCustomMode(false);
            }}
            onBlur={(e) => {
              setDeptCustomMode(false);
              void resolveAndCommit(e.target.value);
            }}
            className={cls}
          />
        </div>
      );
    }

    return (
      <div style={{ width }} className={`${outer} flex items-center gap-0.5 px-1`} title={err ?? hint}>
        {FOREIGN_TRADE_PRIORITY_DEPARTMENTS.map((name) => (
          <button
            key={name}
            type="button"
            disabled={saving}
            onClick={() => resolveAndCommit(name)}
            title={name}
            className={`shrink-0 rounded px-1 py-0.5 text-[10px] leading-none ${
              currentName === name ? "bg-[var(--ft-done)] text-white" : "border border-line text-ink-faint active:bg-bg-sunken"
            }`}
          >
            {name === "마트(물류센터)" ? "마트" : name === "공장자재팀" ? "공장" : "건설"}
          </button>
        ))}
        <button
          type="button"
          disabled={saving}
          onClick={() => setDeptCustomMode(true)}
          title={currentName && !(FOREIGN_TRADE_PRIORITY_DEPARTMENTS as readonly string[]).includes(currentName) ? currentName : "직접입력"}
          className={`min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[10px] leading-none ${
            currentName && !(FOREIGN_TRADE_PRIORITY_DEPARTMENTS as readonly string[]).includes(currentName)
              ? "text-ink-soft underline underline-offset-2"
              : "text-ink-faint"
          }`}
        >
          {currentName && !(FOREIGN_TRADE_PRIORITY_DEPARTMENTS as readonly string[]).includes(currentName)
            ? currentName
            : "기타"}
        </button>
      </div>
    );
  }

  if (type === "number") {
    const displayValue = focused ? draft : formatNumberDisplay(value, unit, rowCurrency);
    return (
      <div style={{ width }} className={outer} title={err ?? hint}>
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          disabled={saving}
          onFocus={() => {
            setFocused(true);
            setDraft(toInputValue(value));
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false);
            const trimmed = draft.trim();
            const raw = trimmed === "" ? null : trimmed;
            const parsedForLocal: number | null = raw === null ? null : Number(raw);
            if (toInputValue(value) === draft) return;
            commit(raw, parsedForLocal);
          }}
          onCopy={(e) => {
            e.preventDefault();
            e.clipboardData.setData("text/plain", value === null || value === undefined ? "" : String(value));
          }}
          onPaste={(e) => {
            e.preventDefault();
            const raw = parseNumberPaste(e.clipboardData.getData("text/plain"));
            if (raw === null) return;
            setDraft(raw);
            commit(raw, Number(raw));
          }}
          className={`${cls} text-right tabular-nums`}
        />
      </div>
    );
  }

  if (type === "date") {
    const isEmpty = draft.trim() === "";
    return (
      <div style={{ width }} className={outer} title={err ?? hint}>
        <input
          type="date"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim();
            const raw = trimmed === "" ? null : trimmed;
            if (toInputValue(value) === draft) return;
            commit(raw, raw);
          }}
          onCopy={(e) => {
            e.preventDefault();
            e.clipboardData.setData("text/plain", toInputValue(value));
          }}
          onPaste={(e) => {
            e.preventDefault();
            const raw = parseDatePaste(e.clipboardData.getData("text/plain"));
            if (raw === null) return;
            setDraft(raw);
            commit(raw, raw);
          }}
          className={`${cls} ${isEmpty ? "text-ink-faint/50" : "font-medium text-ink"}`}
        />
      </div>
    );
  }

  return (
    <div style={{ width }} className={`${outer} flex items-stretch`} title={err ?? hint}>
      <input
        type="text"
        value={draft}
        disabled={saving}
        title={!focused && draft.trim() !== "" ? draft : undefined}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          const trimmed = draft.trim();
          const raw = trimmed === "" ? null : trimmed;
          if (toInputValue(value) === draft) return;
          commit(raw, raw);
        }}
        onCopy={(e) => {
          e.preventDefault();
          e.clipboardData.setData("text/plain", toInputValue(value));
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          const trimmed = text.trim();
          const raw = trimmed === "" ? null : trimmed;
          setDraft(trimmed);
          commit(raw, raw);
        }}
        className={`${cls} min-w-0 ${!focused ? "truncate" : ""}`}
      />
      {trailingLink && draft.trim() !== "" && (
        <a
          href={trailingLink.href}
          target="_blank"
          rel="noopener noreferrer"
          title={trailingLink.title}
          className="flex shrink-0 items-center px-1 text-trace hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          ↗
        </a>
      )}
    </div>
  );
}

// 2026-11-10, Kevin 요청 항목6: 식검은 거래처 단위 플래그(suppliers.
// requires_food_inspection)로 전환했지만, "그 발주가 실제로 식검을
// 받았는지"는 여전히 발주 건 단위 값(food_inspection_completed)이라
// 거래처명 옆에 작은 체크 배지로 남겨둔다 — 전체 열에서는 빠지고 해당
// 거래처 발주 건에서만 보인다.
function FoodInspectionBadge({
  orderId,
  checked,
  onSaved,
}: {
  orderId: string;
  checked: boolean;
  onSaved: (value: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <label
      title="식검 대상 거래처 — 식검 완료 여부"
      className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold leading-none ${
        checked ? "bg-[var(--ft-done)] text-white" : "border border-[var(--warn)] text-[var(--warn)]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        className="sr-only"
        onChange={(e) => {
          const v = e.target.checked;
          onSaved(v);
          setSaving(true);
          startTransition(async () => {
            await updateForeignTradeOrderCell(orderId, "food_inspection_completed", v ? "true" : "false");
            setSaving(false);
          });
        }}
      />
      식검{checked ? "✓" : ""}
    </label>
  );
}

// 2026-11-10, Kevin 요청 항목7(수정로그) — 셀 하나당 전용 모달을 새로
// 만드는 대신, "상세" 열의 작은 버튼으로 열리는 가벼운 팝오버로 처리한다.
// 처음 열 때만 서버에서 불러오고(그 뒤로는 캐시), 로그 자체는
// updateForeignTradeOrderCell 쪽에서 best-effort로 기록된다.
function AuditLogButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ForeignTradeOrderAuditLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows === null) {
      setLoading(true);
      void getForeignTradeOrderAuditLog(orderId).then((r) => {
        setRows(r);
        setLoading(false);
      });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="pressable rounded px-1.5 py-1 text-[11px] text-ink-faint underline underline-offset-2 hover:text-ink-soft"
      >
        로그
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-line bg-bg-raised p-2 text-left text-[11px] shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-ink-soft">수정로그</span>
            <button type="button" onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink-soft">
              ✕
            </button>
          </div>
          {loading && <div className="text-ink-faint">불러오는 중…</div>}
          {!loading && rows && rows.length === 0 && <div className="text-ink-faint">수정 내역이 없습니다</div>}
          {!loading && rows && rows.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <li key={r.id} className="border-b border-line pb-1 last:border-0">
                  <div className="font-medium text-ink-soft">
                    {r.field.startsWith("anomaly_ack:")
                      ? `이상값 확인 · ${ANOMALY_LABEL[r.field.slice("anomaly_ack:".length) as AnomalyKind] ?? r.field}`
                      : COLUMN_BY_KEY.get(r.field)?.label ?? r.field}
                  </div>
                  <div className="truncate text-ink-faint" title={`${r.old_value ?? "-"} → ${r.new_value ?? "-"}`}>
                    {r.old_value ?? "-"} → {r.new_value ?? "-"}
                  </div>
                  <div className="text-[10px] text-ink-faint/70">
                    {new Date(r.changed_at).toLocaleString("ko-KR")}
                    {r.changed_by_name ? ` · ${r.changed_by_name}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// 2026-11-10, Kevin 요청("기존 거래선이 쓰던 통화·기간·방법과 다른 걸 입력하면
// 바로 알람, 알람 후의 상황도") — 알람 이후의 처리 흐름을 한 곳에 모은 패널.
// 셀을 저장한 직후 평소와 다른 값이 생기면 자동으로 열리고, 행 번호 옆 ⚠
// 버튼으로도 열 수 있다. 처리 방법은 둘: (1) 평소 값으로 바꾸기, (2) 사유를
// 적고 "정상 확인" — 확인 기록은 DB에 남고(누가·언제·왜), 같은 값이면 다시
// 울리지 않으며, 값이 또 바뀌면 다시 알람이 뜬다.
const CATEGORY_REASON_PRESETS = ["거래조건이 바뀜", "이번 건만 예외", "입력값 확인함"];
const LEAD_REASON_PRESETS = ["선사 일정 지연", "통관 지연", "이번 건만 예외", "입력값 확인함"];

function AnomalyPanel({
  orderId,
  rowNo,
  supplierName,
  batchNo,
  open,
  acked,
  fresh,
  onClose,
  onApplyUsual,
  onAck,
}: {
  orderId: string;
  rowNo: number;
  supplierName: string;
  batchNo: string | null;
  open: Anomaly[];
  acked: { anomaly: Anomaly; ack: AnomalyAck }[];
  fresh: boolean;
  onClose: () => void;
  onApplyUsual: (a: Anomaly) => void;
  onAck: (a: Anomaly, reason: string) => Promise<string | null>;
}) {
  useEscapeClose(true, onClose);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(a: Anomaly) {
    const reason = (reasons[a.kind] ?? "").trim();
    if (reason.length < 2) {
      setError("사유를 2자 이상 적어주세요");
      return;
    }
    setError(null);
    setBusyKind(a.kind);
    const err = await onAck(a, reason);
    setBusyKind(null);
    if (err) setError(err);
  }

  return (
    <div
      role="dialog"
      aria-label="평소와 다른 입력 확인"
      className="fixed bottom-4 right-4 z-[60] flex max-h-[70vh] w-[min(420px,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto rounded-xl border-2 border-warn bg-bg-raised p-3 text-[12px] shadow-xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-ink">
            {open.length > 0
              ? fresh
                ? "방금 입력한 값이 평소와 달라요"
                : "평소와 다른 값이 있어요"
              : "이상값 확인 이력"}
          </div>
          <div className="truncate text-[11px] text-ink-faint">
            {rowNo}번 줄 · {supplierName}
            {batchNo ? ` · ${batchNo}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="pressable shrink-0 rounded px-1.5 py-0.5 text-ink-faint hover:text-ink-soft"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {open.length > 0 && (
        <ul className="flex flex-col gap-2">
          {open.map((a) => {
            const presets = a.kind.startsWith("lead_") ? LEAD_REASON_PRESETS : CATEGORY_REASON_PRESETS;
            const inputId = `anom-reason-${orderId}-${a.kind}`;
            return (
              <li key={a.kind} className="flex flex-col gap-1.5 rounded-lg border border-line bg-bg-sunken p-2">
                <div className="font-semibold text-[var(--warn)]">⚠ {ANOMALY_LABEL[a.kind]}</div>
                <p className="leading-snug text-ink-soft">{a.message}</p>
                {a.usualValue && (
                  <button
                    type="button"
                    onClick={() => onApplyUsual(a)}
                    className="pressable self-start rounded border border-line-strong px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-bg-raised"
                  >
                    평소 값({a.usualValue})으로 바꾸기
                  </button>
                )}
                <div className="flex flex-wrap gap-1">
                  {presets.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setReasons((prev) => ({ ...prev, [a.kind]: t }))}
                      className="pressable rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-faint hover:bg-bg-raised"
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    id={inputId}
                    value={reasons[a.kind] ?? ""}
                    onChange={(e) => setReasons((prev) => ({ ...prev, [a.kind]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submit(a);
                      }
                    }}
                    placeholder="정상으로 보는 사유"
                    className="h-7 min-w-0 flex-1 rounded border border-line bg-bg-raised px-2 text-[12px] outline-none focus:border-line-strong"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    disabled={busyKind === a.kind}
                    onClick={() => void submit(a)}
                    className="pressable btn-fto shrink-0 rounded px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
                  >
                    {busyKind === a.kind ? "저장 중…" : "정상 확인"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {acked.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-2">
          {acked.map(({ anomaly, ack }) => (
            <li key={anomaly.kind} className="text-[11px] leading-snug text-ink-faint">
              <span className="font-medium text-ink-soft">✓ {ANOMALY_LABEL[anomaly.kind]}</span> — 정상 확인: {ack.reason}
              <span className="text-ink-faint/70">
                {" "}
                · {ack.acked_by_name ?? "담당자"} · {new Date(ack.acked_at).toLocaleDateString("ko-KR")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <div className="text-[11px] text-red-600">{error}</div>}
    </div>
  );
}

type SortKey = string;

export function ImportTrackerGrid({
  orders,
  departments,
  refRates,
  onOpenDetail,
  foodInspectionSupplierCodes,
  suppliers,
  currencyBySupplier,
  defaultYear,
  allOrders,
  acks,
}: {
  orders: ForeignTradeOrderRow[];
  departments: DepartmentOption[];
  refRates: ForeignTradeReferenceRates | null;
  onOpenDetail: (orderId: string) => void;
  // 2026-11-10, Kevin 요청 항목6: 식검 대상 거래처 코드 목록 — 이 목록에
  // 있는 거래처의 발주 건에서만 거래처명 옆에 식검 배지를 보여준다.
  foodInspectionSupplierCodes?: Set<string>;
  // 2026-11-10, Kevin 요청("엑셀처럼 행추가") — 맨 아래 빠른 추가 행에 쓰는
  // 거래처 목록 / 거래처별 최근 통화 / 현재 연도 탭.
  suppliers: ForeignSupplierOption[];
  currencyBySupplier: Record<string, "USD" | "JPY" | "EUR" | "CNY" | "KRW">;
  defaultYear: number;
  // 이상값 판단은 연도 탭과 무관하게 "그 거래처의 전체 이력"과 비교해야 해서
  // 전체 발주 건과 지금까지의 정상 확인 기록을 따로 받는다.
  allOrders: ForeignTradeOrderRow[];
  acks: AnomalyAck[];
}) {
  const [overrides, setOverrides] = useState<Record<string, Partial<ForeignTradeOrderRow>>>({});
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("po_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [emptyOnlyKey, setEmptyOnlyKey] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<FtSeverity | null>(null);
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [colFilters, setColFilters] = useState<ColumnFilters>({});
  const [panel, setPanel] = useState<{ orderId: string; fresh: boolean } | null>(null);
  const [localAcks, setLocalAcks] = useState<Record<string, AnomalyAck>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // 전체화면 상태는 모든 화면이 함께 쓴다(오른쪽 위 공통 단추와 같은 상태, Esc로 돌아오는 처리도 거기서 한다)
  const [fullscreen, setFullscreen] = useAdminFullscreen();
  function toggleFullscreen() {
    setFullscreen(!fullscreen);
  }

  const merged = useMemo(
    () => orders.map((o) => ({ ...o, ...(overrides[o.id] ?? {}) }) as ForeignTradeOrderRow),
    [orders, overrides]
  );

  const enriched = useMemo(
    () =>
      merged.map((o) => {
        const status = computeForeignTradeStatus({
          po_date: o.po_date,
          pi_received_date: o.pi_received_date,
          expense_voucher_planned_date: o.expense_voucher_planned_date,
          expense_voucher_processed_date: o.expense_voucher_processed_date,
          payment_planned_date: o.payment_planned_date,
          payment_actual_date: o.payment_actual_date,
          etd: o.etd,
          atd: o.atd,
          eta: o.eta,
          ata: o.ata,
          warehouse_received_date: o.warehouse_received_date,
          customs_paid: o.customs_paid,
          document_filed_date: o.document_filed_date,
          handover_completed_date: o.handover_completed_date,
        });
        return { order: o, severity: ftSeverity(status), nextLabel: status.next?.detail ?? "완료" };
      }),
    [merged]
  );

  // 번호(No.): 이 연도 안에서 발주일이 빠른 순서대로 1, 2, 3… (같은 날은 회차 순).
  // 기본 정렬이 최신순이라 맨 위 번호가 곧 그 해의 발주 건수가 된다.
  // 거래처명이 정식 영문명으로 바뀌어도 예전 한글명(해외업체 DB의 한글명)으로 검색되게 한다.
  const koNameBySupplier = useMemo(() => {
    const m = new Map<string, string>();
    for (const sp of suppliers) if (sp.name_ko) m.set(sp.code, sp.name_ko);
    return m;
  }, [suppliers]);

  const { rowNoById, supplierSeqById, supplierTotalById } = useMemo(() => {
    const sorted = [...merged].sort(
      (a, b) =>
        a.po_date.localeCompare(b.po_date) ||
        (a.batch_no ?? "").localeCompare(b.batch_no ?? "", "ko", { numeric: true }) ||
        a.id.localeCompare(b.id)
    );
    const rowNo = new Map<string, number>();
    const seq = new Map<string, number>();
    const totals = new Map<string, number>();
    const perSupplier = new Map<string, number>();
    const keyOf = (o: ForeignTradeOrderRow) => o.supplier_code ?? o.supplier_name;
    for (const o of sorted) perSupplier.set(keyOf(o), (perSupplier.get(keyOf(o)) ?? 0) + 1);
    const running = new Map<string, number>();
    sorted.forEach((o, i) => {
      rowNo.set(o.id, i + 1);
      const k = keyOf(o);
      const n = (running.get(k) ?? 0) + 1;
      running.set(k, n);
      seq.set(o.id, n);
      totals.set(o.id, perSupplier.get(k) ?? n);
    });
    return { rowNoById: rowNo, supplierSeqById: seq, supplierTotalById: totals };
  }, [merged]);

  // 이상값: 전체 이력과 비교하되, 방금 고친 셀(overrides)을 바로 반영한다.
  const ackMap = useMemo(() => {
    const m = new Map<string, AnomalyAck>();
    for (const a of acks) m.set(ackKey(a.order_id, a.kind), a);
    for (const [k, a] of Object.entries(localAcks)) m.set(k, a);
    return m;
  }, [acks, localAcks]);

  const allMerged = useMemo(
    () => allOrders.map((o) => (overrides[o.id] ? ({ ...o, ...overrides[o.id] } as ForeignTradeOrderRow) : o)),
    [allOrders, overrides]
  );

  const anomalyView = useMemo(() => {
    const all = computeAnomalies(allMerged);
    const open = new Map<string, Anomaly[]>();
    const acked = new Map<string, { anomaly: Anomaly; ack: AnomalyAck }[]>();
    for (const [id, list] of all) {
      const split = splitAnomalies(list, id, ackMap);
      if (split.open.length) open.set(id, split.open);
      if (split.acked.length) acked.set(id, split.acked);
    }
    return { open, acked };
  }, [allMerged, ackMap]);

  const anomalyOrderCount = useMemo(() => {
    let n = 0;
    for (const o of orders) if (anomalyView.open.has(o.id)) n++;
    return n;
  }, [orders, anomalyView]);

  // 셀을 저장한 직후에만(불러올 때 이미 있던 이상값은 제외) 새로 생긴 이상값이
  // 있으면 패널을 자동으로 연다.
  const pendingCheckRef = useRef<Set<string>>(new Set());
  const prevOpenKeysRef = useRef<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    const pending = pendingCheckRef.current;
    if (pending.size > 0) {
      for (const id of pending) {
        const cur = anomalyView.open.get(id) ?? [];
        const prev = prevOpenKeysRef.current.get(id) ?? new Set<string>();
        if (cur.some((a) => !prev.has(`${a.kind}:${a.value}`))) {
          setPanel({ orderId: id, fresh: true });
          break;
        }
      }
      pending.clear();
    }
    const next = new Map<string, Set<string>>();
    for (const [id, list] of anomalyView.open) next.set(id, new Set(list.map((a) => `${a.kind}:${a.value}`)));
    prevOpenKeysRef.current = next;
  }, [anomalyView]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleEmptyOnly(key: string) {
    setEmptyOnlyKey((cur) => (cur === key ? null : key));
  }

  function toggleSeverityFilter(s: FtSeverity) {
    setSeverityFilter((cur) => (cur === s ? null : s));
  }

  // 2026-11-10, Kevin 피드백("이런 설명이 어디 나와 있지? 물음표 마크라도
  // 넣어서 커서가 가면 설명이 보이게끔이라도 해둬야지") — 정렬/필터/검색을
  // 한 번에 기본값(발주일 최신순, 필터 해제, 검색어 비움)으로 되돌리는 버튼.
  function resetView() {
    setSortKey("po_date");
    setSortDir("desc");
    setSeverityFilter(null);
    setEmptyOnlyKey(null);
    setAnomalyOnly(false);
    setQuery("");
  }

  const severityCounts = useMemo(() => {
    const counts: Record<FtSeverity, number> = { critical: 0, warn: 0, ok: 0, done: 0 };
    for (const { severity } of enriched) counts[severity]++;
    return counts;
  }, [enriched]);

  const compareByColumnKey = useCallback(
    (a: ForeignTradeOrderRow, b: ForeignTradeOrderRow, key: string): number => {
      const col = COLUMN_BY_KEY.get(key);
      const type = col?.type ?? "text";
      const av = a[key as keyof ForeignTradeOrderRow] as string | number | boolean | null;
      const bv = b[key as keyof ForeignTradeOrderRow] as string | number | boolean | null;
      if (type === "number") {
        const an = typeof av === "number" ? av : -Infinity;
        const bn = typeof bv === "number" ? bv : -Infinity;
        return an - bn;
      }
      if (type === "boolean") return (av === true ? 1 : 0) - (bv === true ? 1 : 0);
      if (type === "customs_paid") {
        const rank = (v: unknown) => (v === "O" ? 1 : v === "X" ? 0 : -1);
        return rank(av) - rank(bv);
      }
      if (type === "department") {
        const an = departments.find((d) => d.id === av)?.name ?? "";
        const bn = departments.find((d) => d.id === bv)?.name ?? "";
        return an.localeCompare(bn, "ko");
      }
      return String(av ?? "").localeCompare(String(bv ?? ""), "ko", { numeric: true });
    },
    [departments]
  );

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    // "#12" = 12번 줄, "#10-20" = 10~20번 줄.
    const rowQuery = /^#\s*(\d+)(?:\s*[-~]\s*(\d+))?$/.exec(q);
    let filtered = rowQuery
      ? enriched.filter(({ order: o }) => {
          const no = rowNoById.get(o.id) ?? -1;
          const a = Number(rowQuery[1]);
          const b = rowQuery[2] ? Number(rowQuery[2]) : a;
          return no >= Math.min(a, b) && no <= Math.max(a, b);
        })
      : q
      ? enriched.filter(
          ({ order: o }) =>
            o.supplier_name.toLowerCase().includes(q) ||
            (o.supplier_code ? (koNameBySupplier.get(o.supplier_code) ?? "").toLowerCase().includes(q) : false) ||
            (o.batch_no ?? "").toLowerCase().includes(q) ||
            (o.bl_no ?? "").toLowerCase().includes(q)
        )
      : enriched;
    if (emptyOnlyKey) {
      const type = COLUMN_BY_KEY.get(emptyOnlyKey)?.type ?? "date";
      filtered = filtered.filter(({ order: o }) =>
        isEmptyCellValue(o[emptyOnlyKey as keyof ForeignTradeOrderRow] as string | number | boolean | null, type)
      );
    }
    for (const [fk, fv] of Object.entries(colFilters)) {
      if (fv.length === 0) continue;
      const allowed = new Set(fv);
      filtered = filtered.filter(({ order: o }) => allowed.has(cellFilterText((o as unknown as Record<string, unknown>)[fk])));
    }
    if (severityFilter) {
      filtered = filtered.filter(({ severity }) => severity === severityFilter);
    }
    if (anomalyOnly) {
      filtered = filtered.filter(({ order: o }) => anomalyView.open.has(o.id));
    }
    const sign = sortDir === "asc" ? 1 : -1;
    const withIndex = filtered.map((row, i) => ({ row, i }));
    withIndex.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "next_action") {
        cmp = SEVERITY_RANK[a.row.severity] - SEVERITY_RANK[b.row.severity];
      } else {
        cmp = compareByColumnKey(a.row.order, b.row.order, sortKey);
      }
      if (cmp === 0) cmp = a.i - b.i;
      return cmp * sign;
    });
    return withIndex.map((w) => w.row);
  }, [enriched, query, sortKey, sortDir, emptyOnlyKey, severityFilter, anomalyOnly, colFilters, anomalyView, rowNoById, compareByColumnKey]);

  // 2026-11-11, Kevin 요청(엑셀 기능을 수입진행표에도): 확대·축소, 색칠, 칸 범위 선택·복사, 선택 통계, 엑셀 내보내기, 단축키 도움말, 보기 초기화
  const trackerColumns = useMemo(() => GROUPS.flatMap((g) => g.columns.map((c) => ({ key: String(c.key), label: String(c.label), type: String(c.type) }))), []);
  const trackerOrders = useMemo(() => enriched.map((e) => e.order as unknown as Record<string, unknown>), [enriched]);
  const trackerRowIds = useMemo(() => filteredSorted.map((r) => r.order.id), [filteredSorted]);
  const tools = useTrackerViewTools({
    columns: trackerColumns,
    stickyCount: 5,
    rowIds: trackerRowIds,
    bulk: {
      getValue: (id, k) => {
        const o = filteredSorted.find((r) => r.order.id === id)?.order as unknown as Record<string, unknown> | undefined;
        const v = o ? o[k] : null;
        return v === undefined ? null : (v as string | number | boolean | null);
      },
      save: (id, k, raw) => updateForeignTradeOrderCell(id, k, raw),
      commitLocal: (id, k, v) => handleSaved(id, k, v),
      pushGroup: (recs) => {
        const g = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
        for (const r of recs) undoStackRef.current.push({ orderId: r.orderId, field: r.field, previousValue: r.previousValue, newValue: r.newValue, type: r.type as ColType, group: g });
        while (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
        redoStackRef.current = [];
      },
      pushFormat: (before, after) => {
        undoStackRef.current.push({ orderId: "", field: "", previousValue: null, newValue: null, type: "text" as ColType, fmt: { before, after } });
        while (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
        redoStackRef.current = [];
      },
    },
    onSortColumn: (key, dir) => {
      setSortKey(key);
      setSortDir(dir);
    },
    getRows: () =>
      filteredSorted.map(({ order: o }) => ({
        id: o.id,
        text: (k: string) => {
          const v = (o as unknown as Record<string, unknown>)[k];
          return v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Y" : "") : String(v);
        },
      })),
    onReset: () => {
      setQuery("");
      setEmptyOnlyKey(null);
      setSeverityFilter(null);
      setAnomalyOnly(false);
      setColFilters({});
      setSortKey("po_date");
      setSortDir("desc");
    },
  });

  const columnTotals = useMemo(() => {
    const krwTotals: Record<string, number> = {};
    const foreignTotals: Record<string, Record<string, number>> = {};
    for (const g of GROUPS) {
      for (const c of g.columns) {
        if (c.type !== "number" || c.unit === "percent") continue;
        const key = String(c.key);
        if (c.unit === "foreign") {
          const byCurrency: Record<string, number> = {};
          for (const { order: o } of filteredSorted) {
            const v = o[c.key] as number | null;
            if (typeof v === "number") byCurrency[o.currency] = (byCurrency[o.currency] ?? 0) + v;
          }
          foreignTotals[key] = byCurrency;
        } else {
          let sum = 0;
          let has = false;
          for (const { order: o } of filteredSorted) {
            const v = o[c.key] as number | null;
            if (typeof v === "number") {
              sum += v;
              has = true;
            }
          }
          if (has) krwTotals[key] = sum;
        }
      }
    }
    return { krwTotals, foreignTotals };
  }, [filteredSorted]);

  const rowVirtualizer = useVirtualizer({
    count: filteredSorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  function handleSaved(orderId: string, field: string, value: string | number | boolean | null) {
    setOverrides((prev) => ({ ...prev, [orderId]: { ...prev[orderId], [field]: value } }));
  }

  const UNDO_LIMIT = 400;
  type EditRecord = {
    orderId: string;
    field: string;
    previousValue: string | number | boolean | null;
    newValue: string | number | boolean | null;
    type: ColType;
    group?: string;
    // 서식 변경 기록(되돌리기 때 DB의 서식을 이전 상태로 돌린다). 이 경우 위의 칸 값 필드는 쓰지 않는다.
    fmt?: { before: FormatRow[]; after: FormatRow[] };
  };
  const undoStackRef = useRef<EditRecord[]>([]);
  const redoStackRef = useRef<EditRecord[]>([]);

  function recordEdit(
    orderId: string,
    field: string,
    previousValue: string | number | boolean | null,
    newValue: string | number | boolean | null,
    type: ColType
  ) {
    undoStackRef.current.push({ orderId, field, previousValue, newValue, type });
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    redoStackRef.current = [];
  }

  function toRawValue(v: string | number | boolean | null, type: ColType): string | null {
    if (v === null || v === "") return null;
    if (type === "boolean") return v ? "true" : "false";
    return String(v);
  }

  function applyEditValue(orderId: string, field: string, v: string | number | boolean | null, type: ColType) {
    handleSaved(orderId, field, v);
    void updateForeignTradeOrderCell(orderId, field, toRawValue(v, type));
  }

  function handleUndo() {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    const batch = [entry];
    while (entry.group && undoStackRef.current.length > 0 && undoStackRef.current[undoStackRef.current.length - 1].group === entry.group) {
      batch.push(undoStackRef.current.pop() as EditRecord);
    }
    for (const b of batch) {
      redoStackRef.current.push(b);
      if (b.fmt) void tools.applyFormatRows(b.fmt.before);
      else applyEditValue(b.orderId, b.field, b.previousValue, b.type);
    }
    while (redoStackRef.current.length > UNDO_LIMIT) redoStackRef.current.shift();
  }

  function handleRedo() {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    const batch = [entry];
    while (entry.group && redoStackRef.current.length > 0 && redoStackRef.current[redoStackRef.current.length - 1].group === entry.group) {
      batch.push(redoStackRef.current.pop() as EditRecord);
    }
    for (const b of batch) {
      undoStackRef.current.push(b);
      if (b.fmt) void tools.applyFormatRows(b.fmt.after);
      else applyEditValue(b.orderId, b.field, b.newValue, b.type);
    }
    while (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
  }

  function handleApplyUsual(orderId: string, a: Anomaly) {
    if (!a.usualValue) return;
    const type = COLUMN_BY_KEY.get(a.field)?.type ?? "text";
    const current = merged.find((o) => o.id === orderId)?.[a.field as keyof ForeignTradeOrderRow] as
      | string
      | number
      | boolean
      | null
      | undefined;
    recordEdit(orderId, a.field, current ?? null, a.usualValue, type);
    applyEditValue(orderId, a.field, a.usualValue, type);
  }

  async function handleAck(orderId: string, a: Anomaly, reason: string): Promise<string | null> {
    const res = await acknowledgeForeignTradeAnomaly({
      orderId,
      kind: a.kind,
      valueSnapshot: a.value,
      reason,
    });
    if (!res.ok) return res.error;
    setLocalAcks((prev) => ({ ...prev, [ackKey(orderId, a.kind)]: res.ack as AnomalyAck }));
    return null;
  }

  // 출항지 선택지: 지금까지 입력된 값을 많이 쓴 순으로(직접입력도 계속 가능).
  const departurePortOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of allOrders) {
      const v = (o.departure_port ?? "").trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([v]) => v);
  }, [allOrders]);

  function currencyWarning(supplierCode: string, supplierName: string, currency: string): string | null {
    return checkCurrencyForSupplier(allMerged, { code: supplierCode, name: supplierName }, currency);
  }

  function paymentTint(o: ForeignTradeOrderRow): string | undefined {
    if (o.payment_actual_date) return undefined;
    if (o.payment_planned_date) return "cell-ft-yellow";
    return undefined;
  }
  function noteTint(v: string | null): string | undefined {
    return v && v.trim() ? "cell-ft-pink" : undefined;
  }

  // 2026-11-10, Kevin 요청 항목5: 통관요율이 "이전과 비교해서" 비정상이면
  // 알람. OrderForm.tsx가 이미 쓰는 compareCustomsRate()(같은 거래처 과거
  // 건들 평균 대비 몇 % 차이인지)를 그대로 재사용해서 두 화면의 판단
  // 기준을 통일한다 — 비교대상(본인 제외 history)이 0건이면
  // compareCustomsRate가 null을 반환해 판단하지 않는다.
  const customsRateHistoryBySupplier = useMemo(() => {
    const bySupplier = new Map<string, { id: string; rate: number }[]>();
    for (const o of merged) {
      if (typeof o.customs_rate === "number" && o.supplier_code) {
        const arr = bySupplier.get(o.supplier_code) ?? [];
        arr.push({ id: o.id, rate: o.customs_rate });
        bySupplier.set(o.supplier_code, arr);
      }
    }
    return bySupplier;
  }, [merged]);

  const ANOMALY_THRESHOLD_PCT = 35;

  function customsRateAnomalyHint(o: ForeignTradeOrderRow): string | undefined {
    if (typeof o.customs_rate !== "number" || !o.supplier_code) return undefined;
    const historyExcludingSelf = (customsRateHistoryBySupplier.get(o.supplier_code) ?? [])
      .filter((r) => r.id !== o.id)
      .map((r) => r.rate);
    const comparison = compareCustomsRate(o.customs_rate, historyExcludingSelf);
    if (!comparison || Math.abs(comparison.diffPct) < ANOMALY_THRESHOLD_PCT) return undefined;
    return `⚠ ${comparison.label} — 사유를 적어두면 좋습니다`;
  }

  const panelOrder = panel ? merged.find((o) => o.id === panel.orderId) : undefined;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col gap-1.5 overflow-auto bg-bg p-3 pr-12"
          : "flex flex-col gap-1.5"
      }
    >
      {/* 2026-11-10, Kevin 요청("최대한 위로 붙여서 셀들이 더 보이게") — 환율 바,
          지연/임박 바, 검색 줄 세 줄이던 것을 검색+칩 한 줄, 환율+범례 한 줄로 압축. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <input
          id="ft-grid-search"
          type="text"
          autoComplete="off"
          name="ft-grid-search-q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="거래처·회차·B/L 검색 (#12 = 12번 줄)"
          title={"거래처명, Batch No., B/L No.로 검색합니다.\n번호로 찾으려면 #12 (12번 줄), #10-20 (10~20번 줄)처럼 입력하세요."}
          className="w-60 rounded-lg border border-line bg-bg-sunken px-2.5 py-1 text-[12px] outline-none focus:border-line-strong"
        />
        <span
          className="rounded-md bg-bg-sunken px-2 py-1 text-[12px] font-semibold tabular-nums text-ink-soft"
          title="맨 왼쪽 No. 열의 번호는 발주일이 빠른 순서대로 매겨집니다. 기본 정렬(최신순)에서는 맨 위 번호가 그 해의 발주 건수예요."
        >
          {defaultYear}년 {orders.length}건
          {filteredSorted.length !== orders.length ? ` · 표시 ${filteredSorted.length}건` : ""}
        </span>
      </div>

      {tools.renderRibbon({
        onUndo: handleUndo,
        onRedo: handleRedo,
        onNewRow: () => {
          // 새 행 입력 줄(QuickAddRow)은 이 표식 바로 다음에 있다
          const anchor = document.getElementById("ft-quick-add");
          const row = anchor?.nextElementSibling as HTMLElement | null;
          (row ?? anchor)?.scrollIntoView({ block: "center", behavior: "smooth" });
          window.setTimeout(() => row?.querySelector<HTMLElement>("input, select")?.focus(), 250);
        },
        fullscreen,
        onFullscreen: toggleFullscreen,
        onResetView: resetView,
        columnFilter: <TrackerColumnFilter columns={trackerColumns} orders={trackerOrders} filters={colFilters} onChange={setColFilters} />,
        onClearFilters: () => {
          setColFilters({});
          setSeverityFilter(null);
          setAnomalyOnly(false);
          setEmptyOnlyKey(null);
        },
        extras: (
          <>
        {severityCounts.critical > 0 && (
          <button
            type="button"
            onClick={() => toggleSeverityFilter("critical")}
            className={`pressable rounded-full border px-2 py-0.5 font-medium transition ${
              severityFilter === "critical"
                ? "border-[var(--warn)] bg-[var(--warn)] text-white"
                : "border-[var(--warn)] text-[var(--warn)] active:bg-bg-raised"
            }`}
            title="지연(예정일 지남) 건만 보기"
          >
            지연 {severityCounts.critical}건
          </button>
        )}
        {severityCounts.warn > 0 && (
          <button
            type="button"
            onClick={() => toggleSeverityFilter("warn")}
            className={`pressable rounded-full border px-2 py-0.5 font-medium transition ${
              severityFilter === "warn"
                ? "border-[var(--ft-soon)] bg-[var(--ft-soon)] text-white"
                : "border-[var(--ft-soon)] text-[var(--ft-soon)] active:bg-bg-raised"
            }`}
            title="임박(3일 이내 예정) 건만 보기"
          >
            임박 {severityCounts.warn}건
          </button>
        )}
        {anomalyOrderCount > 0 && (
          <button
            type="button"
            onClick={() => setAnomalyOnly((v) => !v)}
            className={`pressable rounded-full border px-2 py-0.5 font-medium transition ${
              anomalyOnly
                ? "border-[var(--warn)] bg-[var(--warn)] text-white"
                : "border-[var(--warn)] text-[var(--warn)] active:bg-bg-raised"
            }`}
            title="통화·운송모드·기간이 그 거래처의 평소와 다른 건만 보기 (행 번호 옆 ⚠를 누르면 처리할 수 있어요)"
          >
            ⚠ 평소와 다름 {anomalyOrderCount}건
          </button>
        )}
        {(severityFilter || anomalyOnly) && (
          <button
            type="button"
            onClick={() => {
              setSeverityFilter(null);
              setAnomalyOnly(false);
            }}
            className="pressable rounded-full border border-line px-2 py-0.5 text-ink-faint active:bg-bg-raised"
          >
            필터 해제
          </button>
        )}
        {emptyOnlyKey && (
          <>
            <span className="text-ink-faint">{COLUMN_BY_KEY.get(emptyOnlyKey)?.label ?? emptyOnlyKey} 미완료만 보는 중</span>
            <button
              type="button"
              onClick={() => setEmptyOnlyKey(null)}
              className="pressable rounded-full border border-line px-2 py-0.5 text-ink-faint active:bg-bg-raised"
            >
              해제
            </button>
          </>
        )}
          <button
            type="button"
            title={
              "이 그리드 사용법\n\n" +
              "● 맨 왼쪽 No.: 발주일 빠른 순 번호. 검색창에 #12 → 12번 줄, #10-20 → 10~20번 줄만 보입니다.\n" +
              "● No. 옆 점 색: 빨강=지연(예정일 지남) / 주황=임박(3일 이내) / 회색=정상 / 초록=완료\n" +
              "● 점 열(●) 머리글을 클릭하면 '다음 할 일이 급한 순'으로 정렬됩니다.\n" +
              "● ⚠: 통화·운송모드·출항지·Incoterms·기간이 그 거래처의 평소(과거 이력)와 다르면 표시됩니다. ⚠를 누르면 '평소 값으로 바꾸기' 또는 사유를 적고 '정상 확인'을 할 수 있어요.\n\n" +
              "정렬: 각 열 머리글을 클릭 — 그 열로 정렬, 다시 클릭하면 오름/내림차순 전환.\n" +
              "필터: 위 '지연/임박/평소와 다름' 칩을 클릭하면 해당 건만 보입니다. 다시 클릭하거나 '필터 해제'로 해제.\n" +
              "초기화: '보기 초기화' 버튼을 누르면 정렬·필터·검색이 모두 기본값(발주일 최신순)으로 돌아갑니다."
            }
            className="pressable flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line-strong text-[10px] font-bold text-ink-soft hover:bg-bg-sunken"
            aria-label="그리드 사용법 도움말"
          >
            ?
          </button>
          </>
        ),
      })}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
        {refRates && (
          <span
            className="flex flex-wrap items-center gap-x-2.5"
            title="참고용(외부 공개 환율) — 통관·회계 신고 시엔 각 발주 건에 그 시점 고시환율을 직접 입력하세요."
          >
            <span className="font-semibold text-ink-soft">참고 환율</span>
            <span>
              USD <span className="font-medium tabular-nums text-ink-soft">{refRates.usdKrw.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</span>
            </span>
            <span>
              JPY(100) <span className="font-medium tabular-nums text-ink-soft">{refRates.jpy100Krw.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</span>
            </span>
            <span>
              EUR <span className="font-medium tabular-nums text-ink-soft">{refRates.eurKrw.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</span>
            </span>
            <span>
              CNY <span className="font-medium tabular-nums text-ink-soft">{refRates.cnyKrw.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</span>
            </span>
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span className="flex items-center gap-1" title="예정일이 지난 건 — 바로 확인이 필요합니다">
            <span className={`inline-block h-2 w-2 rounded-full ${SEVERITY_DOT.critical}`} />
            지연
          </span>
          <span className="flex items-center gap-1" title="3일 이내로 예정된 건">
            <span className={`inline-block h-2 w-2 rounded-full ${SEVERITY_DOT.warn}`} />
            임박
          </span>
          <span className="flex items-center gap-1" title="아직 여유가 있는 건">
            <span className={`inline-block h-2 w-2 rounded-full ${SEVERITY_DOT.ok}`} />
            정상
          </span>
          <span className="flex items-center gap-1" title="모든 절차가 끝난 건">
            <span className={`inline-block h-2 w-2 rounded-full ${SEVERITY_DOT.done}`} />
            완료
          </span>
          <span className="text-line-strong">·</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm cell-ft-purple border border-line" />
            통관비 완납
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm cell-ft-yellow border border-line" />
            송금 예정
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm cell-ft-pink border border-line" />
            비고 있음
          </span>
          <span className="flex items-center gap-1" title="그 거래처의 평소 통화·운송모드·기간과 다른 값">
            <span className="inline-block h-2 w-2 rounded-sm cell-ft-yellow border border-warn" />
            평소와 다름 ⚠
          </span>
        </span>
      </div>

      <div style={{ zoom: tools.zoom }}>
      <div
        ref={scrollRef}
        {...tools.containerProps}
        onKeyDown={(e) => {
          const key = e.key.toLowerCase();
          const mod = e.ctrlKey || e.metaKey;
          if (mod && !e.shiftKey && key === "z") {
            e.preventDefault();
            handleUndo();
          } else if ((mod && e.shiftKey && key === "z") || (mod && key === "y")) {
            e.preventDefault();
            handleRedo();
          }
        }}
        className="overflow-x-auto overflow-y-auto rounded-xl border border-line bg-bg-raised"
        style={{ maxHeight: fullscreen ? "calc((100vh - 96px) / " + tools.zoom + ")" : "calc((100vh - 230px) / " + tools.zoom + ")", minHeight: 360 }}
      >
        <div style={{ width: TOTAL_WIDTH }}>
          <div
            className="sticky top-0 z-20 flex border-b border-line bg-bg-sunken"
            style={{ height: GROUP_HEADER_HEIGHT }}
          >
            <div style={{ width: STICKY_TOTAL }} className="sticky left-0 z-30 shrink-0 bg-bg-sunken" />
            {GROUPS.map((g) => (
              <div
                key={g.label}
                style={{ width: g.columns.reduce((s, c) => s + c.width, 0), background: groupTint(g.label, 0.14), borderBottom: groupBorder(g.label) }}
                className="flex shrink-0 items-center justify-center border-l border-line px-2 text-center text-[10px] font-bold uppercase tracking-wide text-ink-faint/80"
              >
                {g.label}
              </div>
            ))}
            <div style={{ width: DETAIL_COL_WIDTH }} className="shrink-0 border-l border-line" />
          </div>
          <div
            className="sticky z-20 flex border-b border-line bg-bg-sunken text-[10.5px] font-semibold text-ink-faint"
            style={{ top: GROUP_HEADER_HEIGHT, height: FIELD_HEADER_HEIGHT }}
          >
            <button
              type="button"
              onClick={() => toggleSort("po_date")}
              style={{ width: STICKY_WIDTHS.no, left: STICKY_LEFT.no }}
              className="sticky z-30 shrink-0 border-r border-line bg-bg-sunken px-1 py-1.5 text-center"
              title="번호는 발주일이 빠른 순서대로 매겨집니다. 클릭하면 발주일 순으로 정렬돼요. 검색창에 #12 → 12번 줄."
            >
              No.
            </button>
            <button
              type="button"
              onClick={() => toggleSort("next_action")}
              style={{ width: STICKY_WIDTHS.dot, left: STICKY_LEFT.dot }}
              className="sticky z-30 shrink-0 border-r border-line bg-bg-sunken"
              title="다음 할 일 순 정렬 (빨강=지연·주황=임박·회색=정상·초록=완료). 되돌리려면 발주일 머리글을 다시 클릭하거나 위의 '보기 초기화' 버튼을 누르세요."
            >
              ●
            </button>
            <button
              type="button"
              onClick={() => toggleSort("po_date")}
              style={{ width: STICKY_WIDTHS.poDate, left: STICKY_LEFT.poDate }}
              className="sticky z-30 shrink-0 border-r border-line bg-bg-sunken px-1.5 py-1.5 text-left"
            >
              발주일 {sortKey === "po_date" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </button>
            <button
              type="button"
              onClick={() => toggleSort("supplier_name")}
              style={{ width: STICKY_WIDTHS.supplier, left: STICKY_LEFT.supplier }}
              className="sticky z-30 shrink-0 border-r border-line bg-bg-sunken px-1.5 py-1.5 text-left"
            >
              거래처 {sortKey === "supplier_name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </button>
            <button
              type="button"
              onClick={() => toggleSort("batch_no")}
              style={{ width: STICKY_WIDTHS.batch, left: STICKY_LEFT.batch }}
              className="sticky z-30 shrink-0 border-r border-line bg-bg-sunken px-1.5 py-1.5 text-left"
            >
              회차/PO# {sortKey === "batch_no" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </button>
            {GROUPS.flatMap((g) =>
              g.columns.map((c) => {
                const key = String(c.key);
                const canEmptyFilter = EMPTY_FILTERABLE_TYPES.has(c.type); return ( <div key={key} style={{ width: c.width, background: groupTint(g.label, 0.06) }}
                    className="flex shrink-0 items-center gap-0.5 border-l border-line px-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      title={`${c.label} 정렬`}
                      className="min-w-0 flex-1 truncate text-left hover:text-ink-soft"
                    >
                      {c.label} {sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </button>
                    {canEmptyFilter && (
                      <button
                        type="button"
                        onClick={() => toggleEmptyOnly(key)}
                        title={`${c.label} 미완료만 보기`}
                        className={`shrink-0 rounded px-0.5 leading-none ${
                          emptyOnlyKey === key ? "text-accent-ink" : "text-ink-faint/60 hover:text-ink-faint"
                        }`}
                      >
                        ▽
                      </button>
                    )}
                  </div>
                );
              })
            )}
            <div style={{ width: DETAIL_COL_WIDTH }} className="flex shrink-0 items-center border-l border-line px-1.5">
              상세
            </div>
          </div>

          <div style={{ position: "relative", height: rowVirtualizer.getTotalSize(), width: TOTAL_WIDTH }}>
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const { order: o, severity, nextLabel } = filteredSorted[vRow.index];
              const rowNo = rowNoById.get(o.id) ?? 0;
              const rowOpenAnoms = anomalyView.open.get(o.id);
              const rowAckedAnoms = anomalyView.acked.get(o.id);
              const anomalyByField = rowOpenAnoms
                ? Object.fromEntries(rowOpenAnoms.map((a) => [a.field, a.message]))
                : undefined;
              return (
                <div
                  key={o.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: TOTAL_WIDTH,
                    height: ROW_HEIGHT,
                    transform: `translateY(${vRow.start}px)`,
          ...tools.rowStyle(o.id),
                  }}
                  data-order-id={o.id}
        className={`flex border-b border-line hover:bg-bg-sunken ${SEVERITY_STRIPE[severity]}`}
                >
                  <div
                    style={{ width: STICKY_WIDTHS.no, left: STICKY_LEFT.no, ...tools.rowStyle(o.id) }}
                    className="sticky z-10 flex shrink-0 items-center justify-end gap-0.5 border-r border-line bg-bg-raised px-1 text-[11px] tabular-nums text-ink-faint"
                    title={`${rowNo}번 줄 — 검색창에 #${rowNo} 를 입력하면 이 줄만 볼 수 있어요`}
                  >
                    {rowOpenAnoms ? (
                      <button
                        type="button"
                        onClick={() => setPanel({ orderId: o.id, fresh: false })}
                        className="pressable rounded px-0.5 text-[12px] leading-none text-[var(--warn)]"
                        title={`평소와 다른 값 ${rowOpenAnoms.length}건 — 눌러서 확인/처리`}
                        aria-label="평소와 다른 값 확인"
                      >
                        ⚠
                      </button>
                    ) : rowAckedAnoms ? (
                      <button
                        type="button"
                        onClick={() => setPanel({ orderId: o.id, fresh: false })}
                        className="pressable rounded px-0.5 text-[11px] leading-none text-ink-faint/70"
                        title="평소와 다른 값을 정상으로 확인한 이력 보기"
                        aria-label="이상값 확인 이력"
                      >
                        ✓
                      </button>
                    ) : null}
                    <span>{rowNo}</span>
                  </div>
                  <div
                    style={{ width: STICKY_WIDTHS.dot, left: STICKY_LEFT.dot, ...tools.rowStyle(o.id) }}
                    className="sticky z-10 flex shrink-0 items-center justify-center border-r border-line bg-bg-raised"
                    title={nextLabel}
                  >
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_DOT[severity]}`} />
                  </div>
                  <div
                    style={{ width: STICKY_WIDTHS.poDate, left: STICKY_LEFT.poDate, ...tools.rowStyle(o.id) }}
                    className="sticky z-10 flex shrink-0 items-center border-r border-line bg-bg-raised px-1.5 text-[12px] text-ink-soft"
                  >
                    {new Date(o.po_date).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                  </div>
                  <div
                    style={{ width: STICKY_WIDTHS.supplier, left: STICKY_LEFT.supplier, ...tools.rowStyle(o.id) }}
                    className="sticky z-10 flex shrink-0 items-center gap-1 border-r border-line bg-bg-raised px-1.5 text-[12px] font-medium"
                    title={`${o.supplier_name} · 이 거래처 ${defaultYear}년 ${supplierSeqById.get(o.id) ?? 1}번째 / 총 ${supplierTotalById.get(o.id) ?? 1}건`}
                  >
                    <FitText
                      text={o.supplier_name}
                      widthPx={STICKY_WIDTHS.supplier - 12 - (o.supplier_code && foodInspectionSupplierCodes?.has(o.supplier_code) ? 24 : 0)}
                      className="flex-1"
                    />
                    {o.supplier_code && foodInspectionSupplierCodes?.has(o.supplier_code) && (
                      <FoodInspectionBadge
                        orderId={o.id}
                        checked={o.food_inspection_completed === true}
                        onSaved={(v) => handleSaved(o.id, "food_inspection_completed", v)}
                      />
                    )}
                  </div>
                  <div
                    style={{ width: STICKY_WIDTHS.batch, left: STICKY_LEFT.batch, ...tools.rowStyle(o.id) }}
                    className="sticky z-10 flex shrink-0 items-center border-r border-line bg-bg-raised px-1.5 text-[12px] text-ink-soft"
                    title={o.batch_no ?? undefined}
                  >
                    <FitText text={o.batch_no ?? "-"} widthPx={STICKY_WIDTHS.batch - 12} />
                  </div>

                  {GROUPS.flatMap((g) =>
                    g.columns.map((c) => {
                      let tint: string | undefined;
                      if (c.key === "payment_actual_date" || c.key === "payment_planned_date") tint = paymentTint(o);
                      if (c.key === "note") tint = noteTint(o[c.key] as string | null);
                      const trailingLink =
                        c.key === "bl_no"
                          ? { href: blTrackingUrl(o.shipping_line), title: "선사 화물 추적 페이지 열기" }
                          : undefined;
                      const fmtRate = (n: number) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(n);
                      let hint: string | undefined;
                      if (c.key === "amount_krw" && o.exchange_rate != null) {
                        hint = `매매기준환율: ${fmtRate(o.exchange_rate)}`;
                      } else if (c.key === "customs_rate") {
                        const anomaly = customsRateAnomalyHint(o);
                        if (anomaly) {
                          hint = anomaly;
                          tint = "cell-ft-yellow";
                        }
                      }
                      const flagged = anomalyByField?.[String(c.key)];
                      if (flagged) {
                        hint = `⚠ ${flagged}`;
                        tint = "cell-ft-yellow ring-1 ring-inset ring-warn";
                      }
                      return (
                        <EditableCell
                          key={String(c.key)}
                          orderId={o.id}
                          field={String(c.key)}
                          type={c.type}
                          value={o[c.key] as string | number | boolean | null}
                          width={c.width}
                          unit={c.unit}
                          hint={hint}
                          rowCurrency={o.currency}
                          departments={departments}
                          options={c.key === "departure_port" ? departurePortOptions : c.options}
                          cellTint={tools.cellTint(o.id, String(c.key), tint)}
                          trailingLink={trailingLink}
                          onSaved={(field, value) => {
                            pendingCheckRef.current.add(o.id);
                            handleSaved(o.id, field, value);
                          }}
                          onBeforeChange={recordEdit}
                        />
                      );
                    })
                  )}
                  <div
                    style={{ width: DETAIL_COL_WIDTH }}
                    className="flex shrink-0 items-center justify-center gap-1 border-l border-line"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenDetail(o.id)}
                      className="pressable rounded px-1.5 py-1 text-[11px] text-trace underline underline-offset-2"
                    >
                      품목/PO
                    </button>
                    <a
                      href={`/admin/foreign-trade/${o.id}/po-document`}
                      target="_blank"
                      rel="noreferrer"
                      title="발주서 Excel 다운로드"
                      className="pressable rounded px-1.5 py-1 text-[11px] text-trace underline underline-offset-2"
                    >
                      발주서↓
                    </a>
                    <AuditLogButton orderId={o.id} />
                  </div>
                </div>
              );
            })}
          </div>

          <div id="ft-quick-add" />
          <QuickAddRow
            suppliers={suppliers}
            currencyBySupplier={currencyBySupplier}
            defaultYear={defaultYear}
            currencyWarning={currencyWarning}
          />

          <div
            className="sticky bottom-0 z-20 flex border-t-2 border-line bg-bg-sunken text-[11px] font-semibold text-ink-soft"
            style={{ height: TOTALS_ROW_HEIGHT }}
          >
            <div
              style={{ width: STICKY_TOTAL }}
              className="sticky left-0 z-30 flex shrink-0 items-center justify-end border-r border-line bg-bg-sunken px-2"
            >
              합계 ({filteredSorted.length}건)
            </div>
            {GROUPS.flatMap((g) =>
              g.columns.map((c) => {
                const key = String(c.key);
                let text = "";
                if (c.type === "number" && c.unit !== "percent") {
                  if (c.unit === "foreign") {
                    const byCurrency = columnTotals.foreignTotals[key] ?? {};
                    text = Object.entries(byCurrency)
                      .map(([cur, sum]) => `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(sum)} ${cur}`)
                      .join(" / ");
                  } else if (columnTotals.krwTotals[key] !== undefined) {
                    text = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(columnTotals.krwTotals[key]);
                  }
                }
                return (
                  <div
                    key={key}
                    style={{ width: c.width }}
                    className="flex shrink-0 items-center justify-end border-l border-line px-1.5 tabular-nums" title={text || undefined}> <span className="min-w-0 truncate">{text}</span>
                  </div>
                );
              })
            )}
            <div style={{ width: DETAIL_COL_WIDTH }} className="shrink-0 border-l border-line" />
          </div>
        </div>
      </div>

      </div>

      {panel && panelOrder && (
        <AnomalyPanel
          key={`${panel.orderId}:${panel.fresh ? "f" : "n"}`}
          orderId={panel.orderId}
          rowNo={rowNoById.get(panel.orderId) ?? 0}
          supplierName={panelOrder.supplier_name}
          batchNo={panelOrder.batch_no}
          open={anomalyView.open.get(panel.orderId) ?? []}
          acked={anomalyView.acked.get(panel.orderId) ?? []}
          fresh={panel.fresh}
          onClose={() => setPanel(null)}
          onApplyUsual={(a) => handleApplyUsual(panel.orderId, a)}
          onAck={(a, reason) => handleAck(panel.orderId, a, reason)}
        />
      )}
    </div>
  );
}
