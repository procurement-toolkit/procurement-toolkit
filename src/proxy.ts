import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

// Routes that authenticate themselves (not via the Supabase session cookie)
// and must never be redirected to /login. /api/cron/ecount-flush is called
// by a GitHub Actions scheduled workflow with no browser session at all —
// it carries its own shared-secret Bearer token instead (checked inside the
// route handler itself, see src/app/api/cron/ecount-flush/route.ts). Found
// 2026-09-10: without this exemption, every cron call was silently caught
// by the `!user` redirect below and bounced to /login before ever reaching
// the route handler — the GitHub Actions job still reported "success"
// because curl doesn't treat a 307 redirect as a failure by default, so the
// batch flush looked like it was working while it never actually ran.
const AUTH_EXEMPT_PATHS = ["/api/cron"];

// 2026-09-22, Kevin 요청: "현장 작업자라도 pis로 넘어 갈 수 있는 접근권한을
// 관리자가 주거나 막을 수 있도록" — AdminSidebar.tsx의 "관리" 그룹(사용자
// 관리/품목 재고기준/E-Count 동기화/구매현황 업로드/재고 Reconciliation)에
// 해당하는 경로만 여전히 role='admin' 전용으로 남기고, 나머지 /admin
// 경로("업무" 10개 화면 + 그 하위 approval-review)는 profiles.pis_access
// =true인 현장 계정도 들어올 수 있게 한다. 이 목록은 AdminSidebar.tsx의
// ADMIN_ITEMS와 정확히 일치해야 한다 — 항목을 추가/삭제할 때 항상 같이
// 수정할 것(안 맞으면 사이드바엔 안 보이는데 URL 직접 입력으론 들어가지는,
// 또는 그 반대의 불일치가 생김).
const ADMIN_ONLY_PATHS = [
  "/admin/users",
  "/admin/items",
  "/admin/ecount-sync",
  "/admin/purchase-import",
  "/admin/stock-reconciliation",
];

export async function proxy(request: NextRequest) {
  // Checked before touching Supabase at all: no session cookie will ever
  // exist for these calls, so there's nothing to look up.
  if (AUTH_EXEMPT_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  // "/" used to be carved out here (skip the redirect) so the root URL fell
  // through to the untouched create-next-app page.tsx — meaning anyone who
  // visited hkimms.vercel.app directly (rather than a deep link like /login)
  // saw the raw Next.js starter template instead of the app. Fixed 2026-09-10:
  // "/" is protected like any other route now, and page.tsx itself redirects
  // signed-in users onward by role. See CLAUDE.md for the full writeup.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active, pis_access")
      .eq("id", user.id)
      .maybeSingle();

    // Deactivated accounts are bounced immediately even with a still-valid
    // session cookie — this is what makes "assign 해제" in the admin
    // dashboard take effect right away instead of waiting for the session
    // to naturally expire.
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("deactivated", "1");
      return NextResponse.redirect(url);
    }

    if (request.nextUrl.pathname.startsWith("/admin")) {
      const isAdmin = profile?.role === "admin";
      const hasPisAccess = isAdmin || profile?.pis_access === true;
      const isAdminOnlyPath = ADMIN_ONLY_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

      if (isAdminOnlyPath ? !isAdmin : !hasPisAccess) {
        const url = request.nextUrl.clone();
        // PIS 접근 권한은 있지만 관리자 전용 경로에 들어오려 한 현장
        // 계정은 /admin(PIS 홈)으로, 아예 접근 권한이 없는 계정은
        // /m(IMMS 홈)으로 — 각자 실제로 쓸 수 있는 화면으로 돌려보낸다.
        url.pathname = hasPisAccess ? "/admin" : "/m";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
