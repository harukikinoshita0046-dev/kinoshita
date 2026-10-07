import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientSecretFor, isAllowedRedirectUri, issueClientId, type ClientAuthMethod } from "@/lib/oauth/config";

const registration = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().max(200).optional(),
  token_endpoint_auth_method: z.string().max(60).optional(),
});

const AUTH_METHODS: ClientAuthMethod[] = ["none", "client_secret_post", "client_secret_basic"];

/** RFC 7591 dynamic client registration. Only ChatGPT / OpenAI redirect URIs are accepted. */
export async function POST(req: NextRequest) {
  const parsed = registration.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return oauthError("invalid_client_metadata", "redirect_uris is required");
  const bad = parsed.data.redirect_uris.find((u) => !isAllowedRedirectUri(u));
  if (bad) return oauthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad}`);

  const requested = parsed.data.token_endpoint_auth_method as ClientAuthMethod | undefined;
  const auth: ClientAuthMethod = requested && AUTH_METHODS.includes(requested) ? requested : "none";
  const iat = Math.floor(Date.now() / 1000);
  const clientId = issueClientId({ redirect_uris: parsed.data.redirect_uris, name: parsed.data.client_name ?? null, auth, iat });

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: iat,
      ...(auth === "none" ? {} : { client_secret: clientSecretFor(clientId), client_secret_expires_at: 0 }),
      client_name: parsed.data.client_name,
      redirect_uris: parsed.data.redirect_uris,
      token_endpoint_auth_method: auth,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: "read write",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function oauthError(error: string, description: string) {
  return Response.json({ error, error_description: description }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
