import type { NextRequest } from "next/server";
import { appOrigin } from "@/lib/oauth/config";
import { authorizationServerMetadata, METADATA_HEADERS } from "@/lib/oauth/metadata";

export function GET(req: NextRequest) {
  return Response.json(authorizationServerMetadata(appOrigin(req.nextUrl.origin)), { headers: METADATA_HEADERS });
}
