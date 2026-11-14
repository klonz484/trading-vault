import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { createClient } from "./server";

export interface UserScopedSupabase {
  supabase: SupabaseClient<Database>;
  userId: string;
}

/**
 * Returns a client only when the cookie session contains a verified JWT.
 * The returned user ID comes from validated claims, never request input.
 */
export async function createUserScopedSupabase(): Promise<UserScopedSupabase | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) return null;

  const userId = data.claims?.sub;
  if (typeof userId !== "string" || userId.length === 0) return null;

  return { supabase, userId };
}
