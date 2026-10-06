"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, assertPublicSupabaseEnv } from "@/lib/env";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | undefined;

/** Browser client: uses the signed-in user's session, so every query is subject to RLS. */
export function createClient() {
  assertPublicSupabaseEnv();
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return browserClient;
}
