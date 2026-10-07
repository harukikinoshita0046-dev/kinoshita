import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "@playwright/test";
import { addDays } from "@/lib/domain/dates";
import { adminClient, demoUserId, DEMO } from "./helpers";

/**
 * The ChatGPT plugin connection end to end, as ChatGPT does it:
 * discovery -> dynamic client registration -> sign in + allow -> PKCE token
 * exchange -> MCP initialize / tools/list / tools/call with the official SDK.
 */
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

test("connect as a ChatGPT plugin over OAuth and use the coach tools via MCP", async ({ page, baseURL, request }) => {
  const userId = await demoUserId();
  const origin = baseURL!.replace(/\/$/, "");

  // 1. Unauthenticated MCP call points to the protected-resource metadata.
  const anon = await request.post(`${origin}/api/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } });
  expect(anon.status()).toBe(401);
  const challenge = anon.headers()["www-authenticate"];
  expect(challenge).toContain(`resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`);

  // 2. Discovery documents.
  const prm = await (await request.get(`${origin}/.well-known/oauth-protected-resource/api/mcp`)).json();
  expect(prm).toMatchObject({ resource: `${origin}/api/mcp`, authorization_servers: [origin] });
  const asm = await (await request.get(`${origin}/.well-known/oauth-authorization-server`)).json();
  expect(asm).toMatchObject({ issuer: origin, code_challenge_methods_supported: ["S256"] });

  // 3. Dynamic client registration (non-ChatGPT redirect URIs are refused).
  expect((await request.post(asm.registration_endpoint, { data: { redirect_uris: ["https://evil.example/cb"] } })).status()).toBe(400);
  const reg = await request.post(asm.registration_endpoint, { data: { redirect_uris: [REDIRECT], client_name: "ChatGPT", token_endpoint_auth_method: "none" } });
  expect(reg.status()).toBe(201);
  const { client_id } = await reg.json();

  // 4. Authorize: signed out -> login -> back to the consent page -> allow.
  const verifier = randomBytes(32).toString("base64url");
  const authorizeUrl = new URL(asm.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id,
    redirect_uri: REDIRECT,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "xyz-state",
    scope: "read write",
    resource: `${origin}/api/mcp`,
  })) authorizeUrl.searchParams.set(k, v);

  let callback: URL | null = null;
  await page.route("https://chatgpt.com/**", async (route) => {
    callback = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
  await page.goto(authorizeUrl.toString());
  await page.waitForURL("**/login**");
  await page.getByLabel("メールアドレス").fill(DEMO.email);
  await page.getByLabel(/パスワード/).fill(DEMO.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: /ChatGPT と連携しますか/ })).toBeVisible();
  await page.getByTestId("oauth-approve").click();
  await expect.poll(() => callback?.toString() ?? null).not.toBeNull();
  const cb = callback as unknown as URL;
  expect(cb.searchParams.get("state")).toBe("xyz-state");
  const code = cb.searchParams.get("code")!;

  // 5. Token exchange: wrong verifier fails, the right one returns a coach token.
  const bad = await request.post(asm.token_endpoint, {
    form: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id, code_verifier: randomBytes(32).toString("base64url") },
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe("invalid_grant");
  const tok = await request.post(asm.token_endpoint, { form: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id, code_verifier: verifier } });
  expect(tok.status()).toBe(200);
  const { access_token, token_type, scope } = await tok.json();
  expect(token_type).toBe("Bearer");
  expect(scope).toBe("read write");
  expect(access_token).toMatch(/^hxc_/);

  // 6. MCP with the official client.
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${access_token}` } } }));
  expect(client.getInstructions()).toContain("HYROX AI Coach");
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["getCoachContext", "createWorkoutPlan", "logPastWorkout"]));

  const ctx = await client.callTool({ name: "getCoachContext", arguments: {} });
  expect(ctx.isError).toBeFalsy();
  const meta = (ctx.structuredContent as { meta: { date: string } }).meta;
  expect(meta.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const day = addDays(meta.date, -12);
  const logged = await client.callTool({
    name: "logPastWorkout",
    arguments: { date: day, title: "Plugin Past", workout_type: "upper", exercises: [{ exercise_id: "bench_press", sets: 2, reps: 9, weight: 77.5 }] },
  });
  expect(logged.isError).toBeFalsy();
  expect((logged.structuredContent as { session: { date: string; total_sets: number } }).session).toMatchObject({ date: day, total_sets: 2 });

  const missing = await client.callTool({ name: "getWorkoutPlan", arguments: {} });
  expect(missing.isError).toBe(true);
  await client.close();

  // The token is an ordinary, revocable coach token named after the plugin.
  const tokens = (await adminClient().from("coach_api_tokens").select("name, scopes, revoked_at").eq("user_id", userId).eq("name", "ChatGPT プラグイン")).data!;
  expect(tokens.length).toBeGreaterThan(0);
  const saved = (await adminClient().from("workout_sessions").select("date").eq("user_id", userId).eq("title", "Plugin Past")).data!;
  expect(saved).toEqual([{ date: day }]);

  // Revoking it in the app ends the connection.
  await adminClient().from("coach_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).eq("name", "ChatGPT プラグイン");
  const revoked = await request.post(`${origin}/api/mcp`, {
    headers: { Authorization: `Bearer ${access_token}` },
    data: { jsonrpc: "2.0", id: 9, method: "tools/list" },
  });
  expect(revoked.status()).toBe(401);
  expect(revoked.headers()["www-authenticate"]).toContain('error="invalid_token"');
});
