import { NextRequest, NextResponse } from "next/server";
import { getStockForItem } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const itemCode = request.nextUrl.searchParams.get("item") ?? "";
  if (!itemCode) return NextResponse.json({ stock: [] });
  const stock = await getStockForItem(itemCode);
  return NextResponse.json({ stock });
}
