import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, API_VERSION, listApiAssignments } from "@/lib/integrations";
import { integrationApiError, integrationPrivateHeaders } from "@/lib/integration-api";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const spaceId = (await params).id;
  try {
    const auth = await authenticateApiRequest(req.headers.get("authorization"), spaceId, "assignments.read");
    const limit = await consumeRateLimit(RATE_LIMITS.versionedApiClient, rateLimitSubject("api-client", auth.clientId));
    if (!limit.allowed) { const response = tooManyRequests(limit); Object.entries(integrationPrivateHeaders).forEach(([key, value]) => response.headers.set(key, value)); return response; }
    return NextResponse.json({ apiVersion: API_VERSION, data: await listApiAssignments(spaceId) }, { headers: integrationPrivateHeaders });
  } catch (error) {
    const response = integrationApiError(error); if (response) return response;
    throw error;
  }
}
