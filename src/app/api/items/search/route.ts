import { NextRequest, NextResponse } from "next/server";
import { searchItems } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const items = await searchItems(q);
  return NextResponse.json({ items });
}
