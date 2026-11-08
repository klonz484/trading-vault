import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = safeInternalRedirect(url.searchParams.get("next"), url.origin);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (code && supabaseUrl && publishableKey) {
    const response = NextResponse.redirect(new URL(destination, url.origin));
    const supabase = createServerClient(supabaseUrl, publishableKey, { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({name,value,options}) => response.cookies.set(name,value,options)),
    }});
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }
  return NextResponse.redirect(new URL("/?password_reset_error=1", url.origin));
}
