import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  competencyFrameworkApiError,
  listSpaceCompetencyFrameworks,
  publishCompetencyFrameworkVersion,
} from "@/lib/competency-frameworks";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";

const privateHeaders = { "Cache-Control": "private, no-store" };

function apiError(error: unknown) {
  const framework = competencyFrameworkApiError(error);
  if (framework) return NextResponse.json({ error: framework.error }, {
    status: framework.status,
    headers: privateHeaders,
  });
  return spaceApiError(error);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  try {
    return NextResponse.json({
      frameworkItems: await listSpaceCompetencyFrameworks(user.id, (await params).id),
    }, { headers: privateHeaders });
  } catch (error) {
    const response = apiError(error);
    if (response) {
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    throw error;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  let body: Parameters<typeof publishCompetencyFrameworkVersion>[2];
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: privateHeaders }); }
  try {
    const framework = await publishCompetencyFrameworkVersion(user.id, (await params).id, body);
    return NextResponse.json({ framework }, { status: 201, headers: privateHeaders });
  } catch (error) {
    const response = apiError(error);
    if (response) {
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    throw error;
  }
}
