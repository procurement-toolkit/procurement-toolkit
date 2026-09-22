import { NextResponse } from "next/server";
import { runEcountTransferFlush } from "@/lib/ecount-flush";

// Triggered externally every ~10 minutes by a GitHub Actions scheduled
// workflow (.github/workflows/ecount-flush.yml) — NOT by Vercel's own Cron
// Jobs, because this project is on Vercel's Hobby plan, which only allows
// once-a-day cron schedules (a sub-daily vercel.json cron entry fails at
// deploy time on Hobby). See CLAUDE.md for the full writeup.
//
// Protected by a shared secret (ECOUNT_FLUSH_SECRET, set the same value in
// both Vercel's env vars and the GitHub Actions repo secret) so this can't
// be triggered by anyone else to burn through E-Count's rate-limited call.
export async function GET(request: Request) {
  const secret = process.env.ECOUNT_FLUSH_SECRET;
  const authHeader = request.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runEcountTransferFlush();
  return NextResponse.json(result);
}
