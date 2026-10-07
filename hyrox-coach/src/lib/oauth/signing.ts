import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed values for OAuth (client ids, authorization codes): a
 * base64url JSON payload plus an HMAC-SHA256 tag. No table or migration is
 * needed; the key is derived from OAUTH_SIGNING_SECRET, or else from the
 * Supabase secret key with a fixed domain-separation prefix.
 */
function signingKey(): Buffer {
  const secret = process.env.OAUTH_SIGNING_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("OAUTH_SIGNING_SECRET or SUPABASE_SECRET_KEY is required for OAuth.");
  return createHash("sha256").update(`hyrox-coach-oauth-v1:${secret}`, "utf8").digest();
}

function tag(kind: string, body: string): string {
  return createHmac("sha256", signingKey()).update(`${kind}.${body}`).digest("base64url");
}

/** `exp` (seconds since epoch) is checked by verifySigned when present. */
export function signValue(kind: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${tag(kind, body)}`;
}

export function verifySigned<T extends Record<string, unknown>>(kind: string, value: string | null | undefined): T | null {
  if (!value || value.length > 4096) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1), "base64url");
  const expected = Buffer.from(tag(kind, body), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** PKCE S256: base64url(SHA-256(verifier)) must equal the challenge sent to /authorize. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier, "ascii").digest("base64url"));
  const given = Buffer.from(challenge);
  return computed.length === given.length && timingSafeEqual(computed, given);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
