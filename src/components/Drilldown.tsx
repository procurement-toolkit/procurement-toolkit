"use client";

// 2026-09-18, Kevin 요청: "PIS에 디스플레이되는 모든 숫자들은 그걸 누르면,
// 실제로 어떻게 그 값들이 표기되었는지 상세내용으로 이동해서 이해하고
// 인사이트를 얻을 수 있도록" — 대시보드 숫자를 감싸는 범용 드릴다운.
//
// **왜 함수 prop을 안 쓰는가(중요, 재발 방지용 기록):** 최초 구현에서는
// 서버 컴포넌트(admin/page.tsx)가 "테이블 행 클릭 콜백"을 클로저 함수로
// 만들어 이 클라이언트 컴포넌트에 trigger={(open) => <tr onClick={open}>…}
// 형태로 넘기고, columns={[{render: (r) => …}]}처럼 셀 포맷 함수도 배열
// 안에 넣어 넘겼다. 둘 다 실제 배포(Vercel)에서
// "Functions cannot be passed directly to Client Components unless you
// explicitly expose it by marking it with 'use server'" 런타임 에러로
// /admin 전체가 500을 냈다 — 로컬 tsc/eslint/next build로는 안 잡히고
// Vercel 런타임 로그를 직접 확인해서야 발견했다(이 세션의 교훈: 이
// 페이지처럼 인증이 필요한 동적 라우트는 `next build`가 실제로 실행해보지
// 않으므로, 로컬 빌드 통과가 런타임 정상 동작을 보장하지 않는다).
// 원인: Next.js는 서버 컴포넌트 → 클라이언트 컴포넌트로 "use server"
// 액션이 아닌 일반 함수를 prop으로 넘기는 걸 허용하지 않는다(직렬화 불가).
// **고침:** ① 테이블 행 트리거는 함수 대신 `as="row"` 플래그 + 순수
// ReactNode(<td> 목록)로 받고, <tr onClick=...>는 이 클라이언트 컴포넌트
// 자신이 직접 만든다(핸들러가 이 파일 안에서 정의되므로 경계를 넘지
// 않는다). ② 컬럼 서식은 함수(render) 대신 "won"/"number"/"pct"/"date"
// 같은 문자열 포맷 지정자로 받고, 실제 포맷 함수는 이 클라이언트 파일
// 안에 정의한다. ③ purchase_records 원본 조회(getPurchaseRecordDetail)는
// 서버가 함수를 prop으로 넘기는 대신, 이 클라이언트 컴포넌트가 직접
// import해서 클릭 시점에 호출한다(Server Action을 클라이언트 컴포넌트가
// 직접 import해서 호출하는 건 Next.js가 지원하는 정상 패턴).
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { getPurchaseRecordDetail, type PurchaseRecordDetailFilter, type PurchaseRecordDetailRow } from "@/lib/actions/pis-dashboard";

export type ColumnFormat = "text" | "number" | "won" | "pct" | "date";
export type DrilldownColumn = { key: string; label: string; align?: "left" | "right"; format?: ColumnFormat };

function formatWon(n: number) {
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}
function formatNumber(n: number) {
  return n.toLocaleString("ko-KR");
}
function formatPct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}
function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}

function formatCell(value: unknown, format?: ColumnFormat): React.ReactNode {
  if (value === null || value === undefined || value === "") return "-";
  switch (format) {
    case "won":
      return formatWon(Number(value));
    case "number":
      return formatNumber(Number(value));
    case "pct":
      return formatPct(Number(value));
    case "date":
      return formatDateShort(String(value));
    default:
      return String(value);
  }
}

