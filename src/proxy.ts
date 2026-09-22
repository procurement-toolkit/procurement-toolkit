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
      .select("role, is_active")
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

    if (request.nextUrl.pathname.startsWith("/admin") && profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/m";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
