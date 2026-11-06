import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Fail closed if Supabase is not configured.
  if (!supabaseUrl || !supabasePublishableKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const ownerUserId = process.env.TRADING_VAULT_OWNER_USER_ID;
  const isOwner = Boolean(ownerUserId && claims?.sub === ownerUserId);
  const pathname = request.nextUrl.pathname;
  const isPasswordRecoveryPage =
    pathname === "/forgot-password" || pathname === "/reset-password";
  const isAuthCallback = pathname === "/auth/callback";
  const isLoginPage = pathname === "/login";
  const isPublicPath = isLoginPage || isPasswordRecoveryPage || isAuthCallback;

  // The old signup URL must never expose a registration form.
  if (pathname === "/signup" || pathname.startsWith("/signup/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!isOwner) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: ownerUserId
            ? "Authentication required: this workspace is restricted to its owner."
            : "Owner access is not configured for this deployment.",
        },
        { status: ownerUserId ? 401 : 503 },
      );
    }

    if (!isPublicPath) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set(
        "error",
        ownerUserId ? (claims ? "owner_only" : "sign_in_required") : "owner_config_missing",
      );
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      const redirect = NextResponse.redirect(loginUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirect.cookies.set(cookie);
      });
      return redirect;
    }

    return supabaseResponse;
  }

  // An owner with a valid session should not remain on login/recovery screens.
  if (isOwner && (isLoginPage || isPasswordRecoveryPage)) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
