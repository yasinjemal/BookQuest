import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  claimStalledCourse,
  getCourse,
  getCourseSource,
  prepareCourseRetry,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  GENERATION_STALE_MS,
  resolveBaseUrl,
  runAndChain,
} from "@/lib/generation";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";
import { authorizeCourseAction } from "@/lib/spaces";
import { spaceApiError } from "@/lib/space-api";
import { aiUnavailablePayload, getAiAvailability } from "@/lib/ai-provider";
import {
  AiBudgetConfigurationError,
  AiBudgetExceededError,
  aiBudgetErrorPayload,
  aiBudgetRetryAfterSeconds,
  assertAiBudgetAvailable,
} from "@/lib/ai-budget";

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

  const ai = getAiAvailability();
  if (!ai.enabled) {
    return NextResponse.json(aiUnavailablePayload(ai), { status: 503 });
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

  try {
    await assertAiBudgetAvailable(ai.model!);
  } catch (error) {
    if (error instanceof AiBudgetExceededError) {
      return NextResponse.json(aiBudgetErrorPayload(error), {
        status: 429,
        headers: { "Retry-After": String(aiBudgetRetryAfterSeconds(error)) },
      });
    }
    if (error instanceof AiBudgetConfigurationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 503 }
      );
    }
    throw error;
  }

  // A retry does not consume another product credit, but every provider call
  // still passes through the installation's daily AI safety budget.
  let generationRunId: string | undefined;
  if (course.status === "error") {
    generationRunId = await prepareCourseRetry(course.id);
  } else if (["extracting", "outlining", "generating"].includes(course.status)) {
    const claimedAt = new Date();
    const stalled = await claimStalledCourse(
      course.id,
      new Date(claimedAt.getTime() - GENERATION_STALE_MS).toISOString(),
      claimedAt.toISOString()
    );
    generationRunId = stalled?.generation_run_id;
    if (!generationRunId) {
      return NextResponse.json(
        {
          error: "Generation is still active. Wait for the current unit to finish before resuming.",
          code: "generation_active",
        },
        { status: 409 }
      );
    }
  }
  if (!generationRunId) {
    return NextResponse.json(
      { error: "This course is already being generated." },
      { status: 409 }
    );
  }

  const baseUrl = resolveBaseUrl(req);
  after(() => runAndChain(course.id, generationRunId, baseUrl));
  return NextResponse.json(
    { ok: true, resumed: course.status !== "error" },
    { status: 202 }
  );
}
