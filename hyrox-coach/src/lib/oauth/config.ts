import "server-only";

import { sha256Hex, signValue, verifySigned } from "./signing";

/**
 * OAuth 2.1 for the ChatGPT plugin (MCP). ChatGPT registers itself (dynamic
 * client registration), sends the athlete to /oauth/authorize to sign in and
 * allow access, then swaps the code for a normal coach API token (hxc_…).
 */
export const OAUTH_SCOPES = ["read", "write"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const MCP_PATH = "/api/mcp";
export const PLUGIN_TOKEN_NAME = "ChatGPT プラグイン";
const CODE_TTL_SECONDS = 300;

/** Public origin of the app: NEXT_PUBLIC_APP_URL, else the request's own origin. */
export function appOrigin(fallback: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? fallback).replace(/\/$/, "");
}

/** Only ChatGPT / OpenAI callback URLs may receive codes, so nobody else can register a client for this app. */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
  const host = url.hostname.toLowerCase();
  return ["chatgpt.com", "openai.com"].some((d) => host === d || host.endsWith(`.${d}`)) || host === "chat.openai.com";
}

export type ClientAuthMethod = "none" | "client_secret_post" | "client_secret_basic";
export type OAuthClient = { redirect_uris: string[]; name: string | null; auth: ClientAuthMethod; iat: number };

export function issueClientId(client: OAuthClient): string {
  return signValue("client", client);
}

export function readClient(clientId: string | null | undefined): OAuthClient | null {
  const c = verifySigned<OAuthClient>("client", clientId);
  return c && Array.isArray(c.redirect_uris) && c.redirect_uris.every(isAllowedRedirectUri) ? c : null;
}

/** Confidential-client secret, derived from the client id (only issued when the client asks for one). */
export function clientSecretFor(clientId: string): string {
  return signValue("client_secret", { c: sha256Hex(clientId) }).split(".")[1];
}

export function parseScopes(scope: string | null | undefined): OAuthScope[] {
  if (!scope) return [...OAUTH_SCOPES];
  const asked = scope.split(/\s+/).filter(Boolean);
  const granted = OAUTH_SCOPES.filter((s) => asked.includes(s));
  return granted.length ? granted : [...OAUTH_SCOPES];
}

type CodePayload = { u: string; c: string; r: string; cc: string; s: OAuthScope[]; exp: number };

export function issueAuthorizationCode(input: { userId: string; clientId: string; redirectUri: string; codeChallenge: string; scopes: OAuthScope[] }): string {
  return signValue("code", {
    u: input.userId,
    c: sha256Hex(input.clientId),
    r: input.redirectUri,
    cc: input.codeChallenge,
    s: input.scopes,
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS,
  } satisfies CodePayload);
}

export function readAuthorizationCode(code: string | null | undefined) {
  const p = verifySigned<CodePayload>("code", code);
  return p ? { userId: p.u, clientIdHash: p.c, redirectUri: p.r, codeChallenge: p.cc, scopes: p.s } : null;
}

export type AuthorizeRequest = {
  clientId: string;
  client: OAuthClient;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scopes: OAuthScope[];
};

/**
 * Validates /oauth/authorize parameters. `fatal` errors must not redirect
 * (unknown client or redirect URI); `redirect` errors go back to the client.
 */
export function validateAuthorizeRequest(
  params: Record<string, string | undefined>,
  resource: string,
): { ok: true; request: AuthorizeRequest } | { ok: false; fatal: string } | { ok: false; redirect: string } {
  const client = readClient(params.client_id);
  if (!client || !params.client_id) return { ok: false, fatal: "接続元のアプリを確認できませんでした（client_id が無効です）。ChatGPT からもう一度接続してください。" };
  const redirectUri = params.redirect_uri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : undefined);
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) return { ok: false, fatal: "戻り先の URL が登録されたものと一致しません。" };

  const back = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (params.state) url.searchParams.set("state", params.state);
    return { ok: false as const, redirect: url.toString() };
  };
  if (params.response_type !== "code") return back("unsupported_response_type", "response_type must be code");
  if (!params.code_challenge || params.code_challenge_method !== "S256") return back("invalid_request", "PKCE with S256 is required");
  if (params.resource && params.resource.replace(/\/$/, "") !== resource) return back("invalid_target", `resource must be ${resource}`);
  return {
    ok: true,
    request: {
      clientId: params.client_id,
      client,
      redirectUri,
      codeChallenge: params.code_challenge,
      state: params.state ?? null,
      scopes: parseScopes(params.scope),
    },
  };
}
