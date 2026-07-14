import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  alignCourseVersionToCompetency,
  competencyFrameworkApiError,
} from "@/lib/competency-frameworks";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";

const privateHeaders = { "Cache-Control": "private, no-store" };

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
  let body: Parameters<typeof alignCourseVersionToCompetency>[2];
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: privateHeaders }); }
  try {
    const alignment = await alignCourseVersionToCompetency(user.id, (await params).id, body);
    return NextResponse.json({ alignment }, { status: 201, headers: privateHeaders });
  } catch (error) {
    const framework = competencyFrameworkApiError(error);
    const response = framework
      ? NextResponse.json({ error: framework.error }, { status: framework.status })
      : spaceApiError(error);
    if (response) {
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    throw error;
  }
}
