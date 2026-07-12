import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getCourse, getCourseSource, prepareCourseRetry } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveBaseUrl, runAndChain } from "@/lib/generation";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";
import { authorizeCourseAction } from "@/lib/spaces";
import { spaceApiError } from "@/lib/space-api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.courseRetryUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const { id } = await params;
  const course = await getCourse(Number(id));
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await authorizeCourseAction(user.id, course.id, "content.update");
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }

  // The stored chapters are what generation regenerates from (no original file).
  const sourceJson = await getCourseSource(course.id);
  if (!sourceJson) {
    return NextResponse.json(
      { error: "Original document is no longer available. Please upload it again." },
      { status: 410 }
    );
  }
  try {
    JSON.parse(sourceJson);
  } catch {
    return NextResponse.json(
      { error: "Stored document was corrupted. Please upload it again." },
      { status: 410 }
    );
  }

  // Retrying a failed generation is free — the credit was already spent.
  const generationRunId = await prepareCourseRetry(course.id);
  if (!generationRunId) {
    return NextResponse.json(
      { error: "This course is already being generated." },
      { status: 409 }
    );
  }

  const baseUrl = resolveBaseUrl(req);
  after(() => runAndChain(course.id, generationRunId, baseUrl));
  return NextResponse.json({ ok: true });
}
