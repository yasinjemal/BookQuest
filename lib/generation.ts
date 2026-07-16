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
  // Vercel's generated deployment URL can be protected even when the public
  // production domain is reachable. On production, use the system-controlled
  // project URL so internal handoffs do not stop at Deployment Protection.
  const targetEnvironment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV;
  if (targetEnvironment === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  // Preview workers stay on their exact deployment. Protected previews are
  // authenticated by internalGenerationHeaders below.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") {
    return req.nextUrl.origin.replace(/\/$/, "");
  }
  throw new Error("A trusted generation worker origin is not configured");
}

/** Headers shared by course and summary self-invocations. Vercel exposes the
 * automation secret when Protection Bypass is configured for the project. */
export function internalGenerationHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-generation-secret": process.env.GENERATION_SECRET ?? "",
  };
  const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (protectionBypass) {
    headers["x-vercel-protection-bypass"] = protectionBypass;
  }
  return headers;
}

/** Guard for the internal endpoint. Open in dev when no secret is configured. */
export function verifyGenerationSecret(req: NextRequest): boolean {
  const secret = process.env.GENERATION_SECRET;
  // Local development can run without configuration. Production must fail
  // closed: a missing secret must never turn an expensive internal worker into
  // a public endpoint.
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("x-generation-secret") === secret;
}

/** Fire a fresh generation invocation for a course (fire-and-forget trigger). */
export async function kickGeneration(
  courseId: number,
  generationRunId: string,
  baseUrl: string
): Promise<void> {
  let responseStatus: number | null = null;
  try {
    const response = await fetch(`${baseUrl}${INTERNAL_GENERATE_PATH}`, {
      method: "POST",
      headers: internalGenerationHeaders(),
      body: JSON.stringify({ courseId, generationRunId }),
      cache: "no-store",
    });
    responseStatus = response.status;
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
      metadata: { http_status: responseStatus },
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
