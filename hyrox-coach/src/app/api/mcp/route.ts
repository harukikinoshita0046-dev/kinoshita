import { NextRequest } from "next/server";
import { authenticateCoachToken } from "@/lib/coach/api";
import { GPT_INSTRUCTIONS } from "@/lib/coach/gpt-instructions";
import { handleMcpMessage, type McpServer, type ToolResult } from "@/lib/mcp/protocol";
import { COACH_ROUTES } from "@/lib/mcp/routes";
import { buildMcpTools } from "@/lib/mcp/tools";
import { appOrigin, MCP_PATH } from "@/lib/oauth/config";

const MAX_BODY_BYTES = 1024 * 1024;
const { tools, routes } = buildMcpTools();

function bearer(req: NextRequest): string | null {
  return /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
}

function unauthorized(origin: string, invalid: boolean) {
  const params = [`resource_metadata="${origin}/.well-known/oauth-protected-resource${MCP_PATH}"`, 'scope="read write"'];
  if (invalid) params.unshift('error="invalid_token"');
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Authentication required. Connect the plugin to sign in." } },
    { status: 401, headers: { "WWW-Authenticate": `Bearer ${params.join(", ")}` } },
  );
}

/** Runs a tool by calling the matching coach API route handler with the caller's token. */
async function callTool(req: NextRequest, origin: string, token: string, name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  const route = routes.get(name);
  const handler = route ? COACH_ROUTES[route.path]?.[route.method] : undefined;
  if (!route || !handler) return null;

  const params: Record<string, string> = {};
  let path = route.path;
  for (const p of route.pathParams) {
    const value = args[p];
    if (value == null || value === "") return { content: [{ type: "text", text: `Missing required argument: ${p}` }], isError: true };
    params[p] = String(value);
    path = path.replace(`{${p}}`, encodeURIComponent(String(value)));
  }
  const url = new URL(path, origin);
  for (const q of route.queryParams) if (args[q] != null && args[q] !== "") url.searchParams.set(q, String(args[q]));
  const body = Object.fromEntries(Object.entries(args).filter(([k]) => !route.pathParams.includes(k) && !route.queryParams.includes(k)));
  const hasBody = route.method === "POST" || route.method === "PUT" || route.method === "PATCH";
  const forwardedFor = req.headers.get("x-forwarded-for");

  const res = await handler(
    new NextRequest(url, {
      method: route.method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve(params) },
  );
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const text = JSON.stringify(json ?? { status: res.status });
  if (!res.ok) return { content: [{ type: "text", text: `Error ${res.status}: ${text}` }], isError: true };
  return { content: [{ type: "text", text }], ...(json && !Array.isArray(json) ? { structuredContent: json } : {}) };
}

/**
 * MCP endpoint for the ChatGPT plugin (Streamable HTTP, stateless JSON).
 * Auth: OAuth 2.1 bearer token issued by /api/oauth/token (a coach API token).
 */
export async function POST(req: NextRequest) {
  const origin = appOrigin(req.nextUrl.origin);
  const token = bearer(req);
  const auth = await authenticateCoachToken(token);
  if (!auth || !token) return unauthorized(origin, Boolean(token));

  const length = Number(req.headers.get("content-length") ?? 0);
  const raw = length > MAX_BODY_BYTES ? null : await req.text();
  if (raw == null || raw.length > MAX_BODY_BYTES) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const server: McpServer = {
    name: "hyrox-coach",
    version: "1.0.0",
    instructions: GPT_INSTRUCTIONS,
    listTools: () => tools,
    callTool: (name, args) => callTool(req, origin, token, name, args),
  };
  const reply = await handleMcpMessage(server, payload);
  return reply ? Response.json(reply) : new Response(null, { status: 202 });
}

/** No server-initiated stream: this server answers every request directly. */
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
