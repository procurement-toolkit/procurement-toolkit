"use client";

// 2026-11-10, Kevin 요청(수입마스터파일 구현) — 수출입 품목대장. "HK 입출고 대장_Ver.5"처럼 품목 한 줄씩,
// 엑셀 열 순서 그대로 보여주고 칸을 더블클릭해 바로 고친다. 과거 데이터는 엑셀 파일을 올려서 한꺼번에 가져온다
// (브라우저에서 읽어 300행씩 보내므로 파일 크기 제한에 걸리지 않는다). 수입진행표와는 별개 문서.
// 2026-11-11, Kevin 요청(엑셀 사용자에게 친숙하게 + 실수·사고·지연 방지) — 엑셀식 편의기능 추가:
//   전체화면, 확대/축소, 칸·범위 선택(드래그·Shift·방향키), 복사·잘라내기·붙여넣기(엑셀과 서로 가능), 아래로 채우기(Ctrl+D),
//   행 추가·복제·삭제, 되돌리기/다시 실행(Ctrl+Z / Ctrl+Y), 행·칸 색 지정, 머리글 클릭 정렬, 열 숨김,
//   그리고 엑셀에는 없는 "점검" — 날짜 순서 오류·빈 칸·통관 지연·단가 이상·중복 의심을 행마다 짚어준다.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { relinkMasterRows } from "@/lib/actions/foreign-trade-master";
import {
  addMasterRow,
  deleteMasterRows,
  listMasterColors,
  listMasterHistory,
  restoreMasterRows,
  saveMasterColors,
  updateMasterCells,
  type CellChange,
  type ColorRow,
  type HistoryItem,
} from "@/lib/actions/foreign-trade-master-edit";
import { MASTER_COLUMNS, MASTER_GROUPS, daysBetween, type MasterCol, type MasterRow } from "@/lib/foreign-trade-master-types";
import { MASTER_COLORS, masterColorBg } from "@/lib/foreign-trade-master-colors";
import { computeMasterIssues, worstLevel, type MasterIssue } from "@/lib/foreign-trade-master-checks";
import { GridExportButtons } from "../GridExportButtons";
import { GridShortcutHelp } from "../GridShortcutHelp";
import { GridRibbon, RBtn, RMenu, RMenuItem } from "@/components/GridRibbon";
import { useAdminFullscreen } from "@/lib/admin-fullscreen";
import { listGridFormats, saveGridFormats } from "@/lib/actions/grid-formats";
import { formatStyle, mergeFormat, cleanFormat, type CellFormat, type FormatMap, type FormatRow } from "@/lib/grid-format";

type ViewCol = { key: string; label: string; width: number; group: string; type: MasterCol["type"] | "calc"; calc?: (r: MasterRow) => number | null };

const BASE_ROW_H = 28;
const BASE_NO_W = 60;
const BASE_GROUP_H = 22;
const BASE_HEAD_H = 40;

const VIEW_COLS: ViewCol[] = MASTER_COLUMNS.flatMap((c): ViewCol[] => {
  const base: ViewCol = { key: c.key, label: c.label, width: c.width, group: c.group, type: c.type };
  if (c.key !== "ecount_reg_date") return [base];
  // 엑셀의 리드타임 2열(수식)은 날짜로 계산해서 보여준다.
  return [
    base,
    { key: "_lead_po", label: "리드타임 (발주-입고)", width: 104, group: "일정", type: "calc", calc: (r) => daysBetween(r.po_date, r.receipt_date) },
    { key: "_lead_ship", label: "리드타임 (선적-입항)", width: 104, group: "일정", type: "calc", calc: (r) => daysBetween(r.ship_date, r.arrival_date) },
  ];
});
const VIEW_COL_BY_KEY = new Map(VIEW_COLS.map((c) => [c.key, c]));
// 위쪽 필터 줄에 따로 두는 자주 쓰는 열 필터(그 밖의 모든 열은 머리글의 ▾로)
const QUICK_FILTERS: { key: string; label: string }[] = [
  { key: "carrier", label: "선사" },
  { key: "forwarder", label: "포워더" },
  { key: "month_recv", label: "입고월" },
  { key: "dept", label: "발주부서" },
  { key: "dest", label: "입고지" },
];
const GROUP_TINT = new Map(MASTER_GROUPS.map((g) => [g.label, g.tint]));

const LS_HIDDEN = "hk-master-hidden-cols";
const LS_ZOOM = "hk-master-zoom";
const ZOOM_STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];

function get(r: MasterRow, key: string): unknown {
  return (r as unknown as Record<string, unknown>)[key];
}

function fmt(v: string | number | null | undefined, type: ViewCol["type"]): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "num" || type === "calc") {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: 4 }) : String(v);
  }
  return String(v);
}

// 수정·복사에 쓰는 원래 값(쉼표 없는 숫자)
function rawOf(r: MasterRow, c: ViewCol): string {
  if (c.type === "calc") {
    const n = c.calc ? c.calc(r) : null;
    return n === null ? "" : String(n);
  }
  const v = get(r, c.key);
  return v === null || v === undefined ? "" : String(v);
}

const LINK_METHOD_LABEL: Record<string, string> = {
  bl_batch: "B/L과 차수가 모두 맞아 연결",
  po_batch: "거래처와 PO 차수가 맞아 연결",
  bl: "B/L이 하나로 맞아 연결",
  po: "발주서(외자)에서 자동 생성",
  manual: "직접 연결",
};

function linkTitle(r: MasterRow): string {
  if (r.link_count === 0) return "수입진행표에 같은 건이 없어 연결되지 않은 행";
  const how = r.link_method ? LINK_METHOD_LABEL[r.link_method] ?? "연결됨" : "연결됨";
  return r.link_count > 1 ? `수입진행표 ${r.link_count}건과 연결 (${how})` : `수입진행표 1건과 연결 (${how})`;
}

function serverOrder(a: MasterRow, b: MasterRow): number {
  const x = a.source_row;
  const y = b.source_row;
  if (x === y || (x == null && y == null)) return String(a.id).localeCompare(String(b.id));
  if (x == null) return 1;
  if (y == null) return -1;
  return Number(x) - Number(y);
}

const ISSUE_COLOR: Record<string, string> = { error: "#dc2626", warn: "#d97706", info: "#3b82f6" };

type Filter = { q: string; year: string; direction: string; supplier: string; link: "" | "linked" | "unlinked"; check: "" | "any" | "error" };
const EMPTY_FILTER: Filter = { q: "", year: "", direction: "", supplier: "", link: "", check: "" };
type Pos = { r: number; c: number };
type SortState = { key: string; dir: "asc" | "desc" } | null;
type Rec = Record<string, unknown>;
type ColorMap = Record<string, { row: string | null; cells: Record<string, string> }>;

type Op =
  | { t: "cells"; changes: { id: string; key: string; before: string; after: string }[] }
  | { t: "rows"; mode: "add" | "del"; ids: string[]; records: Rec[] | null }
  | { t: "color"; before: ColorRow[]; after: ColorRow[] }
  | { t: "format"; before: FormatRow[]; after: FormatRow[] };

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 공간을 못 쓰는 브라우저에서는 이번 접속에서만 유지된다 */
  }
}

