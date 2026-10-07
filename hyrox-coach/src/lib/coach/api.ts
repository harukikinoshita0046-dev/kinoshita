import "server-only";

import { after, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getProfile, profileToday, type Profile } from "@/lib/data/profile";
import { DataError } from "@/lib/data/util";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/supabase/types";
import { hashCoachToken, looksLikeCoachToken } from "./token-crypto";

export type Scope = "read" | "write";

export type CoachContext = {
  db: Db;
  userId: string;
  tokenId: string;
  scopes: Scope[];
  profile: Profile;
  today: string;
  req: NextRequest;
  /** Parsed JSON body for POST/PUT/PATCH (undefined for GET/DELETE). */
  body: unknown;
};

/** Error with an HTTP status and a stable machine-readable code for the AI client. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = Number(process.env.COACH_API_RATE_LIMIT_PER_MINUTE ?? 60);
const FAILED_AUTH_LIMIT = 30; // per IP per 10 minutes

function errorResponse(status: number, code: string, message: string, details?: unknown, headers?: HeadersInit) {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status, headers });
}

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

type Verified = { tokenId: string; userId: string; scopes: Scope[] };

async function verifyToken(db: Db, token: string): Promise<Verified | null> {
  if (!looksLikeCoachToken(token)) return null;
  const { data, error } = await db
    .from("coach_api_tokens")
    .select("id, user_id, scopes, revoked_at, expires_at")
    .eq("token_hash", hashCoachToken(token))
    .maybeSingle();
  if (error) throw new DataError(`verify token: ${error.message}`);
  if (!data || data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
  return { tokenId: data.id, userId: data.user_id, scopes: data.scopes as Scope[] };
}

/** Checks a coach token without serving a request (used by the MCP endpoint before it dispatches tools). */
export async function authenticateCoachToken(token: string | null): Promise<{ userId: string; scopes: Scope[] } | null> {
  if (!token) return null;
  const v = await verifyToken(createAdminClient(), token);
  return v ? { userId: v.userId, scopes: v.scopes } : null;
}

async function countSince(db: Db, column: "token_id" | "ip", value: string, sinceMs: number, onlyFailures = false) {
  let q = db
    .from("api_request_logs")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  if (onlyFailures) q = q.is("token_id", null).in("status", [401, 403]);
  const { count, error } = await q;
  if (error) throw new DataError(`rate limit: ${error.message}`);
  return count ?? 0;
}

/**
 * Wraps an /api/coach/* route handler:
 *   bearer token (SHA-256 lookup, revocation, expiry) -> scope check ->
 *   per-token rate limit -> JSON body parsing with a size cap -> handler ->
 *   uniform JSON errors -> request log + last_used_at (after the response).
 * Every handler receives the token owner's user id and must scope queries to it.
 */
export function coachRoute<P extends Record<string, string> = Record<string, never>>(
  scope: Scope,
  handler: (ctx: CoachContext, params: P) => Promise<unknown>,
) {
  return async (req: NextRequest, route: { params: Promise<P> }): Promise<Response> => {
    const started = Date.now();
    const db = createAdminClient();
    const ip = clientIp(req);
    let verified: Verified | null = null;
    let status = 500;
    let logError: string | null = null;

    after(async () => {
      await db.from("api_request_logs").insert({
        user_id: verified?.userId ?? null,
        token_id: verified?.tokenId ?? null,
        method: req.method,
        path: req.nextUrl.pathname,
        status,
        duration_ms: Date.now() - started,
        ip,
        user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        error: logError?.slice(0, 500) ?? null,
      });
      if (verified) {
        const minuteAgo = new Date(Date.now() - 60_000).toISOString();
        await db
          .from("coach_api_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", verified.tokenId)
          .or(`last_used_at.is.null,last_used_at.lt.${minuteAgo}`);
      }
    });

    const finish = (res: Response) => {
      status = res.status;
      return res;
    };

    try {
      if (ip && (await countSince(db, "ip", ip, 10 * 60_000, true)) >= FAILED_AUTH_LIMIT) {
        logError = "too many failed auth attempts";
        return finish(errorResponse(429, "rate_limited", "Too many failed authentication attempts. Try again later.", undefined, { "Retry-After": "600" }));
      }
      const token = bearerToken(req);
      verified = token ? await verifyToken(db, token) : null;
      if (!verified) {
        logError = token ? "invalid token" : "missing token";
        return finish(errorResponse(401, "unauthorized", "Send a valid coach API token as 'Authorization: Bearer hxc_…'.", undefined, { "WWW-Authenticate": "Bearer" }));
      }
      if (!verified.scopes.includes(scope)) {
        logError = `missing scope ${scope}`;
        return finish(errorResponse(403, "forbidden", `This token lacks the '${scope}' scope.`));
      }
      if ((await countSince(db, "token_id", verified.tokenId, 60_000)) >= RATE_LIMIT) {
        logError = "rate limited";
        return finish(errorResponse(429, "rate_limited", `Rate limit is ${RATE_LIMIT} requests per minute per token.`, undefined, { "Retry-After": "60" }));
      }

      let body: unknown = undefined;
      if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        const length = Number(req.headers.get("content-length") ?? 0);
        if (length > MAX_BODY_BYTES) return finish(errorResponse(413, "payload_too_large", "Request body is limited to 256 KB."));
        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) return finish(errorResponse(413, "payload_too_large", "Request body is limited to 256 KB."));
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          return finish(errorResponse(400, "invalid_json", "Request body must be valid JSON."));
        }
      }

      const profile = await getProfile(db, verified.userId);
      const result = await handler(
        { db, userId: verified.userId, tokenId: verified.tokenId, scopes: verified.scopes, profile, today: profileToday(profile), req, body },
        await route.params,
      );
      return finish(result instanceof Response ? result : Response.json(result));
    } catch (err) {
      if (err instanceof ApiError) {
        logError = err.message;
        return finish(errorResponse(err.status, err.code, err.message, err.details));
      }
      if (err instanceof ZodError) {
        logError = "validation failed";
        return finish(
          errorResponse(
            400,
            "validation_error",
            "Request validation failed.",
            err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          ),
        );
      }
      if (err instanceof DataError && err.status < 500) {
        logError = err.message;
        const code = err.status === 404 ? "not_found" : err.status === 409 ? "conflict" : "invalid_request";
        return finish(errorResponse(err.status, code, err.message));
      }
      console.error("[coach api]", req.method, req.nextUrl.pathname, err);
      logError = err instanceof Error ? err.message : "internal error";
      return finish(errorResponse(500, "internal_error", "Something went wrong on the server."));
    }
  };
}

export function notFound(what: string): never {
  throw new ApiError(404, "not_found", `${what} not found.`);
}
