import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user for this request (verified with Supabase Auth), or a
 * redirect to /login. proxy.ts already guards pages; this is the server-side
 * check every page, action and route handler relies on.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? null };
});
