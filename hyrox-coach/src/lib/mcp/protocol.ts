/**
 * Minimal MCP server over Streamable HTTP, stateless: every POST carries one
 * JSON-RPC message (or a batch) and gets a plain JSON response. Only the
 * tools capability is offered.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: Record<string, unknown> };
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

export type ToolResult = { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

export type McpServer = {
  name: string;
  version: string;
  instructions: string;
  listTools: () => unknown[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult | null>;
};

const error = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleOne(server: McpServer, msg: unknown): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== "object" || (msg as JsonRpcRequest).jsonrpc !== "2.0" || typeof (msg as JsonRpcRequest).method !== "string") {
    return error(null, -32600, "Invalid Request");
  }
  const { id, method, params } = msg as JsonRpcRequest;
  // Notifications (no id) and responses get no reply.
  if (id === undefined) return null;

  switch (method) {
    case "initialize": {
      const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: server.name, version: server.version },
          instructions: server.instructions,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: server.listTools() } };
    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const args = params?.arguments && typeof params.arguments === "object" ? (params.arguments as Record<string, unknown>) : {};
      const result = await server.callTool(name, args);
      return result ? { jsonrpc: "2.0", id, result } : error(id, -32602, `Unknown tool: ${name}`);
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}

/** Returns the JSON body to send, or null for "202 Accepted, no body" (notifications only). */
export async function handleMcpMessage(server: McpServer, payload: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) return error(null, -32600, "Invalid Request");
    const replies = (await Promise.all(payload.map((m) => handleOne(server, m)))).filter((r): r is JsonRpcResponse => r !== null);
    return replies.length ? replies : null;
  }
  return handleOne(server, payload);
}
