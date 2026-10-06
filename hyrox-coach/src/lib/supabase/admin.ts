import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Service-role client for the AI Coach API. It bypasses RLS, so it is only used
 * after a bearer token has been verified, and every query made with it must be
 * scoped to that token's user_id (see src/lib/data/*). Never import this from
 * client components; `server-only` makes that a build error.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY for the coach API.");
  }
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
