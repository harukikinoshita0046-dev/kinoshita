import { describe, expect, it } from "vitest";
import { buildOpenApi } from "@/lib/coach/openapi";

/** Every `type: object` schema must declare `properties` — ChatGPT GPT Actions refuses the import otherwise. */
function objectsWithoutProperties(node: unknown, path: string[] = []): string[] {
  if (Array.isArray(node)) return node.flatMap((v, i) => objectsWithoutProperties(v, [...path, String(i)]));
  if (node == null || typeof node !== "object") return [];
  const rec = node as Record<string, unknown>;
  const own = rec.type === "object" && !("properties" in rec) ? [path.join(".")] : [];
  return [...own, ...Object.entries(rec).flatMap(([k, v]) => objectsWithoutProperties(v, [...path, k]))];
}

describe("OpenAPI document for GPT Actions", () => {
  const doc = buildOpenApi("https://example.vercel.app");

  it("declares properties on every object schema", () => {
    expect(objectsWithoutProperties(doc)).toEqual([]);
  });

  it("uses the deployed URL as the server", () => {
    expect(doc.servers).toEqual([{ url: "https://example.vercel.app" }]);
  });
});
