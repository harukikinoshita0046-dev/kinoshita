import { appUrl } from "@/lib/coach/dto";
import { buildOpenApi } from "@/lib/coach/openapi";

/** Public (no auth): the schema ChatGPT imports when you add this API as a GPT Action. */
export async function GET(req: Request) {
  return Response.json(buildOpenApi(appUrl(req)), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
