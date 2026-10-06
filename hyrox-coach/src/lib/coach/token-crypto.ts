import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Coach API tokens look like `hxc_<43 base64url chars>` (256 bits of entropy). */
export const TOKEN_PREFIX = "hxc_";
const TOKEN_PATTERN = /^hxc_[A-Za-z0-9_-]{43}$/;

export function generateCoachToken(): { token: string; hash: string; displayPrefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashCoachToken(token), displayPrefix: token.slice(0, 12) };
}

/** Only this SHA-256 hash is stored; the token itself is shown once. */
export function hashCoachToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function looksLikeCoachToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
