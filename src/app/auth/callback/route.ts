import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const destination = safeInternalRedirect(url.searchParams.get("next"), url.origin);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && publishableKey && (code || (tokenHash && otpType === "recovery"))) {
    const response = NextResponse.redirect(new URL(destination, url.origin));
    const supabase = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });

    // Support both Supabase PKCE links (code) and recovery email templates
    // that send a token hash directly to this server-side callback.
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash!,
          type: "recovery",
        });

    if (!error) return response;
  }

  return NextResponse.redirect(new URL("/login?error=password_reset_failed", url.origin));
}
