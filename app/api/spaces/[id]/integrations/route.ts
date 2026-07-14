import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  createApiClient, createWebhookEndpoint, listIntegrations,
  revokeApiClient, revokeWebhookEndpoint,
} from "@/lib/integrations";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) { unauth.headers.set("Cache-Control", "private, no-store"); return unauth; }
  try {
    return NextResponse.json(await listIntegrations(user.id, (await params).id), { headers });
  } catch (error) {
    const response = spaceApiError(error); if (response) { response.headers.set("Cache-Control", "private, no-store"); return response; }
    throw error;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) { unauth.headers.set("Cache-Control", "private, no-store"); return unauth; }
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) { const response = tooManyRequests(limit); response.headers.set("Cache-Control", "private, no-store"); return response; }
  const spaceId = (await params).id;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers }); }
  try {
    if (body.action === "create_client") {
      return NextResponse.json({ client: await createApiClient(user.id, spaceId, {
        name: String(body.name ?? ""), scopes: body.scopes,
      }) }, { status: 201, headers });
    }
    if (body.action === "revoke_client") {
      return NextResponse.json({ client: await revokeApiClient(user.id, spaceId, String(body.clientId ?? "")) }, { headers });
    }
    if (body.action === "create_webhook") {
      return NextResponse.json({ endpoint: await createWebhookEndpoint(user.id, spaceId, {
        url: String(body.url ?? ""), eventTypes: body.eventTypes,
      }) }, { status: 201, headers });
    }
    if (body.action === "revoke_webhook") {
      return NextResponse.json({ endpoint: await revokeWebhookEndpoint(user.id, spaceId, String(body.endpointId ?? "")) }, { headers });
    }
    return NextResponse.json({ error: "Unsupported integration action" }, { status: 400, headers });
  } catch (error) {
    const response = spaceApiError(error); if (response) { response.headers.set("Cache-Control", "private, no-store"); return response; }
    throw error;
  }
}
