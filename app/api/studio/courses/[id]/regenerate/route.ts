import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";
import { regenerateStudioScope } from "@/lib/studio-generator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.courseRetryUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const courseId = Number((await params).id);
  const body = (await req.json()) as {
    scopeType?: "block" | "lesson" | "module";
    scopeKey?: string;
    instruction?: string;
  };
  if (!Number.isInteger(courseId) || !body.scopeType || !body.scopeKey) {
    return NextResponse.json({ error: "A valid regeneration scope is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await regenerateStudioScope(
      user.id,
      courseId,
      { type: body.scopeType, key: body.scopeKey },
      body.instruction
    ));
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    const message = error instanceof Error && /api.?key|authentication/i.test(error.message)
      ? "AI regeneration is unavailable until the provider key is configured. Manual editing still works."
      : "Could not regenerate this scope";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