export function MasterWorkspace({ rows: initialRows, linkedCount }: { rows: MasterRow[]; linkedCount: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<MasterRow[]>(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [sort, setSort] = useState<SortState>(null);
  // 열 필터(엑셀의 머리글 필터): 열마다 "체크한 값만 보기". 빈 칸은 ""로 다룬다.
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [filterCol, setFilterCol] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  // 전체화면 상태는 모든 화면이 함께 쓴다(오른쪽 위 공통 단추와 같은 상태)
  const [fullscreen, setFullscreen] = useAdminFullscreen();
  useEffect(() => {
    setHidden(loadStored<string[]>(LS_HIDDEN, []));
    const z = loadStored<number>(LS_ZOOM, 1);
    if (ZOOM_STEPS.includes(z)) setZoom(z);
  }, []);

  const [anchor, setAnchor] = useState<Pos | null>(null);
  const [focus, setFocus] = useState<Pos | null>(null);
  // Ctrl(⌘)+클릭으로 따로 골라 둔 영역들 — 지금 고르는 영역(anchor~focus)과 합쳐서 "선택"이 된다
  const [extras, setExtras] = useState<{ a: Pos; f: Pos }[]>([]);
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const editingRef = useRef<{ id: string; key: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [cellError, setCellError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // 변경 이력(선택한 행 하나)
  const [history, setHistory] = useState<{ label: string; items: HistoryItem[]; missingTable: boolean } | null>(null);

  // 색
  const [colors, setColors] = useState<ColorMap>({});
  const [colorStatus, setColorStatus] = useState<"loading" | "ok" | "missing" | "error">("loading");
  // 서식(굵게·기울임·밑줄·글자색·맞춤) — DB에 저장되어 팀 모두에게 같게 보인다
  const [formats, setFormats] = useState<FormatMap>({});
  const [formatStatus, setFormatStatus] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [painter, setPainter] = useState<CellFormat | null>(null);

  // 되돌리기 / 다시 실행
  const undoStack = useRef<Op[]>([]);
  const redoStack = useRef<Op[]>([]);
  const [, bump] = useState(0);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const pendingFocusId = useRef<string | null>(null);

  const rowH = Math.round(BASE_ROW_H * zoom);
  const noW = Math.round(BASE_NO_W * zoom);
  const groupH = Math.round(BASE_GROUP_H * zoom);
  const headH = Math.round(BASE_HEAD_H * zoom);
  const fontPx = Math.round(12 * zoom * 10) / 10;
  const headFontPx = Math.round(11 * zoom * 10) / 10;

  const cols = useMemo(() => VIEW_COLS.filter((c) => !hidden.includes(c.key)), [hidden]);
  const colW = useMemo(() => cols.map((c) => Math.round(c.width * zoom)), [cols, zoom]);
  const colLeft = useMemo(() => {
    const out: number[] = [];
    let x = noW;
    for (const w of colW) {
      out.push(x);
      x += w;
    }
    return out;
  }, [colW, noW]);
  const totalW = noW + colW.reduce((s, w) => s + w, 0);
  const groupSpans = useMemo(() => {
    const out: { label: string; width: number }[] = [];
    cols.forEach((c, i) => {
      const last = out[out.length - 1];
      if (last && last.label === c.group) last.width += colW[i];
      else out.push({ label: c.group, width: colW[i] });
    });
    return out;
  }, [cols, colW]);

  useEffect(() => {
    let alive = true;
    listMasterColors()
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          const m: ColorMap = {};
          for (const c of res.colors) m[c.id] = { row: c.row, cells: c.cells };
          setColors(m);
          setColorStatus("ok");
        } else setColorStatus(res.missingColumns ? "missing" : "error");
      })
      .catch(() => alive && setColorStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listGridFormats("master")
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          const m: FormatMap = {};
          for (const f of res.formats) m[f.id] = f.cells;
          setFormats(m);
          setFormatStatus("ok");
        } else setFormatStatus(res.missingColumns ? "missing" : "error");
      })
      .catch(() => alive && setFormatStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  const issues = useMemo(() => computeMasterIssues(rows, new Date().toISOString().slice(0, 10)), [rows]);
  const issueCounts = useMemo(() => {
    let error = 0;
    let warn = 0;
    let info = 0;
    for (const list of issues.values()) {
      const w = worstLevel(list);
      if (w === "error") error++;
      else if (w === "warn") warn++;
      else if (w === "info") info++;
    }
    return { error, warn, info };
  }, [issues]);

  const years = useMemo(() => [...new Set(rows.map((r) => r.year_recv).filter((y): y is string => !!y))].sort().reverse(), [rows]);
  const quickOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const q of QUICK_FILTERS) {
      const col = VIEW_COL_BY_KEY.get(q.key);
      if (!col) continue;
      const set = new Set<string>();
      for (const r of rows) {
        const v = rawOf(r, col);
        if (v) set.add(v);
      }
      out[q.key] = [...set].sort((a, b) => (q.key === "month_recv" ? Number(a) - Number(b) || a.localeCompare(b, "ko") : a.localeCompare(b, "ko")));
    }
    return out;
  }, [rows]);
  const suppliers = useMemo(() => [...new Set(rows.map((r) => r.supplier).filter((s): s is string => !!s))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    const colRules = Object.entries(colFilters)
      .map(([k, vals]) => ({ col: VIEW_COL_BY_KEY.get(k), set: new Set(vals) }))
      .filter((x): x is { col: ViewCol; set: Set<string> } => !!x.col && x.set.size > 0);
    return rows.filter((r) => {
      for (const rule of colRules) if (!rule.set.has(rawOf(r, rule.col))) return false;
      if (filter.year && r.year_recv !== filter.year) return false;
      if (filter.direction && r.direction !== filter.direction) return false;
      if (filter.supplier && r.supplier !== filter.supplier) return false;
      if (filter.link === "linked" && r.link_count === 0) return false;
      if (filter.link === "unlinked" && r.link_count > 0) return false;
      if (filter.check === "any" && !issues.has(r.id)) return false;
      if (filter.check === "error" && worstLevel(issues.get(r.id)) !== "error") return false;
      if (!q) return true;
      return [r.supplier, r.po_no, r.bl_no, r.hk_code, r.product_name, r.import_decl_no, r.cargo_mgmt_no]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [rows, filter, issues, colFilters]);

  const view = useMemo(() => {
    if (!sort) return filtered;
    const col = VIEW_COL_BY_KEY.get(sort.key);
    if (!col) return filtered;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = rawOf(a, col);
      const y = rawOf(b, col);
      if (x === "" && y === "") return 0;
      if (x === "") return 1;
      if (y === "") return -1;
      if (col.type === "num" || col.type === "calc") return (Number(x) - Number(y)) * sign;
      return x.localeCompare(y, "ko") * sign;
    });
  }, [filtered, sort]);

  const totals = useMemo(() => {
    let krw = 0;
    let qty = 0;
    for (const r of view) {
      krw += Number(r.krw_amount) || 0;
      qty += Number(r.qty) || 0;
    }
    return { krw, qty };
  }, [view]);

  const range = useMemo(() => {
    if (!anchor || !focus || view.length === 0 || cols.length === 0) return null;
    const r1 = Math.max(0, Math.min(anchor.r, focus.r, view.length - 1));
    const r2 = Math.min(view.length - 1, Math.max(anchor.r, focus.r));
    const c1 = Math.max(0, Math.min(anchor.c, focus.c, cols.length - 1));
    const c2 = Math.min(cols.length - 1, Math.max(anchor.c, focus.c));
    return { r1, r2, c1, c2 };
  }, [anchor, focus, view.length, cols.length]);

  // 모든 선택 영역(Ctrl+클릭으로 모은 것 + 지금 고르는 것)과 칸별 판정
  const allRanges = useMemo(() => {
    const out: { r1: number; r2: number; c1: number; c2: number }[] = [];
    if (view.length === 0 || cols.length === 0) return out;
    for (const x of extras) {
      out.push({
        r1: Math.max(0, Math.min(x.a.r, x.f.r, view.length - 1)),
        r2: Math.min(view.length - 1, Math.max(x.a.r, x.f.r)),
        c1: Math.max(0, Math.min(x.a.c, x.f.c, cols.length - 1)),
        c2: Math.min(cols.length - 1, Math.max(x.a.c, x.f.c)),
      });
    }
    if (range) out.push(range);
    return out;
  }, [extras, range, view.length, cols.length]);
  const inAnyRange = (r: number, c: number) => allRanges.some((g) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2);
  const inAnyRow = (r: number) => allRanges.some((g) => r >= g.r1 && r <= g.r2);
  // 겹치는 칸은 한 번만, 위→아래·왼→오른 순서로
  function unionCells(): [number, number][] {
    const seen = new Set<number>();
    const out: [number, number][] = [];
    for (const g of allRanges) {
      for (let r = g.r1; r <= g.r2; r++) {
        for (let c = g.c1; c <= g.c2; c++) {
          const k = r * 10000 + c;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push([r, c]);
        }
      }
    }
    return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  }
  // 선택이 사라지면(Esc·정렬 변경 등) 모아 둔 영역도 함께 비운다
  useEffect(() => {
    if (!focus) setExtras([]);
  }, [focus]);
  useEffect(() => {
    setExtras([]);
  }, [view.length]);
  // 클릭 시작: 일반=한 칸, Shift=범위 넓히기, Ctrl/⌘=기존 선택은 두고 더하기(이미 고른 칸을 다시 누르면 그 영역만 빼기)
  function beginPick(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, a: Pos, f: Pos) {
    if (e.shiftKey && anchor) {
      setFocus(f);
    } else if (e.ctrlKey || e.metaKey) {
      const list = [...extras];
      if (anchor && focus) list.push({ a: anchor, f: focus });
      const idx = list.findIndex((x) => a.r >= Math.min(x.a.r, x.f.r) && a.r <= Math.max(x.a.r, x.f.r) && a.c >= Math.min(x.a.c, x.f.c) && a.c <= Math.max(x.a.c, x.f.c));
      if (idx >= 0 && list.length > 1) {
        list.splice(idx, 1);
        const last = list.pop() as { a: Pos; f: Pos };
        setExtras(list);
        setAnchor(last.a);
        setFocus(last.f);
        return;
      }
      setExtras(list);
      setAnchor(a);
      setFocus(f);
    } else {
      setExtras([]);
      setAnchor(a);
      setFocus(f);
    }
    dragging.current = true;
  }

  // 화면에 그릴 행만 계산(가상 스크롤): 스크롤 위치에서 보이는 구간 + 여유
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);
  const headerTotal = groupH + headH;
  const firstRow = Math.max(0, Math.floor((scrollTop - headerTotal) / rowH) - 12);
  const lastRow = Math.min(view.length - 1, Math.ceil((scrollTop + viewH - headerTotal) / rowH) + 12);
  const visibleIdx: number[] = [];
  for (let i = firstRow; i <= lastRow; i++) visibleIdx.push(i);

  const ensureVisible = useCallback(
    (r: number, c: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const top = r * rowH;
      const bottom = top + rowH;
      const viewTop = el.scrollTop;
      const viewBottom = el.scrollTop + el.clientHeight - headerTotal;
      if (top < viewTop) el.scrollTop = top;
      else if (bottom > viewBottom) el.scrollTop = bottom - (el.clientHeight - headerTotal);
      const left = colLeft[c] ?? 0;
      const w = colW[c] ?? 0;
      if (left < el.scrollLeft + noW) el.scrollLeft = Math.max(0, left - noW);
      else if (left + w > el.scrollLeft + el.clientWidth) el.scrollLeft = left + w - el.clientWidth;
    },
    [rowH, headerTotal, colLeft, colW, noW]
  );

  useEffect(() => {
    const id = pendingFocusId.current;
    if (!id) return;
    const idx = view.findIndex((r) => r.id === id);
    if (idx >= 0) {
      pendingFocusId.current = null;
      setAnchor({ r: idx, c: 0 });
      setFocus({ r: idx, c: 0 });
      ensureVisible(idx, 0);
    }
  }, [view, ensureVisible]);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // 전체화면: 뒤 화면 스크롤을 막는다(Esc로 빠져나오는 건 공통 처리기가 한다)
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  // ── 저장 도우미 ───────────────────────────────────────────────
  async function guarded(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const STALE = "화면이 최신 상태가 아니에요. 새로고침(F5) 한 번 해주세요.";

  // 칸 여러 개를 저장하고 화면에 반영한다. 반영된 칸의 (전,후) 값을 돌려준다.
  async function writeCells(changes: CellChange[]): Promise<{ id: string; key: string; value: string | number | null }[] | null> {
    let res: Awaited<ReturnType<typeof updateMasterCells>> | null = null;
    try {
      res = await updateMasterCells(changes);
    } catch {
      res = null;
    }
    if (!res || typeof res !== "object") {
      setCellError(STALE);
      return null;
    }
    if (!res.ok) {
      setCellError(res.error);
      return null;
    }
    const failed = res.results.filter((x) => !x.ok);
    if (failed.length > 0) setCellError(failed.length === 1 ? failed[0].error ?? "저장하지 못했어요" : `${failed.length}칸은 저장하지 못했어요 — ${failed[0].error ?? ""}`);
    const okList = res.results.filter((x) => x.ok);
    if (okList.length > 0) {
      const patch = new Map<string, Record<string, string | number | null>>();
      for (const x of okList) patch.set(x.id, { ...(patch.get(x.id) ?? {}), [x.key]: x.value });
      setRows((prev) => prev.map((r) => (patch.has(r.id) ? ({ ...r, ...patch.get(r.id) } as MasterRow) : r)));
    }
    return okList.map((x) => ({ id: x.id, key: x.key, value: x.value }));
  }

  // 사용자가 직접 바꾼 칸들(입력·붙여넣기·채우기·지우기)
  async function applyCells(entries: { id: string; key: string; text: string }[]) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = entries.filter((e) => {
      const r = byId.get(e.id);
      const col = VIEW_COL_BY_KEY.get(e.key);
      return !!r && !!col && col.type !== "calc" && rawOf(r, col) !== e.text;
    });
    if (items.length === 0) return;
    await guarded(async () => {
      setCellError(null);
      const before = new Map(items.map((e) => [e.id + "|" + e.key, rawOf(byId.get(e.id)!, VIEW_COL_BY_KEY.get(e.key)!)]));
      const done = await writeCells(items.map((e) => ({ id: e.id, key: e.key, value: e.text })));
      if (!done || done.length === 0) return;
      pushOp({
        t: "cells",
        changes: done.map((d) => ({ id: d.id, key: d.key, before: before.get(d.id + "|" + d.key) ?? "", after: d.value === null ? "" : String(d.value) })),
      });
    });
  }

  function pushOp(op: Op) {
    undoStack.current.push(op);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    bump((n) => n + 1);
  }

  async function removeRows(ids: string[]): Promise<Rec[] | null> {
    let res: Awaited<ReturnType<typeof deleteMasterRows>> | null = null;
    try {
      res = await deleteMasterRows(ids);
    } catch {
      res = null;
    }
    if (!res || typeof res !== "object") {
      setCellError(STALE);
      return null;
    }
    if (!res.ok) {
      setCellError(res.error);
      return null;
    }
    const gone = new Set(ids);
    setRows((prev) => prev.filter((r) => !gone.has(r.id)));
    return res.deleted;
  }

  async function putRows(records: Rec[]): Promise<boolean> {
    let res: Awaited<ReturnType<typeof restoreMasterRows>> | null = null;
    try {
      res = await restoreMasterRows(records);
    } catch {
      res = null;
    }
    if (!res || typeof res !== "object") {
      setCellError(STALE);
      return false;
    }
    if (!res.ok) {
      setCellError(res.error);
      return false;
    }
    const added = res.rows;
    setRows((prev) => [...prev.filter((r) => !added.some((a) => a.id === r.id)), ...added].sort(serverOrder));
    return true;
  }

  async function writeColors(items: ColorRow[]): Promise<boolean> {
    let res: Awaited<ReturnType<typeof saveMasterColors>> | null = null;
    try {
      res = await saveMasterColors(items);
    } catch {
      res = null;
    }
    if (!res || typeof res !== "object") {
      setCellError(STALE);
      return false;
    }
    if (!res.ok) {
      setCellError(res.error);
      return false;
    }
    setColors((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (!it.row && Object.keys(it.cells).length === 0) delete next[it.id];
        else next[it.id] = { row: it.row, cells: it.cells };
      }
      return next;
    });
    return true;
  }

  async function writeFormats(items: FormatRow[]): Promise<boolean> {
    for (let i = 0; i < items.length; i += 500) {
      let res: Awaited<ReturnType<typeof saveGridFormats>> | null = null;
      try {
        res = await saveGridFormats("master", items.slice(i, i + 500));
      } catch {
        res = null;
      }
      if (!res || typeof res !== "object") {
        setCellError(STALE);
        return false;
      }
      if (!res.ok) {
        setCellError(res.error);
        return false;
      }
    }
    setFormats((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (Object.keys(it.cells).length === 0) delete next[it.id];
        else next[it.id] = it.cells;
      }
      return next;
    });
    return true;
  }

  async function runOp(op: Op, dir: "undo" | "redo"): Promise<boolean> {
    if (op.t === "cells") {
      const list = op.changes.map((c) => ({ id: c.id, key: c.key, value: dir === "undo" ? c.before : c.after }));
      const done = await writeCells(list);
      return !!done && done.length === list.length;
    }
    if (op.t === "color") return writeColors(dir === "undo" ? op.before : op.after);
    if (op.t === "format") return writeFormats(dir === "undo" ? op.before : op.after);
    const remove = (dir === "undo") === (op.mode === "add");
    if (remove) {
      const gone = await removeRows(op.ids);
      if (!gone) return false;
      op.records = gone;
      return true;
    }
    return op.records ? putRows(op.records) : false;
  }

  async function undo() {
    if (busyRef.current) return;
    const op = undoStack.current.pop();
    if (!op) return;
    await guarded(async () => {
      setCellError(null);
      if (await runOp(op, "undo")) redoStack.current.push(op);
      else undoStack.current.push(op);
      bump((n) => n + 1);
    });
  }

  async function redo() {
    if (busyRef.current) return;
    const op = redoStack.current.pop();
    if (!op) return;
    await guarded(async () => {
      setCellError(null);
      if (await runOp(op, "redo")) undoStack.current.push(op);
      else redoStack.current.push(op);
      bump((n) => n + 1);
    });
  }

  // ── 행 추가·복제·삭제 ─────────────────────────────────────────
  async function addRows(values?: Record<string, string | number | null>) {
    await guarded(async () => {
      setCellError(null);
      let res: Awaited<ReturnType<typeof addMasterRow>> | null = null;
      try {
        res = await addMasterRow(values);
      } catch {
        res = null;
      }
      if (!res || typeof res !== "object") return setCellError(STALE);
      if (!res.ok) return setCellError(res.error);
      const row = res.row;
      // 새 행이 필터·정렬에 가려지지 않도록 풀고, 맨 아래에서 바로 입력할 수 있게 선택한다
      setFilter(EMPTY_FILTER);
      setColFilters({});
      setSort(null);
      setRows((prev) => [...prev, row]);
      pendingFocusId.current = row.id;
      pushOp({ t: "rows", mode: "add", ids: [row.id], records: null });
      requestAnimationFrame(() => scrollRef.current?.focus({ preventScroll: true }));
    });
  }

  async function duplicateRows() {
    if (!range) return setCellError("복제할 행을 먼저 선택해주세요");
    const src = view[range.r2];
    const values: Record<string, string | number | null> = {};
    for (const c of VIEW_COLS) {
      if (c.type === "calc") continue;
      const v = get(src, c.key);
      values[c.key] = v === null || v === undefined ? null : (v as string | number);
    }
    await addRows(values);
  }

  async function deleteSelectedRows() {
    if (!range) return setCellError("삭제할 행을 먼저 선택해주세요");
    const ids = view.slice(range.r1, range.r2 + 1).map((r) => r.id);
    if (!window.confirm(`선택한 ${ids.length.toLocaleString()}개 행을 삭제할까요?\n(되돌리기로 다시 살릴 수 있어요)`)) return;
    await guarded(async () => {
      setCellError(null);
      const gone = await removeRows(ids);
      if (!gone) return;
      setAnchor(null);
      setFocus(null);
      pushOp({ t: "rows", mode: "del", ids, records: gone });
    });
  }

  // ── 변경 이력 ─────────────────────────────────────────────────
  async function showHistory() {
    if (!range) return setCellError("이력을 볼 행을 먼저 선택해주세요");
    const row = view[range.r2];
    setCellError(null);
    let res: Awaited<ReturnType<typeof listMasterHistory>> | null = null;
    try {
      res = await listMasterHistory(row.id);
    } catch {
      res = null;
    }
    if (!res || typeof res !== "object") return setCellError(STALE);
    if (!res.ok) return setCellError(res.error);
    setHistory({ label: [row.supplier, row.po_no, row.hk_code].filter(Boolean).join(" / ") || "선택한 행", items: res.items, missingTable: res.missingTable });
  }

  // ── 색 ────────────────────────────────────────────────────────
  async function paint(scope: "cell" | "row", color: string | null) {
    if (!range) return setCellError("색을 칠할 칸이나 행을 먼저 선택해주세요");
    if (colorStatus !== "ok") return;
    const before: ColorRow[] = [];
    const after: ColorRow[] = [];
    const paintRows = Array.from(new Set(allRanges.flatMap((g) => Array.from({ length: g.r2 - g.r1 + 1 }, (_, k) => g.r1 + k)))).sort((x, y) => x - y);
    for (const r of paintRows) {
      const id = view[r].id;
      const cur = colors[id] ?? { row: null, cells: {} };
      const cells = { ...cur.cells };
      let row = cur.row;
      if (scope === "row") row = color;
      else {
        for (let c = 0; c < cols.length; c++) {
          if (!inAnyRange(r, c)) continue;
          if (cols[c].type === "calc") continue;
          if (color) cells[cols[c].key] = color;
          else delete cells[cols[c].key];
        }
      }
      before.push({ id, row: cur.row, cells: cur.cells });
      after.push({ id, row, cells });
    }
    await guarded(async () => {
      setCellError(null);
      if (await writeColors(after)) pushOp({ t: "color", before, after });
    });
  }

  // ── 서식(굵게·기울임·밑줄·글자색·맞춤) ─────────────────────────
  // 고른 모든 칸에 같은 서식을 입힌다. fn이 칸마다 새 서식(없애려면 null)을 정한다.
  async function changeFormats(fn: (prev: CellFormat | undefined) => CellFormat | null) {
    if (formatStatus !== "ok") return setCellError(formatStatus === "missing" ? "서식 기능은 DB 준비(SQL 실행) 후 쓸 수 있어요" : "서식 기능을 지금은 쓸 수 없어요");
    if (!range) return setCellError("서식을 바꿀 칸을 먼저 선택해주세요");
    const cells = unionCells();
    const byRow = new Map<string, Record<string, CellFormat>>();
    const before = new Map<string, Record<string, CellFormat>>();
    for (const [r, c] of cells) {
      const id = view[r].id;
      if (!byRow.has(id)) {
        byRow.set(id, { ...(formats[id] ?? {}) });
        before.set(id, { ...(formats[id] ?? {}) });
      }
      const row = byRow.get(id)!;
      const next = fn(row[cols[c].key]);
      if (next) row[cols[c].key] = next;
      else delete row[cols[c].key];
    }
    const beforeRows: FormatRow[] = [];
    const afterRows: FormatRow[] = [];
    for (const [id, cellsNow] of byRow) {
      const prev = before.get(id) ?? {};
      if (JSON.stringify(prev) === JSON.stringify(cellsNow)) continue;
      beforeRows.push({ id, cells: prev });
      afterRows.push({ id, cells: cellsNow });
    }
    if (afterRows.length === 0) return;
    await guarded(async () => {
      setCellError(null);
      if (await writeFormats(afterRows)) pushOp({ t: "format", before: beforeRows, after: afterRows });
    });
  }

  // 엑셀처럼: 골라 둔 칸이 모두 이미 그 서식이면 끄고, 아니면 모두 켠다
  function applyFormat(patch: Partial<Record<keyof CellFormat, CellFormat[keyof CellFormat] | null>>) {
    const keys = Object.keys(patch) as (keyof CellFormat)[];
    const allOn =
      range !== null &&
      unionCells().every(([r, c]) => {
        const cur = formats[view[r].id]?.[cols[c].key];
        return keys.every((k) => (patch[k] === undefined || patch[k] === null || patch[k] === false ? !cur?.[k] : cur?.[k] === patch[k]));
      });
    const eff = allOn && (keys.includes("b") || keys.includes("i") || keys.includes("u") || keys.includes("a")) ? Object.fromEntries(keys.map((k) => [k, null])) : patch;
    void changeFormats((prev) => mergeFormat(prev, eff));
  }

  function clearFormats() {
    void changeFormats(() => null);
  }

  const activeFormat: CellFormat = focus && view[focus.r] && cols[focus.c] ? (formats[view[focus.r].id]?.[cols[focus.c].key] ?? {}) : {};

  function copyFormat() {
    if (!focus || !view[focus.r]) return setCellError("서식을 복사할 칸을 먼저 선택해주세요");
    setPainter(cleanFormat(activeFormat) ?? {});
    setCellError(null);
  }
  function pasteFormat() {
    if (!painter) return;
    const f = painter;
    void changeFormats(() => cleanFormat(f));
    setPainter(null);
  }

  // 리본의 붙여넣기·잘라내기·복사 단추(키보드 단축키와 같은 동작)
  async function ribbonCopy() {
    if (!range) return setCellError("복사할 칸을 먼저 선택해주세요");
    try {
      await navigator.clipboard.writeText(selectionText());
      setCellError(null);
    } catch {
      setCellError("이 브라우저에서는 단추 대신 Ctrl+C를 써주세요");
    }
  }
  async function ribbonCut() {
    if (!range) return setCellError("잘라낼 칸을 먼저 선택해주세요");
    try {
      await navigator.clipboard.writeText(selectionText());
    } catch {
      return setCellError("이 브라우저에서는 단추 대신 Ctrl+X를 써주세요");
    }
    clearRange();
  }
  async function ribbonPaste() {
    if (!range) return setCellError("붙여넣을 칸을 먼저 선택해주세요");
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return setCellError("이 브라우저에서는 단추 대신 Ctrl+V를 써주세요");
    }
    pasteText(text);
  }

  function sortActive(dir: "asc" | "desc") {
    if (!focus || !cols[focus.c]) return setCellError("정렬할 열의 칸을 먼저 선택해주세요");
    const key = cols[focus.c].key;
    setAnchor(null);
    setFocus(null);
    setSort({ key, dir });
  }

  // ── 선택·이동·편집 ────────────────────────────────────────────
  function select(r: number, c: number, extend: boolean) {
    const pos = { r: Math.max(0, Math.min(view.length - 1, r)), c: Math.max(0, Math.min(cols.length - 1, c)) };
    if (!extend) setExtras([]);
    if (!extend || !anchor) setAnchor(pos);
    setFocus(pos);
    ensureVisible(pos.r, pos.c);
  }

  function startEdit(r: number, c: number, initial?: string) {
    const row = view[r];
    const col = cols[c];
    if (!row || !col || col.type === "calc") return;
    setCellError(null);
    editingRef.current = { id: row.id, key: col.key };
    setEditing({ id: row.id, key: col.key });
    setDraft(initial !== undefined ? initial : rawOf(row, col));
  }

  function commitEdit(move?: "down" | "right" | "left") {
    const e = editingRef.current;
    if (!e) return;
    editingRef.current = null;
    setEditing(null);
    const row = rows.find((r) => r.id === e.id);
    const col = VIEW_COL_BY_KEY.get(e.key);
    if (row && col && draft !== rawOf(row, col)) void applyCells([{ id: e.id, key: e.key, text: draft }]);
    requestAnimationFrame(() => scrollRef.current?.focus({ preventScroll: true }));
    if (move && focus) {
      if (move === "down") select(focus.r + 1, focus.c, false);
      if (move === "right") select(focus.r, focus.c + 1, false);
      if (move === "left") select(focus.r, focus.c - 1, false);
    }
  }

  function cancelEdit() {
    editingRef.current = null;
    setEditing(null);
    requestAnimationFrame(() => scrollRef.current?.focus({ preventScroll: true }));
  }

  function selectionText(): string {
    if (!range) return "";
    // 떨어진 영역까지 합쳐서, 줄마다 그 줄에서 고른 칸만 탭으로 잇는다
    const lines: string[] = [];
    let curRow = -1;
    let cells: string[] = [];
    for (const [r, c] of unionCells()) {
      if (r !== curRow) {
        if (curRow >= 0) lines.push(cells.join("\t"));
        curRow = r;
        cells = [];
      }
      cells.push(rawOf(view[r], cols[c]).replace(/[\t\r\n]+/g, " "));
    }
    if (curRow >= 0) lines.push(cells.join("\t"));
    return lines.join("\n");
  }

  function rangeEntries(text: (r: number, c: number) => string | null): { id: string; key: string; text: string }[] {
    const out: { id: string; key: string; text: string }[] = [];
    if (!range) return out;
    for (const [r, c] of unionCells()) {
      if (cols[c].type === "calc") continue;
      const t = text(r, c);
      if (t !== null) out.push({ id: view[r].id, key: cols[c].key, text: t });
    }
    return out;
  }

  function clearRange() {
    const entries = rangeEntries(() => "");
    if (entries.length > 30 && !window.confirm(`${entries.length.toLocaleString()}칸을 비울까요? (되돌리기로 복원할 수 있어요)`)) return;
    void applyCells(entries);
  }

  function fillDown() {
    if (!range) return;
    const single = range.r1 === range.r2;
    if (single && range.r1 === 0) return;
    const srcRow = single ? range.r1 - 1 : range.r1;
    const entries = rangeEntries((r, c) => (r === srcRow ? null : rawOf(view[srcRow], cols[c])));
    void applyCells(entries);
  }

  function fillRight() {
    if (!range) return;
    const single = range.c1 === range.c2;
    if (single && range.c1 === 0) return;
    const srcCol = single ? range.c1 - 1 : range.c1;
    const entries = rangeEntries((r, c) => (c === srcCol ? null : rawOf(view[r], cols[srcCol])));
    void applyCells(entries);
  }

  // 찾아 바꾸기: 선택한 범위(선택이 없으면 지금 보이는 표 전체)에서 글자를 찾아 바꾼다(되돌리기 가능)
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findMsg, setFindMsg] = useState<string | null>(null);
  function replaceAll() {
    if (!findText) return setFindMsg("찾을 글자를 입력해주세요");
    const r1 = range ? range.r1 : 0;
    const r2 = range ? range.r2 : view.length - 1;
    const c1 = range ? range.c1 : 0;
    const c2 = range ? range.c2 : cols.length - 1;
    const entries: { id: string; key: string; text: string }[] = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (cols[c].type === "calc") continue;
        const t = rawOf(view[r], cols[c]);
        if (t.includes(findText)) entries.push({ id: view[r].id, key: cols[c].key, text: t.split(findText).join(replaceText) });
      }
    }
    if (entries.length === 0) return setFindMsg("바꿀 칸이 없어요");
    if (!window.confirm(`${entries.length.toLocaleString()}칸의 "${findText}"을(를) "${replaceText}"(으)로 바꿀까요? (되돌리기로 복원할 수 있어요)`)) return;
    setFindMsg(`${entries.length.toLocaleString()}칸을 바꿨어요`);
    void applyCells(entries);
  }
  function findNext() {
    if (!findText) return setFindMsg("찾을 글자를 입력해주세요");
    const total = view.length * cols.length;
    if (total === 0) return;
    const start = focus ? focus.r * cols.length + focus.c + 1 : 0;
    for (let i = 0; i < total; i++) {
      const idx = (start + i) % total;
      const r = Math.floor(idx / cols.length);
      const c = idx % cols.length;
      if (rawOf(view[r], cols[c]).includes(findText)) {
        select(r, c, false);
        return setFindMsg(null);
      }
    }
    setFindMsg("찾지 못했어요");
  }
  function gotoRow(text: string) {
    const n = Math.floor(Number(text));
    if (!Number.isFinite(n) || n < 1 || view.length === 0) return;
    select(n - 1, focus ? focus.c : 0, false);
    requestAnimationFrame(() => scrollRef.current?.focus({ preventScroll: true }));
  }
  // 열 필터 목록: 다른 열의 필터는 반영하고 이 열 자신의 필터는 빼서 값을 센다(엑셀과 같은 방식)
  const filterValues = useMemo(() => {
    if (!filterCol) return [];
    const col = VIEW_COL_BY_KEY.get(filterCol);
    if (!col) return [];
    const others = Object.entries(colFilters)
      .filter(([k, v]) => k !== filterCol && v.length > 0)
      .map(([k, v]) => ({ col: VIEW_COL_BY_KEY.get(k), set: new Set(v) }))
      .filter((x): x is { col: ViewCol; set: Set<string> } => !!x.col);
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (others.some((o) => !o.set.has(rawOf(r, o.col)))) continue;
      const v = rawOf(r, col);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const list = [...counts.entries()].map(([value, count]) => ({ value, count }));
    const numeric = col.type === "num" || col.type === "calc";
    list.sort((a, b) => {
      if (a.value === "") return -1;
      if (b.value === "") return 1;
      return numeric ? Number(a.value) - Number(b.value) : a.value.localeCompare(b.value, "ko");
    });
    return list;
  }, [filterCol, colFilters, rows]);
  function toggleFilterValue(key: string, value: string) {
    setAnchor(null);
    setFocus(null);
    setColFilters((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const out = { ...prev };
      if (next.length === 0) delete out[key];
      else out[key] = next;
      return out;
    });
  }
  function setFilterValues(key: string, values: string[]) {
    setAnchor(null);
    setFocus(null);
    setColFilters((prev) => {
      const out = { ...prev };
      if (values.length === 0) delete out[key];
      else out[key] = values;
      return out;
    });
  }

  function resetView() {
    setFilter(EMPTY_FILTER);
    setColFilters({});
    setFilterCol(null);
    setSort(null);
    setAnchor(null);
    setFocus(null);
    setHiddenCols([]);
    setZoom(1);
    saveStored(LS_ZOOM, 1);
  }
  function exportData() {
    return {
      headers: cols.map((c) => c.label),
      rows: view.map((r) => cols.map((c) => rawOf(r, c))),
    };
  }

  function onCopy(e: ClipboardEvent<HTMLDivElement>) {
    if (editingRef.current || !range) return;
    e.clipboardData.setData("text/plain", selectionText());
    e.preventDefault();
  }

  function onCut(e: ClipboardEvent<HTMLDivElement>) {
    if (editingRef.current || !range) return;
    e.clipboardData.setData("text/plain", selectionText());
    e.preventDefault();
    clearRange();
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    if (editingRef.current) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text || !range) return;
    e.preventDefault();
    pasteText(text);
  }

  function pasteText(text: string) {
    if (!text || !range) return;
    const grid = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    let entries: { id: string; key: string; text: string }[];
    if (grid.length === 1 && grid[0].length === 1 && (extras.length > 0 || range.r1 !== range.r2 || range.c1 !== range.c2)) {
      entries = rangeEntries(() => grid[0][0]);
    } else {
      entries = [];
      grid.forEach((line, i) => {
        line.forEach((v, j) => {
          const r = range.r1 + i;
          const c = range.c1 + j;
          if (r >= view.length || c >= cols.length || cols[c].type === "calc") return;
          entries.push({ id: view[r].id, key: cols[c].key, text: v.trim() });
        });
      });
    }
    if (entries.length > 200 && !window.confirm(`${entries.length.toLocaleString()}칸에 붙여넣을까요? (되돌리기로 복원할 수 있어요)`)) return;
    void applyCells(entries);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editingRef.current) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && !e.shiftKey && (k === "z" || k === "Z")) return e.preventDefault(), void undo();
    if (mod && (k === "y" || k === "Y" || (e.shiftKey && (k === "z" || k === "Z")))) return e.preventDefault(), void redo();
    if (mod && (k === "a" || k === "A")) {
      e.preventDefault();
      setExtras([]);
      setAnchor({ r: 0, c: 0 });
      setFocus({ r: view.length - 1, c: cols.length - 1 });
      return;
    }
    if (mod && (k === "d" || k === "D")) return e.preventDefault(), fillDown();
    if (mod && (k === "r" || k === "R")) return e.preventDefault(), fillRight();
    if (mod && (k === "g" || k === "G")) {
      e.preventDefault();
      document.getElementById("master-goto")?.focus();
      return;
    }
    if (mod && (k === "f" || k === "F")) {
      e.preventDefault();
      document.getElementById("master-search")?.focus();
      return;
    }
    if (mod) return; // 복사·붙여넣기·잘라내기는 브라우저 이벤트(onCopy/onPaste/onCut)로 처리
    if (!focus) {
      if (view.length > 0 && (k.startsWith("Arrow") || k === "Enter")) {
        e.preventDefault();
        select(0, 0, false);
      }
      return;
    }
    const pageRows = Math.max(1, Math.floor((viewH - headerTotal) / rowH) - 1);
    switch (k) {
      case "ArrowDown":
        e.preventDefault();
        return select(focus.r + 1, focus.c, e.shiftKey);
      case "ArrowUp":
        e.preventDefault();
        return select(focus.r - 1, focus.c, e.shiftKey);
      case "ArrowRight":
        e.preventDefault();
        return select(focus.r, focus.c + 1, e.shiftKey);
      case "ArrowLeft":
        e.preventDefault();
        return select(focus.r, focus.c - 1, e.shiftKey);
      case "PageDown":
        e.preventDefault();
        return select(focus.r + pageRows, focus.c, e.shiftKey);
      case "PageUp":
        e.preventDefault();
        return select(focus.r - pageRows, focus.c, e.shiftKey);
      case "Home":
        e.preventDefault();
        return select(e.ctrlKey ? 0 : focus.r, 0, e.shiftKey);
      case "End":
        e.preventDefault();
        return select(e.ctrlKey ? view.length - 1 : focus.r, cols.length - 1, e.shiftKey);
      case "Tab":
        e.preventDefault();
        return select(focus.r, focus.c + (e.shiftKey ? -1 : 1), false);
      case "Enter":
      case "F2":
        e.preventDefault();
        return startEdit(focus.r, focus.c);
      case "Delete":
      case "Backspace":
        e.preventDefault();
        return clearRange();
      case "Escape":
        setAnchor(null);
        setFocus(null);
        return;
      default:
        if (k.length === 1 && !e.altKey) {
          e.preventDefault();
          startEdit(focus.r, focus.c, k);
        }
    }
  }

  function toggleSort(key: string) {
    setAnchor(null);
    setFocus(null);
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  function setHiddenCols(next: string[]) {
    setHidden(next);
    saveStored(LS_HIDDEN, next);
    setAnchor(null);
    setFocus(null);
  }

  function changeZoom(delta: number) {
    const i = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + delta))];
    setZoom(next);
    saveStored(LS_ZOOM, next);
  }

  // ── 엑셀 가져오기·다시 연결 (기존 기능) ───────────────────────
  async function postFile(file: File, dryRun: boolean) {
    const body = new FormData();
    body.append("file", file);
    body.append("dryRun", dryRun ? "1" : "0");
    const res = await fetch("/admin/foreign-trade/master/import", { method: "POST", body });
    let json: { ok?: boolean; error?: string; count?: number; linked?: number } | null = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!json || typeof json !== "object") throw new Error(STALE);
    if (!json.ok) throw new Error(json.error ?? "가져오지 못했어요");
    return json;
  }

  async function onRelink() {
    setImportMsg(null);
    setRelinking(true);
    try {
      let res: Awaited<ReturnType<typeof relinkMasterRows>> | null = null;
      try {
        res = await relinkMasterRows();
      } catch {
        res = null;
      }
      if (!res || typeof res !== "object") {
        setImportMsg(STALE);
        return;
      }
      if (!res.ok) {
        setImportMsg(res.error);
        return;
      }
      setImportMsg(`다시 연결했어요 — 전체 ${res.total.toLocaleString()}행 중 ${res.linked.toLocaleString()}행이 수입진행표 건과 연결돼 있어요`);
      router.refresh();
    } finally {
      setRelinking(false);
    }
  }

  // 엑셀은 서버에서 읽는다(숨은 시트가 커서 브라우저에서 통째로 읽으면 메모리가 부족해요).
  async function onFile(file: File) {
    setImportMsg(null);
    setImporting(true);
    try {
      setImportMsg("엑셀을 읽는 중…");
      const dry = await postFile(file, true);
      const count = dry.count ?? 0;
      const msg =
        rows.length > 0
          ? `엑셀에서 품목 ${count.toLocaleString()}행을 읽었어요.\n지금 저장된 가져온 행을 모두 지우고 이 파일 내용으로 바꿀까요? (화면에서 고친 내용과 색도 사라져요)`
          : `엑셀에서 품목 ${count.toLocaleString()}행을 읽었어요. 가져올까요?`;
      if (!window.confirm(msg)) {
        setImportMsg("가져오기를 취소했어요");
        return;
      }
      setImportMsg("저장하고 수입진행표 건과 연결하는 중…");
      const done = await postFile(file, false);
      setImportMsg(`가져왔어요 — ${(done.count ?? 0).toLocaleString()}행, 수입진행표 건과 연결된 행 ${(done.linked ?? 0).toLocaleString()}행`);
      undoStack.current = [];
      redoStack.current = [];
      router.refresh();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "가져오지 못했어요");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const sel = "rounded-lg border border-line bg-bg-raised px-2 py-1 text-[12px] outline-none focus:border-line-strong";
  const chip = (active: boolean) =>
    `pressable rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${active ? "border-ink bg-ink text-bg" : "border-line text-ink-soft hover:border-line-strong"}`;
  const tool = "pressable shrink-0 whitespace-nowrap rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-soft hover:border-line-strong disabled:opacity-40";
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  const rowCount = range ? range.r2 - range.r1 + 1 : 0;

  // 선택한 칸 통계(엑셀 화면 아래쪽의 합계·평균·개수와 같은 기능)
  const selStats = (() => {
    if (!range) return null;
    const cellList = extras.length > 0 ? unionCells() : null;
    const cells = cellList ? cellList.length : (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    if (cells < 2 || cells > 200000) return null;
    let count = 0;
    let nums = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    const visit = (r: number, c: number) => {
      const t = rawOf(view[r], cols[c]);
      if (t === "") return;
      count++;
      const n = Number(t);
      if (Number.isFinite(n) && /^-?[0-9.,]+$/.test(t.trim())) {
        nums++;
        sum += n;
        if (n < min) min = n;
        if (n > max) max = n;
      }
    };
    if (cellList) for (const [r, c] of cellList) visit(r, c);
    else {
      for (let r = range.r1; r <= range.r2; r++) {
        for (let c = range.c1; c <= range.c2; c++) visit(r, c);
      }
    }
    return { cells, count, nums, sum, min, max };
  })();
  const fmtNum = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 4 });

  return (
    <div className={fullscreen ? "fixed inset-0 z-[100] flex flex-col gap-2 bg-bg p-3 pr-12" : "flex flex-col gap-2"}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="master-search"
          autoComplete="off"
          value={filter.q}
          onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
          placeholder="거래처·PO·B/L·HK 코드·제품명 검색"
          className="w-64 rounded-lg border border-line bg-bg-sunken px-2.5 py-1.5 text-[13px] outline-none focus:border-line-strong"
        />
        <button type="button" className={chip(!filter.year)} onClick={() => setFilter((f) => ({ ...f, year: "" }))}>
          전체
        </button>
        {years.map((y) => (
          <button key={y} type="button" className={chip(filter.year === y)} onClick={() => setFilter((f) => ({ ...f, year: f.year === y ? "" : y }))}>
            20{y}년 입고
          </button>
        ))}
        <select id="master-direction" value={filter.direction} onChange={(e) => setFilter((f) => ({ ...f, direction: e.target.value }))} className={sel}>
          <option value="">구분 전체</option>
          <option value="수입">수입</option>
          <option value="샘플">샘플</option>
          <option value="수출">수출</option>
        </select>
        <select id="master-supplier" value={filter.supplier} onChange={(e) => setFilter((f) => ({ ...f, supplier: e.target.value }))} className={sel}>
          <option value="">거래처 전체</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {QUICK_FILTERS.map((q) => {
          const cur = colFilters[q.key];
          const value = cur && cur.length === 1 ? cur[0] : cur && cur.length > 1 ? "__multi" : "";
          return (
            <select
              key={q.key}
              id={"master-quick-" + q.key}
              value={value}
              onChange={(e) => setFilterValues(q.key, e.target.value === "" || e.target.value === "__multi" ? (e.target.value === "__multi" ? cur ?? [] : []) : [e.target.value])}
              className={sel}
              title={q.label + " 필터 (여러 값은 열 머리글의 ▾로)"}
            >
              <option value="">{q.label} 전체</option>
              {value === "__multi" && <option value="__multi">{q.label} {cur?.length}개 선택</option>}
              {(quickOptions[q.key] ?? []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          );
        })}
        <select id="master-link" value={filter.link} onChange={(e) => setFilter((f) => ({ ...f, link: e.target.value as Filter["link"] }))} className={sel}>
          <option value="">연결 상태 전체</option>
          <option value="linked">수입진행표와 연결됨</option>
          <option value="unlinked">연결 안 됨</option>
        </select>
      </div>

      <GridRibbon
        id="master"
        history={{ onUndo: () => void undo(), onRedo: () => void redo(), canUndo: canUndo && !busy, canRedo: canRedo && !busy }}
        clipboard={{
          onPaste: () => void ribbonPaste(),
          onCut: () => void ribbonCut(),
          onCopy: () => void ribbonCopy(),
          onCopyFormat: copyFormat,
          onPasteFormat: pasteFormat,
          painterReady: painter !== null,
        }}
        font={{
          format: activeFormat,
          onFormat: applyFormat,
          onFill: (c) => void paint("cell", c),
          onRowFill: (c) => void paint("row", c),
          formatsEnabled: formatStatus === "ok" && !busy,
          colorsEnabled: colorStatus === "ok" && !busy,
        }}
        cells={{
          onNewRow: () => void addRows(),
          newRowTitle: "맨 아래에 빈 행을 추가해요",
          onDuplicate: () => void duplicateRows(),
          onDelete: () => void deleteSelectedRows(),
          deleteTitle: "선택한 행 삭제 (되돌리기로 복원 가능)",
        }}
        editing={{
          onClearContent: clearRange,
          onClearFormats: clearFormats,
          onFillDown: fillDown,
          onFillRight: fillRight,
          find: (
            <details data-popover className="relative shrink-0">
              <summary className="pressable inline-flex h-7 cursor-pointer list-none items-center whitespace-nowrap rounded border border-transparent px-2 text-[12px] text-ink-soft hover:border-line hover:bg-bg-sunken" title="찾기·바꾸기·행 이동 (Ctrl+F는 검색칸, Ctrl+G는 행 이동)">
                찾기 및 선택 <span className="ml-1 text-[9px]">▾</span>
              </summary>
              <div className="absolute right-0 top-full z-50 mt-1 flex w-72 flex-col gap-2 rounded-xl border border-line bg-bg-raised p-3 text-[12px] shadow-lg">
                <div className="flex items-center gap-2">
                  <input id="master-find" autoComplete="off" value={findText} onChange={(e) => setFindText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") findNext(); }} placeholder="찾을 글자" className={sel + " min-w-0 flex-1"} />
                  <button type="button" className={tool} onClick={findNext}>다음 찾기</button>
                </div>
                <div className="flex items-center gap-2">
                  <input id="master-replace" autoComplete="off" value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="바꿀 글자" className={sel + " min-w-0 flex-1"} />
                  <button type="button" className={tool} disabled={busy} onClick={replaceAll} title="선택한 범위(없으면 지금 보이는 표 전체)에서 바꿔요">
                    모두 바꾸기
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="master-goto" className="whitespace-nowrap text-ink-faint">행 이동</label>
                  <input id="master-goto" autoComplete="off" inputMode="numeric" placeholder="번호 + Enter" onKeyDown={(e) => { if (e.key === "Enter") { gotoRow((e.target as HTMLInputElement).value); } }} className={sel + " w-28"} />
                </div>
                {findMsg && <span className="text-ink-faint">{findMsg}</span>}
              </div>
            </details>
          ),
        }}
        data={{
          onSort: sortActive,
          sortHint: "지금 선택한 칸이 있는 열을 기준으로 정렬해요 (머리글 클릭으로도 가능)",
          filter: (
            <RMenu label="필터" title="자주 쓰는 필터 (열마다의 필터는 머리글의 ▾)">
              <RMenuItem label="점검 필요한 행만" onClick={() => setFilter((f) => ({ ...f, check: "any" }))} />
              <RMenuItem label="오류 행만" onClick={() => setFilter((f) => ({ ...f, check: "error" }))} />
              <RMenuItem label="수입진행표와 연결 안 된 행만" onClick={() => setFilter((f) => ({ ...f, link: "unlinked" }))} />
              <RMenuItem label="모든 필터 해제" onClick={() => { setFilter(EMPTY_FILTER); setColFilters({}); }} />
            </RMenu>
          ),
          onClearFilters: () => { setFilter(EMPTY_FILTER); setColFilters({}); },
          exportButtons: <GridExportButtons filename="수출입품목대장" getData={exportData} />,
        }}
        view={{
          zoom,
          onZoomStep: changeZoom,
          onZoomReset: () => { setZoom(1); saveStored(LS_ZOOM, 1); },
          canZoomOut: zoom > ZOOM_STEPS[0],
          canZoomIn: zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1],
          fullscreen,
          onFullscreen: () => setFullscreen(!fullscreen),
          onResetView: resetView,
          columns: (
            <details className="relative shrink-0" data-popover>
              <summary className="pressable inline-flex h-7 cursor-pointer list-none items-center whitespace-nowrap rounded border border-transparent px-2 text-[12px] text-ink-soft hover:border-line hover:bg-bg-sunken">
                열 보기{hidden.length > 0 ? ` (${hidden.length}개 숨김)` : ""} <span className="ml-1 text-[9px]">▾</span>
              </summary>
              <div className="absolute left-0 top-full z-50 mt-1 max-h-[60vh] w-72 overflow-auto rounded-xl border border-line bg-bg-raised p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between">
                  <button type="button" className="text-[12px] font-semibold text-ink-soft underline" onClick={() => setHiddenCols([])}>
                    모두 보기
                  </button>
                  <span className="text-[11px] text-ink-faint">체크 해제하면 숨겨요</span>
                </div>
                {MASTER_GROUPS.map((g) => (
                  <div key={g.label} className="mb-2">
                    <div className="mb-1 text-[11px] font-semibold text-ink-faint">{g.label}</div>
                    {VIEW_COLS.filter((c) => c.group === g.label).map((c) => (
                      <label key={c.key} className="flex items-center gap-2 py-0.5 text-[12px] text-ink-soft">
                        <input
                          type="checkbox"
                          id={"master-col-" + c.key}
                          checked={!hidden.includes(c.key)}
                          onChange={(e) => setHiddenCols(e.target.checked ? hidden.filter((k) => k !== c.key) : [...hidden, c.key])}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          ),
          help: <GridShortcutHelp kind="master" />,
        }}
        status={
          <>
            {formatStatus === "missing" && <span className="text-warn">서식 저장은 DB 준비(SQL 실행) 후 쓸 수 있어요</span>}
            {colorStatus === "missing" && <span className="text-warn">색 기능은 DB 준비(SQL 실행) 후 쓸 수 있어요</span>}
            {painter !== null && <span>서식 복사됨 — 붙여넣을 칸을 고르고 “서식 붙여넣기”</span>}
          </>
        }
        extras={
          <>
            <input
              ref={fileRef}
              id="master-file"
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <button type="button" disabled={importing} onClick={() => fileRef.current?.click()} className={tool}>
              {importing ? "가져오는 중…" : "엑셀 가져오기 (.xlsx)"}
            </button>
            <button
              type="button"
              disabled={importing || relinking}
              onClick={() => void onRelink()}
              title="수입진행표에 새로 들어온 건이 있으면 B/L·거래처·PO 차수로 다시 맞춰봐요"
              className={tool}
            >
              {relinking ? "연결 중…" : "수입진행표와 다시 연결"}
            </button>
            <button type="button" disabled={busy || !range} onClick={() => void showHistory()} title="선택한 행을 누가·언제·무엇으로 바꿨는지 보여줘요" className={tool}>
              변경 이력
            </button>
            <span className="mx-1 h-4 w-px shrink-0 bg-line" />
            <span className="font-semibold text-ink-soft">점검</span>
            <button type="button" className={chip(filter.check === "error")} onClick={() => setFilter((f) => ({ ...f, check: f.check === "error" ? "" : "error" }))}>
              <span style={{ color: filter.check === "error" ? undefined : ISSUE_COLOR.error }}>● </span>오류 {issueCounts.error.toLocaleString()}행
            </button>
            <button type="button" className={chip(filter.check === "any")} onClick={() => setFilter((f) => ({ ...f, check: f.check === "any" ? "" : "any" }))}>
              <span style={{ color: filter.check === "any" ? undefined : ISSUE_COLOR.warn }}>● </span>점검 필요 전체 {(issueCounts.error + issueCounts.warn + issueCounts.info).toLocaleString()}행
            </button>
            <span>
              주의 {issueCounts.warn.toLocaleString()} · 참고 {issueCounts.info.toLocaleString()} — 행 번호 옆 점에 마우스를 올리면 이유가 보여요
            </span>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-faint">
        <span>
          {view.length.toLocaleString()}행 표시 / 전체 {rows.length.toLocaleString()}행
        </span>
        <span>수량 합계 {totals.qty.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</span>
        <span>수출입금액(KRW) 합계 ₩{Math.round(totals.krw).toLocaleString("ko-KR")}</span>
        <span>
          수입진행표 연결 {linkedCount.toLocaleString()}행 · 미연결 {Math.max(0, rows.length - linkedCount).toLocaleString()}행
        </span>
        <span>칸 클릭=선택 · 드래그/Shift=범위 · 더블클릭·Enter=수정 · Ctrl+C/V 복사·붙여넣기 · Ctrl+D 아래로·Ctrl+R 오른쪽으로 채우기 · Ctrl+G 행 이동</span>
        {range && (
          <span className="text-ink-faint">
            {extras.length > 0 ? `선택: ${(selStats?.cells ?? unionCells().length).toLocaleString()}칸 (영역 ${allRanges.length}개)` : `선택: ${rowCount.toLocaleString()}행 × ${range.c2 - range.c1 + 1}열`}
          </span>
        )}
        {selStats && (
          <span className="text-ink-faint tabular-nums">
            개수 {selStats.count.toLocaleString()}
            {selStats.nums > 0 && ` · 합계 ${fmtNum(selStats.sum)} · 평균 ${fmtNum(selStats.sum / selStats.nums)} · 최소 ${fmtNum(selStats.min)} · 최대 ${fmtNum(selStats.max)}`}
          </span>
        )}
        {(saving || busy) && <span>저장 중…</span>}
        {cellError && <span className="text-warn">{cellError}</span>}
      </div>

      {Object.keys(colFilters).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-semibold text-ink-soft">열 필터</span>
          {Object.entries(colFilters).map(([k, vals]) => (
            <button key={k} type="button" className={chip(true)} onClick={() => setFilterValues(k, [])} title="이 열 필터 해제">
              {VIEW_COL_BY_KEY.get(k)?.label ?? k}: {vals.length === 1 ? (vals[0] === "" ? "(빈 칸)" : vals[0]) : vals.length + "개 값"} ×
            </button>
          ))}
          <button type="button" className="text-ink-faint underline" onClick={() => setColFilters({})}>
            모두 해제
          </button>
        </div>
      )}
      {filterCol && VIEW_COL_BY_KEY.get(filterCol) && (
        <div className="rounded-xl border border-line bg-bg-raised p-3 text-[12px]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink-soft">열 필터 — {VIEW_COL_BY_KEY.get(filterCol)?.label}</span>
            <span className="text-ink-faint">체크한 값만 보여줘요</span>
            <input
              id="master-colfilter-search"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="값 찾기"
              className={sel + " w-40"}
            />
            <button
              type="button"
              className={tool}
              onClick={() =>
                setFilterValues(
                  filterCol,
                  filterValues.filter((v) => (v.value === "" ? "(빈 칸)" : v.value).toLowerCase().includes(filterSearch.trim().toLowerCase())).map((v) => v.value)
                )
              }
            >
              보이는 값 모두 선택
            </button>
            <button type="button" className={tool} onClick={() => setFilterValues(filterCol, [])}>
              이 열 해제
            </button>
            <button type="button" className="ml-auto text-ink-faint underline" onClick={() => setFilterCol(null)}>
              닫기
            </button>
          </div>
          <div className="grid max-h-56 grid-cols-1 gap-x-4 overflow-auto sm:grid-cols-2 lg:grid-cols-4">
            {filterValues
              .filter((v) => (v.value === "" ? "(빈 칸)" : v.value).toLowerCase().includes(filterSearch.trim().toLowerCase()))
              .slice(0, 400)
              .map((v) => (
                <label key={"fv-" + v.value} className="flex items-center gap-2 py-0.5 text-ink-soft">
                  <input
                    type="checkbox"
                    id={"master-fv-" + filterCol + "-" + v.value}
                    checked={(colFilters[filterCol] ?? []).includes(v.value)}
                    onChange={() => toggleFilterValue(filterCol, v.value)}
                  />
                  <span className="truncate">{v.value === "" ? "(빈 칸)" : v.value}</span>
                  <span className="ml-auto tabular-nums text-ink-faint">{v.count.toLocaleString()}</span>
                </label>
              ))}
          </div>
          {filterValues.length > 400 && <div className="mt-1 text-ink-faint">값이 많아 앞의 400개만 보여요. 위의 "값 찾기"로 좁혀주세요.</div>}
        </div>
      )}
      {history && (
        <div className="rounded-xl border border-line bg-bg-raised p-3 text-[12px]">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-ink-soft">변경 이력 — {history.label}</span>
            <button type="button" className="text-ink-faint underline" onClick={() => setHistory(null)}>
              닫기
            </button>
          </div>
          {history.missingTable ? (
            <div className="text-warn">이력 보관용 DB 표가 아직 없어요. SQL을 실행하면 그때부터 변경 내용이 기록돼요.</div>
          ) : history.items.length === 0 ? (
            <div className="text-ink-faint">기록된 변경이 없어요 (이력은 이 기능이 켜진 뒤의 변경부터 남아요)</div>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-auto">
              {history.items.map((h) => {
                const col = VIEW_COL_BY_KEY.get(h.field);
                const what =
                  h.field === "__add" ? "행을 추가했어요" : h.field === "__delete" ? "행을 삭제했어요" : h.field === "__restore" ? "행을 되살렸어요" : `${col?.label ?? h.field}: ${h.old_value ?? "(빈 칸)"} → ${h.new_value ?? "(빈 칸)"}`;
                return (
                  <li key={h.id} className="flex flex-wrap gap-x-3 text-ink-soft">
                    <span className="tabular-nums text-ink-faint">{new Date(h.changed_at).toLocaleString("ko-KR", { hour12: false })}</span>
                    <span>{h.changed_by_name ?? "알 수 없음"}</span>
                    <span>{what}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {importMsg && <div className="rounded-lg bg-bg-sunken px-3 py-2 text-[12px] text-ink-soft whitespace-pre-line">{importMsg}</div>}

      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className={`relative overflow-auto rounded-xl border border-line bg-bg-raised outline-none focus:border-line-strong ${
          fullscreen ? "min-h-0 flex-1" : "h-[calc(100vh-330px)] min-h-[360px]"
        }`}
        style={{ fontSize: fontPx }}
      >
        <div style={{ width: totalW }}>
          <div className="sticky top-0 z-20 bg-bg-sunken font-semibold" style={{ fontSize: headFontPx }}>
            <div className="flex border-b border-line" style={{ height: groupH }}>
              <div style={{ width: noW }} className="sticky left-0 z-30 shrink-0 bg-bg-sunken" />
              {groupSpans.map((g, i) => (
                <div key={`${g.label}-${i}`} style={{ width: g.width, background: GROUP_TINT.get(g.label) }} className="shrink-0 truncate border-l border-line px-1.5 py-1 text-ink-soft">
                  {g.label}
                </div>
              ))}
            </div>
            <div className="flex border-b border-line" style={{ height: headH }}>
              <div style={{ width: noW }} className="sticky left-0 z-30 shrink-0 bg-bg-sunken px-1.5 py-1.5 text-center text-ink-faint">
                #
              </div>
              {cols.map((c, i) => (
                <div
                  key={c.key}
                  style={{ width: colW[i], background: GROUP_TINT.get(c.group) }}
                  onClick={() => toggleSort(c.key)}
                  className="shrink-0 cursor-pointer select-none overflow-hidden border-l border-line px-1.5 py-1.5 leading-tight hover:brightness-95"
                  title={c.label + " — 클릭하면 정렬해요"}
                >
                  {c.label}
                  {sort?.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                  <button
                    type="button"
                    title={c.label + " 열 필터 (값을 골라 그 값만 보기)"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterSearch("");
                      setFilterCol((cur) => (cur === c.key ? null : c.key));
                    }}
                    className={"ml-1 rounded px-1 text-[10px] leading-none " + (colFilters[c.key] ? "bg-ink text-bg" : "text-ink-faint hover:text-ink")}
                  >
                    ▾
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: view.length * rowH, position: "relative" }}>
            {visibleIdx.map((i) => {
              const r = view[i];
              if (!r) return null;
              const rowIssues: MasterIssue[] | undefined = issues.get(r.id);
              const worst = worstLevel(rowIssues);
              const rc = colors[r.id];
              const rowSelected = inAnyRow(i);
              return (
                <div
                  key={r.id}
                  className="absolute left-0 flex border-b border-line hover:bg-bg-sunken/60"
                  style={{ top: 0, height: rowH, transform: `translateY(${i * rowH}px)`, width: totalW, background: masterColorBg(rc?.row) }}
                >
                  <div
                    style={{ width: noW }}
                    className="sticky left-0 z-10 flex shrink-0 cursor-pointer select-none items-center justify-center gap-1 bg-bg-raised text-ink-faint"
                    title={[linkTitle(r), ...(rowIssues ?? []).map((x) => (x.level === "error" ? "오류: " : x.level === "warn" ? "주의: " : "참고: ") + x.text)].join("\n")}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      scrollRef.current?.focus({ preventScroll: true });
                      beginPick(e, { r: i, c: 0 }, { r: i, c: cols.length - 1 });
                    }}
                    onMouseEnter={() => dragging.current && setFocus((f) => (f ? { r: i, c: cols.length - 1 } : f))}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: r.link_count > 0 ? "var(--ft-ok,#3a8f5c)" : "var(--line-strong, #9ca3af)" }} />
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: worst ? ISSUE_COLOR[worst] : "transparent" }} />
                    <span style={{ fontWeight: rowSelected ? 700 : 400 }}>{r.source_row ?? i + 1}</span>
                  </div>
                  {cols.map((c, ci) => {
                    const isEditing = editing?.id === r.id && editing.key === c.key;
                    const raw = c.type === "calc" ? (c.calc ? c.calc(r) : null) : (get(r, c.key) as string | number | null | undefined);
                    const text = fmt(raw, c.type);
                    const inRange = inAnyRange(i, ci);
                    const isActive = !!focus && focus.r === i && focus.c === ci;
                    const cellIssue = rowIssues?.find((x) => x.field === c.key);
                    const cellBg = masterColorBg(rc?.cells[c.key]);
                    const style: CSSProperties = { width: colW[ci], ...formatStyle(formats[r.id]?.[c.key]) };
                    if (cellBg) style.backgroundColor = cellBg;
                    if (cellIssue) style.backgroundImage = `linear-gradient(225deg, ${ISSUE_COLOR[cellIssue.level]} 0, ${ISSUE_COLOR[cellIssue.level]} 7px, transparent 7px)`;
                    if (inRange && !isEditing) style.boxShadow = "inset 0 0 0 200px rgba(59, 130, 246, 0.13)";
                    if (isActive) {
                      style.outline = "2px solid rgb(59, 130, 246)";
                      style.outlineOffset = "-2px";
                    }
                    return (
                      <div
                        key={c.key}
                        style={style}
                        onMouseDown={(e) => {
                          if (isEditing) return;
                          if (editingRef.current) commitEdit();
                          scrollRef.current?.focus({ preventScroll: true });
                          beginPick(e, { r: i, c: ci }, { r: i, c: ci });
                        }}
                        onMouseEnter={() => dragging.current && setFocus({ r: i, c: ci })}
                        onDoubleClick={() => startEdit(i, ci)}
                        className={`shrink-0 select-none truncate border-l border-line px-1.5 ${c.type === "num" || c.type === "calc" ? "text-right tabular-nums" : ""} ${
                          c.type === "calc" ? "text-ink-faint" : ""
                        }`}
                        title={[text, cellIssue?.text].filter(Boolean).join("\n") || undefined}
                      >
                        <div style={{ lineHeight: rowH - 1 + "px" }} className={isEditing ? "hidden" : "truncate"}>
                          {text}
                        </div>
                        {isEditing && (
                          <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => commitEdit()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitEdit("down");
                              } else if (e.key === "Tab") {
                                e.preventDefault();
                                commitEdit(e.shiftKey ? "left" : "right");
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            style={{ height: rowH - 4, fontSize: fontPx }}
                            className="w-full rounded border border-line-strong bg-bg px-1 outline-none"
                            placeholder={c.type === "date" ? "YYYY-MM-DD" : undefined}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
