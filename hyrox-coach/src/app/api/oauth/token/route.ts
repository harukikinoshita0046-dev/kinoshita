import type { NextRequest } from "next/server";
import { generateCoachToken } from "@/lib/coach/token-crypto";
import { must } from "@/lib/data/util";
import { clientSecretFor, PLUGIN_TOKEN_NAME, readAuthorizationCode, readClient } from "@/lib/oauth/config";
import { pkceMatches, sha256Hex } from "@/lib/oauth/signing";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function oauthError(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status, headers: NO_STORE });
}

async function readParams(req: NextRequest): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(json).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

/**
 * Authorization code (+ PKCE) -> access token. The access token is an ordinary
 * coach API token, listed and revocable under Profile → AI Coach API.
 */
export async function POST(req: NextRequest) {
  const p = await readParams(req);

  // Client authentication: HTTP Basic or client_id / client_secret in the body.
  let clientId = p.client_id;
  let clientSecret = p.client_secret;
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (basic) {
    const [id, secret] = Buffer.from(basic[1], "base64").toString("utf8").split(":");
    clientId = decodeURIComponent(id ?? "");
    clientSecret = decodeURIComponent(secret ?? "");
  }
  const client = readClient(clientId);
  if (!client || !clientId) return oauthError("invalid_client", "Unknown client_id", 401);
  if (client.auth !== "none" && clientSecret !== clientSecretFor(clientId)) return oauthError("invalid_client", "Client authentication failed", 401);

  if (p.grant_type !== "authorization_code") return oauthError("unsupported_grant_type", "Only authorization_code is supported");
  const code = readAuthorizationCode(p.code);
  if (!code) return oauthError("invalid_grant", "The code is invalid or expired");
  if (code.clientIdHash !== sha256Hex(clientId)) return oauthError("invalid_grant", "The code was issued to another client");
  if (p.redirect_uri && p.redirect_uri !== code.redirectUri) return oauthError("invalid_grant", "redirect_uri does not match");
  if (!p.code_verifier || !pkceMatches(p.code_verifier, code.codeChallenge)) return oauthError("invalid_grant", "PKCE verification failed");

  const { token, hash, displayPrefix } = generateCoachToken();
  must(
    await createAdminClient().from("coach_api_tokens").insert({
      user_id: code.userId,
      name: PLUGIN_TOKEN_NAME,
      token_hash: hash,
      token_prefix: displayPrefix,
      scopes: code.scopes,
      expires_at: null,
    }),
    "create plugin token",
  );
  return Response.json({ access_token: token, token_type: "Bearer", scope: code.scopes.join(" ") }, { headers: NO_STORE });
}
