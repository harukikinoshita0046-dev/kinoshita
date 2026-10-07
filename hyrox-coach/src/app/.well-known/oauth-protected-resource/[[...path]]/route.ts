import type { NextRequest } from "next/server";
import { appOrigin } from "@/lib/oauth/config";
import { METADATA_HEADERS, protectedResourceMetadata } from "@/lib/oauth/metadata";

/** Served at /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/api/mcp. */
export function GET(req: NextRequest) {
  return Response.json(protectedResourceMetadata(appOrigin(req.nextUrl.origin)), { headers: METADATA_HEADERS });
}
