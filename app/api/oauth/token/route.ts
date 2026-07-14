import { NextRequest, NextResponse } from "next/server";
import { issueClientCredentialsToken, IntegrationAuthError } from "@/lib/integrations";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };

function oauthError(error: string, status: number, description?: string) {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { ...headers, ...(status === 401 ? { "WWW-Authenticate": 'Basic realm="BookQuest OAuth"' } : {}) } },
  );
}

function basicCredentials(value: string | null) {
  if (!value?.startsWith("Basic ") || value.length > 300) return null;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) return null;
    return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return oauthError("invalid_request", 400, "Use application/x-www-form-urlencoded");
  }
  const ipLimit = await consumeRateLimit(RATE_LIMITS.oauthTokenIp, rateLimitSubject("ip", requestIp(req)));
  if (!ipLimit.allowed) {
    const response = tooManyRequests(ipLimit); Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  let form: URLSearchParams;
  try { form = new URLSearchParams(await req.text()); }
  catch { return oauthError("invalid_request", 400); }
  if (form.get("grant_type") !== "client_credentials") return oauthError("unsupported_grant_type", 400);
  const credentials = basicCredentials(req.headers.get("authorization"));
  if (!credentials) return oauthError("invalid_client", 401);
  const clientLimit = await consumeRateLimit(
    RATE_LIMITS.oauthTokenClient, rateLimitSubject("oauth-client", credentials.clientId),
  );
  if (!clientLimit.allowed) {
    const response = tooManyRequests(clientLimit); Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  const scopeValue = form.get("scope")?.trim();
  try {
    const token = await issueClientCredentialsToken({
      ...credentials,
      ...(scopeValue ? { requestedScopes: scopeValue.split(/\s+/) } : {}),
    });
    return NextResponse.json({
      access_token: token.accessToken,
      token_type: token.tokenType,
      expires_in: token.expiresIn,
      scope: token.scopes.join(" "),
    }, { headers });
  } catch (error) {
    if (error instanceof IntegrationAuthError) {
      return oauthError(error.status === 401 ? "invalid_client" : "invalid_scope", error.status);
    }
    throw error;
  }
}
