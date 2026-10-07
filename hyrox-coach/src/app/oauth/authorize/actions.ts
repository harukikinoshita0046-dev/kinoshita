"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { appOrigin, issueAuthorizationCode, MCP_PATH, validateAuthorizeRequest } from "@/lib/oauth/config";

async function resource() {
  const h = await headers();
  return `${appOrigin(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`)}${MCP_PATH}`;
}

function fields(form: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"]) {
    const v = form.get(key);
    out[key] = typeof v === "string" && v !== "" ? v : undefined;
  }
  return out;
}

/** The athlete allowed access: send ChatGPT back with a short-lived, PKCE-bound code. */
export async function approveAuthorization(form: FormData) {
  const { userId } = await requireUser();
  const result = validateAuthorizeRequest(fields(form), await resource());
  if (!result.ok) redirect("redirect" in result ? result.redirect : "/profile/coach");
  const { request } = result;
  const url = new URL(request.redirectUri);
  url.searchParams.set(
    "code",
    issueAuthorizationCode({ userId, clientId: request.clientId, redirectUri: request.redirectUri, codeChallenge: request.codeChallenge, scopes: request.scopes }),
  );
  if (request.state) url.searchParams.set("state", request.state);
  redirect(url.toString());
}

export async function denyAuthorization(form: FormData) {
  await requireUser();
  const result = validateAuthorizeRequest(fields(form), await resource());
  if (!result.ok) redirect("redirect" in result ? result.redirect : "/today");
  const url = new URL(result.request.redirectUri);
  url.searchParams.set("error", "access_denied");
  if (result.request.state) url.searchParams.set("state", result.request.state);
  redirect(url.toString());
}
