import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { handleMcpMessage, type McpServer } from "@/lib/mcp/protocol";
import { buildMcpTools } from "@/lib/mcp/tools";
import {
  clientSecretFor,
  isAllowedRedirectUri,
  issueAuthorizationCode,
  issueClientId,
  parseScopes,
  readAuthorizationCode,
  readClient,
  validateAuthorizeRequest,
} from "@/lib/oauth/config";
import { pkceMatches, signValue, verifySigned } from "@/lib/oauth/signing";

beforeAll(() => {
  process.env.SUPABASE_SECRET_KEY ??= "unit-test-secret";
});

const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const RESOURCE = "https://app.example/api/mcp";
const challengeOf = (v: string) => createHash("sha256").update(v).digest("base64url");

describe("MCP tools from the coach API", () => {
  const { tools, routes } = buildMcpTools();

  it("exposes every coach operation except ping", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("getCoachContext");
    expect(names).toContain("createWorkoutPlan");
    expect(names).toContain("logPastWorkout");
    expect(names).not.toContain("ping");
    expect(names.length).toBe(21);
  });

  it("flattens path, query and body fields into one object schema", () => {
    const past = tools.find((t) => t.name === "logPastWorkout")!;
    expect(past.inputSchema.required).toEqual(["date", "exercises"]);
    expect(Object.keys(past.inputSchema.properties)).toContain("exercises");
    const history = tools.find((t) => t.name === "getExerciseHistory")!;
    expect(history.inputSchema.required).toEqual(["id"]);
    expect(routes.get("getExerciseHistory")).toMatchObject({ method: "GET", path: "/api/coach/exercises/{id}/history", pathParams: ["id"], queryParams: ["sessions"] });
  });

  it("marks reads and deletes for the client's approval prompts", () => {
    const byName = new Map(tools.map((t) => [t.name, t.annotations]));
    expect(byName.get("getCoachContext")).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.get("createWorkoutPlan")).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.get("cancelWorkoutPlan")).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});

describe("MCP JSON-RPC handling", () => {
  const calls: string[] = [];
  const server: McpServer = {
    name: "t",
    version: "1",
    instructions: "be a coach",
    listTools: () => [{ name: "a" }],
    callTool: async (name) => {
      calls.push(name);
      return name === "a" ? { content: [{ type: "text", text: "{}" }] } : null;
    },
  };

  it("negotiates the protocol version", async () => {
    const r = (await handleMcpMessage(server, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })) as { result: Record<string, unknown> };
    expect(r.result.protocolVersion).toBe("2025-03-26");
    expect(r.result.instructions).toBe("be a coach");
    const r2 = (await handleMcpMessage(server, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })) as { result: Record<string, unknown> };
    expect(r2.result.protocolVersion).toBe("2025-06-18");
  });

  it("answers requests, ignores notifications, and reports unknown methods and tools", async () => {
    expect(await handleMcpMessage(server, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await handleMcpMessage(server, { jsonrpc: "2.0", id: 3, method: "tools/list" })).toEqual({ jsonrpc: "2.0", id: 3, result: { tools: [{ name: "a" }] } });
    expect(await handleMcpMessage(server, { jsonrpc: "2.0", id: 4, method: "nope" })).toMatchObject({ error: { code: -32601 } });
    expect(await handleMcpMessage(server, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "zzz" } })).toMatchObject({ error: { code: -32602 } });
    expect(await handleMcpMessage(server, { hello: 1 })).toMatchObject({ error: { code: -32600 } });
  });

  it("handles batches", async () => {
    const r = await handleMcpMessage(server, [
      { jsonrpc: "2.0", id: 6, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "a", arguments: {} } },
    ]);
    expect(r).toEqual([
      { jsonrpc: "2.0", id: 6, result: {} },
      { jsonrpc: "2.0", id: 7, result: { content: [{ type: "text", text: "{}" }] } },
    ]);
  });
});

describe("OAuth building blocks", () => {
  it("only lets ChatGPT / OpenAI callback URLs register", () => {
    expect(isAllowedRedirectUri(REDIRECT)).toBe(true);
    expect(isAllowedRedirectUri("https://chat.openai.com/aip/g-123/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://chatgpt.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://evil.example/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://chatgpt.com.evil.example/cb")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });

  it("signs values and rejects tampering and expiry", () => {
    const v = signValue("x", { a: 1 });
    expect(verifySigned("x", v)).toEqual({ a: 1 });
    expect(verifySigned("y", v)).toBeNull();
    expect(verifySigned("x", v.replace(/^./, (c) => (c === "e" ? "f" : "e")))).toBeNull();
    expect(verifySigned("x", signValue("x", { exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
  });

  it("round-trips clients and codes", () => {
    const id = issueClientId({ redirect_uris: [REDIRECT], name: "ChatGPT", auth: "none", iat: 1 });
    expect(readClient(id)?.redirect_uris).toEqual([REDIRECT]);
    expect(clientSecretFor(id)).toBe(clientSecretFor(id));
    const code = issueAuthorizationCode({ userId: "u1", clientId: id, redirectUri: REDIRECT, codeChallenge: "c", scopes: ["read"] });
    expect(readAuthorizationCode(code)).toMatchObject({ userId: "u1", redirectUri: REDIRECT, codeChallenge: "c", scopes: ["read"] });
    expect(readAuthorizationCode(id)).toBeNull();
  });

  it("checks PKCE S256", () => {
    const verifier = "a".repeat(43) + "bcdefg";
    expect(pkceMatches(verifier, challengeOf(verifier))).toBe(true);
    expect(pkceMatches(verifier, challengeOf("other-verifier-".repeat(4)))).toBe(false);
    expect(pkceMatches("short", challengeOf("short"))).toBe(false);
  });

  it("grants read and write unless the client asks for less", () => {
    expect(parseScopes(undefined)).toEqual(["read", "write"]);
    expect(parseScopes("read")).toEqual(["read"]);
    expect(parseScopes("openid profile")).toEqual(["read", "write"]);
  });

  it("validates authorize requests, redirecting only to a registered URI", () => {
    const id = issueClientId({ redirect_uris: [REDIRECT], name: null, auth: "none", iat: 1 });
    const ok = { client_id: id, redirect_uri: REDIRECT, response_type: "code", code_challenge: "c", code_challenge_method: "S256", state: "s1" };
    expect(validateAuthorizeRequest(ok, RESOURCE)).toMatchObject({ ok: true, request: { redirectUri: REDIRECT, state: "s1" } });
    expect(validateAuthorizeRequest({ ...ok, redirect_uri: undefined }, RESOURCE)).toMatchObject({ ok: true });
    expect(validateAuthorizeRequest({ ...ok, client_id: "forged" }, RESOURCE)).toMatchObject({ ok: false, fatal: expect.any(String) });
    expect(validateAuthorizeRequest({ ...ok, redirect_uri: "https://chatgpt.com/other" }, RESOURCE)).toMatchObject({ ok: false, fatal: expect.any(String) });
    const noPkce = validateAuthorizeRequest({ ...ok, code_challenge_method: "plain" }, RESOURCE);
    expect(noPkce).toMatchObject({ ok: false, redirect: expect.stringContaining("error=invalid_request") });
    expect(validateAuthorizeRequest({ ...ok, resource: "https://other.example/api/mcp" }, RESOURCE)).toMatchObject({ ok: false, redirect: expect.stringContaining("invalid_target") });
    expect(validateAuthorizeRequest({ ...ok, resource: `${RESOURCE}/` }, RESOURCE)).toMatchObject({ ok: true });
  });
});
