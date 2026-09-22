import { NextResponse, after } from "next/server";
import { runEcountPullCore } from "@/lib/ecount-pull";

// Triggered externally every ~30 minutes by a GitHub Actions scheduled
// workflow (.github/workflows/ecount-pull.yml) — same reasoning as
// /api/cron/ecount-flush (Vercel's Hobby plan only allows once-a-day Cron
// Jobs, and /api/cron/* is exempted from the login-redirect middleware in
// src/proxy.ts). Tier2 #5 in the PIS/IMMS roadmap: this used to be a
// manual-only "지금 동기화" button on /admin/ecount-sync — meaning 품목
// 마스터/발주서 data was only ever as fresh as the last time an admin
// remembered to click it. Now it also runs on a schedule; the button still
// works for an on-demand run in between.
//
// Reuses ECOUNT_FLUSH_SECRET (the same shared secret already configured in
// both Vercel and this repo's GitHub Actions secrets for the transfer
// flush) rather than asking Kevin to set up a second one — both routes are
// the same kind of thing (an internal cron-only endpoint), so one shared
// secret is simpler than two nearly-identical ones. Rename to something
// like CRON_SECRET later if a third scheduled job makes "FLUSH" in the name
// actively confusing.
//
// maxDuration: fetchItemMasterList() can now take up to ~50 sequential
// calls (see src/lib/ecount.ts's FROM_PROD_CD pagination, ~1.1s apart to
// respect 품목조회's 1-call/sec production limit) — worst case approaches
// a minute. UNVERIFIED: 60s assumes this project's current Vercel plan/
// Fluid Compute setting actually allows a 60s function duration; confirm
// against the Vercel project's Functions settings before trusting this
// doesn't just get killed mid-run on a real large catalog. If it does get
// killed, the transaction stays as separate upsert batches already
// committed rather than one all-or-nothing operation, so a mid-run kill
// loses progress but doesn't corrupt data — worth revisiting to a
// checkpoint/resume design if 60s ever isn't enough.
export const maxDuration = 60;

// 2026-09-21, cron-job.org 이전 후 발견: cron-job.org 무료 플랜의 요청
// Timeout은 30초가 하드 캡(60초로 올리려 하면 "The maximum timeout is 30
// seconds" 에러로 저장 자체가 거부됨 — 직접 확인, 유료 플랜이 아닌 이상
// 우리 쪽에서 늘릴 수 없음). 반면 이 라우트의 실제 작업(품목조회 페이지네이션
// + 발주서조회)은 위 maxDuration 설명대로 30초를 넘기는 경우가 흔하다.
// cron-job.org가 30초 뒤 연결을 끊어버려도 Vercel 함수 자체는 계속 실행돼
// 실제 동기화는 대부분 정상 완료되고 있음을 Supabase ecount_sync_log로
// 직접 확인했지만(CLAUDE.md 참고), cron-job.org 대시보드에는 "Failed
// (timeout)"으로 잘못 표시되고, 여기 딸린 "연속 실패 시 자동 비활성화"
// 기능이 이 오탐 누적으로 언젠가 이 작업을 꺼버릴 위험이 있었다.
//
// 해결: Next.js `after()`(v15.1+ 안정 API, Vercel의 `waitUntil`로 구현됨 —
// 응답을 먼저 보내고 나서도 maxDuration까지 함수가 계속 살아있게 함)를 써서
// 인증만 확인한 뒤 즉시 200을 반환하고, 실제 동기화는 응답 전송 후
// 백그라운드에서 계속 실행한다. cron-job.org는 이제 몇 초 안에 진짜 성공
// 응답을 받으므로 더 이상 타임아웃으로 오탐하지 않는다. 동기화 자체의
// 성공/실패는 여전히 runEcountPullCore 내부에서 매번 ecount_sync_log에
// 기록되므로(성공/실패 판단 기준은 그대로), 실제 결과 확인은 /admin/
// ecount-sync 페이지나 그 테이블로 하면 된다 — 이 라우트의 HTTP 응답은
// 이제 "동기화가 시작됐다"는 뜻이지 "끝났다/성공했다"는 뜻이 아니다.
export async function GET(request: Request) {
  const secret = process.env.ECOUNT_FLUSH_SECRET;
  const authHeader = request.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  after(async () => {
    try {
      const result = await runEcountPullCore(30);
      console.log("ecount-pull (background) finished:", JSON.stringify(result));
    } catch (e) {
      // runEcountPullCore already logs every known failure mode to
      // ecount_sync_log itself before returning — this catch only exists
      // for a genuinely unexpected throw (a real bug), so it doesn't
      // vanish as a silent unhandled rejection now that nothing awaits
      // this call directly.
      console.error("ecount-pull (background) crashed unexpectedly:", e);
    }
  });

  return NextResponse.json({ ok: true, started: true });
}
