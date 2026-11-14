export interface SupabasePublicEnvironment {
  url: string;
  publishableKey: string;
}

/**
 * Only returns public client configuration. Never reads or exposes a
 * service-role key; server-side user queries rely on the caller's JWT + RLS.
 */
export function getSupabasePublicEnvironment(): SupabasePublicEnvironment | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return null;
  } catch {
    return null;
  }

  return { url, publishableKey };
}
