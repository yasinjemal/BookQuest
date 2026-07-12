import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { resolveBaseUrl, runAndChain, verifyGenerationSecret } from "@/lib/generation";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";
import { getGenerationCourse } from "@/lib/db";
import { isGenerationRunId } from "@/lib/generation-run";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Internal generation worker. Not called by the browser — the upload/retry
 * routes and each preceding generation invocation POST here to advance a
 * course. It returns immediately and does the work in `after()`, so the caller
 * just triggers a fresh invocation with its own time budget.
 */
export async function POST(req: NextRequest) {
  if (!verifyGenerationSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let courseId: number;
  let generationRunId: string;
  try {
    const body = (await req.json()) as {
      courseId?: number;
      generationRunId?: string;
    };
    courseId = Number(body.courseId);
    generationRunId = body.generationRunId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid courseId" }, { status: 400 });
  }
  if (!isGenerationRunId(generationRunId)) {
    return NextResponse.json({ error: "Invalid generationRunId" }, { status: 400 });
  }
  const course = await getGenerationCourse(courseId);
  if (!course || course.generation_run_id !== generationRunId) {
    return NextResponse.json({ error: "Stale generation run" }, { status: 409 });
  }
  const limit = await consumeRateLimit(
    RATE_LIMITS.internalGenerationCourse,
    rateLimitSubject("course", courseId)
  );
  if (!limit.allowed) return tooManyRequests(limit);

  const baseUrl = resolveBaseUrl(req);
  after(() => runAndChain(courseId, generationRunId, baseUrl));
  return NextResponse.json({ ok: true }, { status: 202 });
}
