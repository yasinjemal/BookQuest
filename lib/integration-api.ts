import { NextResponse } from "next/server";
import { IntegrationAuthError } from "./integrations";

export const integrationPrivateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export function integrationApiError(error: unknown) {
  if (!(error instanceof IntegrationAuthError)) return undefined;
  const response = NextResponse.json(
    { error: error.status === 401 ? "invalid_token" : "insufficient_scope" },
    { status: error.status, headers: integrationPrivateHeaders },
  );
  response.headers.set(
    "WWW-Authenticate",
    error.status === 401 ? 'Bearer realm="BookQuest API"' : 'Bearer error="insufficient_scope"',
  );
  return response;
}
