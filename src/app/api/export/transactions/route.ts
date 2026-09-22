// 10 통합조회 — 자재이동 이력 검색 결과를 .xlsx로 출력 (purchase-records
// 출력 라우트와 동일한 패턴 — 이유는 그 파일 상단 주석 참고).
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { exportTransactions, type TransactionSearchFilter } from "@/lib/actions/reports";

const TXN_TYPE_LABEL: Record<string, string> = { IN: "입고", PRD: "생산불출", MOV: "창고이동", SHP: "택배발송", RET: "반납", ADJ: "재고실사" };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  // 2026-09-22, Kevin 요청("현장 작업자별 PIS 접근권한"): 이 화면(10
  // 통합조회)은 "업무" 그룹이라 role='admin'이 아니어도 pis_access=true인
  // 현장 계정이면 접근을 허용한다 — exportTransactions() 자체(reports.ts
  // requirePisAccess())와 동일한 기준으로 맞춤.
  const { data: profile } = await supabase.from("profiles").select("role, pis_access").eq("id", user.id).maybeSingle();
  if (!profile || (profile.role !== "admin" && !profile.pis_access)) {
    return NextResponse.json({ error: "PIS 접근 권한이 없습니다" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const txnTypeParam = sp.get("txnType");
  const filter: TransactionSearchFilter = {
    sinceIso: sp.get("since") || undefined,
    untilIso: sp.get("until") || undefined,
    txnType: (["IN", "PRD", "MOV", "SHP", "RET", "ADJ"] as const).includes(txnTypeParam as never)
      ? (txnTypeParam as TransactionSearchFilter["txnType"])
      : undefined,
    locationCode: sp.get("location") || undefined,
    departmentId: sp.get("department") || undefined,
    itemQuery: sp.get("item") || undefined,
  };

  const { rows, truncated } = await exportTransactions(filter);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("자재이동");
  sheet.columns = [
    { header: "일자", key: "txn_date", width: 12 },
    { header: "구분", key: "txn_type_label", width: 10 },
    { header: "출발 창고", key: "from_location_code", width: 12 },
    { header: "도착 창고", key: "to_location_code", width: 12 },
    { header: "부서", key: "department_name", width: 14 },
    { header: "처리자", key: "processed_by_name", width: 12 },
    { header: "품목", key: "item_summary", width: 40 },
    { header: "사유", key: "reason", width: 16 },
    { header: "비고", key: "note", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    sheet.addRow({
      txn_date: r.txn_date,
      txn_type_label: TXN_TYPE_LABEL[r.txn_type] ?? r.txn_type,
      from_location_code: r.from_location_code ?? "-",
      to_location_code: r.to_location_code ?? "-",
      department_name: r.department_name ?? "-",
      processed_by_name: r.processed_by_name ?? "-",
      item_summary: r.items.map((i) => `${i.item_name}(${i.qty})`).join(", "),
      reason: r.reason ?? "-",
      note: r.note ?? "-",
    });
  }
  if (truncated) {
    sheet.addRow({});
    sheet.addRow({ txn_date: `※ 상한(20,000건)을 넘어 일부만 출력됨 — 검색 조건을 좁혀주세요.` });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `자재이동이력_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