function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function DrilldownModal({
  title,
  description,
  footnote,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  footnote?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-bg-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-[15px] font-bold text-ink">{title}</h3>
            {description && <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pressable shrink-0 rounded-full px-2 py-1 text-ink-faint hover:bg-bg-sunken active:bg-bg-sunken"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">
          {children}
          {footnote && <p className="mt-3 text-[11px] text-ink-faint">{footnote}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

function DrilldownTable({ columns, rows, emptyText }: { columns: DrilldownColumn[]; rows: Record<string, unknown>[]; emptyText: string }) {
  if (rows.length === 0) return <p className="py-8 text-center text-[13px] text-ink-faint">{emptyText}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12.5px] tabular-nums">
        <thead>
          <tr className="border-b border-line bg-bg-sunken text-[10.5px] uppercase tracking-wide text-ink-faint">
            {columns.map((c) => (
              <th key={c.key} className={`px-2.5 py-1.5 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={`px-2.5 py-1.5 ${c.align === "right" ? "text-right" : ""}`}>
                  {formatCell(row[c.key], c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- 정적 데이터(서버가 이미 계산해서 들고 있는 배열)를 보여주는 범용 드릴다운 ----
export function Drilldown({
  trigger,
  as = "button",
  title,
  description,
  columns,
  rows,
  emptyText = "표시할 상세 데이터가 없습니다.",
  footnote,
}: {
  trigger: React.ReactNode;
  as?: "button" | "row";
  title: string;
  description?: string;
  columns?: DrilldownColumn[];
  rows?: Record<string, unknown>[];
  emptyText?: string;
  footnote?: string;
}) {
  const [open, setOpen] = useState(false);
  useEscapeToClose(open, () => setOpen(false));

  return (
    <>
      {as === "row" ? (
        <tr
          onClick={() => setOpen(true)}
          className="pressable cursor-pointer border-b border-line align-top last:border-0 hover:bg-bg-sunken active:bg-bg-sunken"
        >
          {trigger}
        </tr>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pressable block w-full rounded-xl text-left active:scale-[0.98]"
          aria-haspopup="dialog"
        >
          {trigger}
        </button>
      )}
      {open && (
        <DrilldownModal title={title} description={description} footnote={footnote} onClose={() => setOpen(false)}>
          {columns && rows ? <DrilldownTable columns={columns} rows={rows} emptyText={emptyText} /> : null}
        </DrilldownModal>
      )}
    </>
  );
}

// ---- purchase_records 원본 전표를 클릭 시점에 직접 조회해서 보여주는 전용 드릴다운 ----
// 여러 섹션(업체별/품목별/카테고리별 구매액, 가격절감분석, 재고 항목의
// 참고 구매이력, 단일 공급업체 품목)이 전부 이 컴포넌트 하나를 재사용한다.
const PURCHASE_DETAIL_COLUMNS: DrilldownColumn[] = [
  { key: "date", label: "구매일", format: "date" },
  { key: "supplier", label: "거래처" },
  { key: "item", label: "품목" },
  { key: "qty", label: "수량", align: "right", format: "number" },
  { key: "unit_price", label: "단가", align: "right", format: "won" },
  { key: "amount", label: "공급가액", align: "right", format: "won" },
];

function toPurchaseDetailRow(r: PurchaseRecordDetailRow): Record<string, unknown> {
  return {
    date: r.purchase_date,
    supplier: r.supplier_name || "미지정",
    item: `${r.item_name} (${r.item_code})`,
    qty: r.qty,
    unit_price: r.unit_price,
    amount: r.supply_amount,
  };
}

export function PurchaseDetailDrilldown({
  trigger,
  as = "button",
  title,
  description,
  filter,
  footnote,
}: {
  trigger: React.ReactNode;
  as?: "button" | "row";
  title: string;
  description: string;
  filter: PurchaseRecordDetailFilter;
  footnote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PurchaseRecordDetailRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEscapeToClose(open, () => setOpen(false));

  function handleOpen() {
    setOpen(true);
    if (rows === null) {
      setError(null);
      startTransition(async () => {
        try {
          const result = await getPurchaseRecordDetail(filter);
          setRows(result);
        } catch {
          setError("상세 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
      });
    }
  }

  return (
    <>
      {as === "row" ? (
        <tr
          onClick={handleOpen}
          className="pressable cursor-pointer border-b border-line align-top last:border-0 hover:bg-bg-sunken active:bg-bg-sunken"
        >
          {trigger}
        </tr>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="pressable block w-full rounded-xl text-left active:scale-[0.98]"
          aria-haspopup="dialog"
        >
          {trigger}
        </button>
      )}
      {open && (
        <DrilldownModal title={title} description={description} footnote={footnote} onClose={() => setOpen(false)}>
          {pending ? (
            <p className="py-8 text-center text-[13px] text-ink-faint">불러오는 중…</p>
          ) : error ? (
            <p className="py-8 text-center text-[13px] text-warn">{error}</p>
          ) : (
            <DrilldownTable
              columns={PURCHASE_DETAIL_COLUMNS}
              rows={(rows ?? []).map(toPurchaseDetailRow)}
              emptyText="조건에 맞는 구매 전표를 찾을 수 없습니다."
            />
          )}
        </DrilldownModal>
      )}
    </>
  );
}
