import { buildOpenApi } from "@/lib/coach/openapi";

type JsonSchema = Record<string, unknown>;
type OpenApiParameter = { name: string; in: "path" | "query"; required?: boolean; description?: string; schema?: JsonSchema };
type OpenApiOperation = {
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: { content?: { "application/json"?: { schema?: JsonSchema } } };
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean };
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
};

export type ToolRoute = { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string; pathParams: string[]; queryParams: string[] };

/** Operations not worth exposing as tools. */
const SKIP = new Set(["ping"]);

/**
 * MCP tools generated from the coach API's OpenAPI document, so ChatGPT's
 * plugin and the GPT Action see exactly the same operations. Path, query and
 * body fields are flattened into one argument object.
 */
export function buildMcpTools(): { tools: McpTool[]; routes: Map<string, ToolRoute> } {
  const doc = buildOpenApi("https://hyrox-coach.local") as unknown as { paths: Record<string, Record<string, OpenApiOperation>> };
  const tools: McpTool[] = [];
  const routes = new Map<string, ToolRoute>();
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      if (SKIP.has(op.operationId)) continue;
      const params = op.parameters ?? [];
      const body = op.requestBody?.content?.["application/json"]?.schema as { properties?: Record<string, JsonSchema>; required?: string[] } | undefined;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const p of params) {
        properties[p.name] = { ...(p.schema ?? { type: "string" }), ...(p.description ? { description: p.description } : {}) };
        if (p.required || p.in === "path") required.push(p.name);
      }
      for (const [k, v] of Object.entries(body?.properties ?? {})) properties[k] = v;
      required.push(...(body?.required ?? []));

      const verb = method.toUpperCase() as ToolRoute["method"];
      const title = op.summary ?? op.operationId;
      tools.push({
        name: op.operationId,
        title,
        description: [op.summary, op.description].filter(Boolean).join("\n\n"),
        inputSchema: { type: "object", properties, ...(required.length ? { required: [...new Set(required)] } : {}) },
        annotations: {
          title,
          readOnlyHint: verb === "GET",
          destructiveHint: verb === "DELETE",
          idempotentHint: verb === "GET" || verb === "PUT" || verb === "DELETE",
          openWorldHint: false,
        },
      });
      routes.set(op.operationId, {
        method: verb,
        path,
        pathParams: params.filter((p) => p.in === "path").map((p) => p.name),
        queryParams: params.filter((p) => p.in === "query").map((p) => p.name),
      });
    }
  }
  return { tools, routes };
}
