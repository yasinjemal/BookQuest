import type { NextRequest } from "next/server";
import { withCourseGenerationLock } from "./pg";
import { runGenerationUntilBudget } from "./generator";
import { StaleGenerationRunError } from "./db";
import {
  operationalSubject,
  recordOperationalError,
} from "./observability";

/**
 * Durable course generation driver.
 *
 * A serverless function is capped (maxDuration = 300s), but generating a whole
 * book can take longer. So generation runs as a chain of invocations: each one
 * does as much as fits in a time budget, then triggers a *fresh* invocation
 * (with a fresh clock) to continue. A per-course advisory lock guarantees only
 * one chain works on a course at a time; if a worker dies, the lock releases and
 * a stalled course is resumed by the next trigger.
 */

// Leave ~60s of headroom under the 300s function limit so an in-flight Claude
// call can finish and the chain can be scheduled before the worker is killed.
export const GENERATION_STEP_BUDGET_MS = 240_000;

// A course whose heartbeat is older than this is treated as stalled and resumed.
export const GENERATION_STALE_MS = 180_000;

const INTERNAL_GENERATE_PATH = "/api/internal/generate";

/** Absolute base URL for internal self-calls, working in dev and on Vercel. */
export function resolveBaseUrl(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return req.nextUrl.origin;
}

/** Guard for the internal endpoint. Open in dev when no secret is configured. */
export function verifyGenerationSecret(req: NextRequest): boolean {
  const secret = process.env.GENERATION_SECRET;
  if (!secret) return true;
  return req.headers.get("x-generation-secret") === secret;
}

/** Fire a fresh generation invocation for a course (fire-and-forget trigger). */
export async function kickGeneration(
  courseId: number,
  generationRunId: string,
  baseUrl: string
): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}${INTERNAL_GENERATE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-generation-secret": process.env.GENERATION_SECRET ?? "",
      },
      body: JSON.stringify({ courseId, generationRunId }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Generation trigger returned ${response.status}`);
    }
  } catch (err) {
    console.error(`Failed to kick generation for course ${courseId}:`, err);
    await recordOperationalError({
      eventType: "generation.trigger_failed",
      area: "course.generation",
      error: err,
      subjectKey: operationalSubject("course", courseId),
    });
  }
}

/**
 * Do one invocation's worth of generation for a course, then chain a fresh
 * invocation if work remains. Acquires the per-course lock first; if another
 * chain already holds it, this returns immediately (that chain will continue).
 */
export async function runAndChain(
  courseId: number,
  generationRunId: string,
  baseUrl: string
): Promise<void> {
  const finished = await withCourseGenerationLock(courseId, async () => {
    try {
      return await runGenerationUntilBudget(
        courseId,
        generationRunId,
        Date.now() + GENERATION_STEP_BUDGET_MS
      );
    } catch (err) {
      if (err instanceof StaleGenerationRunError) return true;
      console.error(`Generation chain error for course ${courseId}:`, err);
      await recordOperationalError({
        eventType: "generation.chain_failed",
        area: "course.generation",
        error: err,
        subjectKey: operationalSubject("course", courseId),
      });
      return false;
    }
  });
  // undefined → another chain holds the lock (it will continue on its own).
  // false    → budget spent but work remains → continue in a fresh invocation.
  if (finished === false) await kickGeneration(courseId, generationRunId, baseUrl);
}
