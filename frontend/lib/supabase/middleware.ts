import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;

  // Public routes: skip auth entirely (no token work needed)
  if (
    pathname.startsWith("/apply/") ||
    pathname.startsWith("/auth/") ||
    pathname === "/"
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Forward updated cookies to the request so downstream server
          // components see the refreshed tokens.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Rebuild supabaseResponse so its Set-Cookie headers carry the
          // updated (or cleared) tokens.  Every call to setAll replaces the
          // previous response; the final value is what gets returned.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) {
      user = data.user;
    }
    // On auth failure (invalid/expired refresh token) the Supabase auth
    // library has already called setAll() internally to clear the bad
    // cookies.  supabaseResponse now carries the deletion headers.
    // We must NOT discard supabaseResponse when redirecting — see below.
  } catch {
    // Network or unexpected error — treat as unauthenticated.
  }

  // Build a redirect response that also carries any Set-Cookie headers
  // accumulated in supabaseResponse (e.g. the cleared auth cookies after a
  // token-refresh failure).  Without this, the bad refresh token stays in
  // the browser and every subsequent request logs the same AuthApiError.
  function redirectTo(dest: string): NextResponse {
    const url = request.nextUrl.clone();
    const [pathname, search] = dest.split("?");
    url.pathname = pathname;
    url.search = search ? `?${search}` : "";
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) =>
      res.cookies.set(c.name, c.value, c)
    );
    return res;
  }

  // Admin / recruiter routes
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/candidates") ||
    pathname.startsWith("/templates") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/settings")
  ) {
    if (!user) return redirectTo("/auth/login");
  }

  // Candidate portal / interview routes
  if (pathname.startsWith("/portal") || pathname.startsWith("/interview")) {
    if (!user) return redirectTo("/auth/login?type=candidate");
  }

  return supabaseResponse;
}
