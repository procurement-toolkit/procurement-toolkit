// 10 통합조회 — 구매현황 검색 결과를 .xlsx로 출력. Server Action은 브라우저
// 다운로드(Content-Disposition)를 직접 트리거하기 번거로워 Route Handler로
// 만든다 — 인증은 다른 보호된 API 라우트와 동일하게 이 파일 안에서 직접
// 세션을 확인한다(admin/reports 페이지의 검색 폼이 이 URL로 링크만 걸면
// 브라우저가 그대로 다운로드).
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { exportPurchaseRecords, type PurchaseSearchFilter } from "@/lib/actions/reports";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "관리자만 사용할 수 있습니다" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const filter: PurchaseSearchFilter = {
    sinceIso: sp.get("since") || undefined,
    untilIso: sp.get("until") || undefined,
    itemQuery: sp.get("item") || undefined,
    supplierQuery: sp.get("supplier") || undefined,
    category: sp.get("category") || undefined,
  };

  const { rows, truncated } = await exportPurchaseRecords(filter);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("구매현황");
  sheet.columns = [
    { header: "구매일", key: "purchase_date", width: 12 },
    { header: "거래처", key: "supplier_name", width: 24 },
    { header: "품목코드", key: "item_code", width: 14 },
    { header: "품목명", key: "item_name", width: 30 },
    { header: "수량", key: "qty", width: 10 },
    { header: "단가", key: "unit_price", width: 12 },
    { header: "공급가액", key: "supply_amount", width: 14 },
    { header: "부가세", key: "vat_amount", width: 12 },
    { header: "합계", key: "total_amount", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) sheet.addRow(r);
  if (truncated) {
    sheet.addRow({});
    sheet.addRow({ purchase_date: `※ 상한(20,000건)을 넘어 일부만 출력됨 — 검색 조건을 좁혀주세요.` });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `구매현황_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
