import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateCoachToken } from "@/lib/coach/token-crypto";
import type { Database } from "@/lib/supabase/database.types";

export type Client = SupabaseClient<Database>;

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = () => process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const APP_URL = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function adminClient(): Client {
  return createClient<Database>(url(), serviceKey(), noSession);
}

export function anonClient(): Client {
  return createClient<Database>(url(), anonKey(), noSession);
}

export type TestUser = { id: string; email: string; client: Client };

/** Creates a confirmed user and returns a client signed in as that user (subject to RLS). */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
  const password = `pw-${Math.random().toString(36).slice(2)}-X1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`);
  return { id: data.user.id, email, client };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (!user) return;
  await adminClient().auth.admin.deleteUser(user.id);
}

export async function createToken(
  userId: string,
  opts: { scopes?: Array<"read" | "write">; expiresAt?: string | null; revoked?: boolean } = {},
): Promise<{ token: string; id: string }> {
  const { token, hash, displayPrefix } = generateCoachToken();
  const { data, error } = await adminClient()
    .from("coach_api_tokens")
    .insert({
      user_id: userId,
      name: "test",
      token_hash: hash,
      token_prefix: displayPrefix,
      scopes: opts.scopes ?? ["read", "write"],
      expires_at: opts.expiresAt ?? null,
      revoked_at: opts.revoked ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createToken: ${error.message}`);
  return { token, id: data.id };
}

export async function api(path: string, opts: { token?: string; method?: string; body?: unknown } = {}) {
  const res = await fetch(`${APP_URL()}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any };
}

export function todayTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}
