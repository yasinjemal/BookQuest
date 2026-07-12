import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { resolveBaseUrl, runAndChain, verifyGenerationSecret } from "@/lib/generation";

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
  try {
    const body = (await req.json()) as { courseId?: number };
    courseId = Number(body.courseId);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid courseId" }, { status: 400 });
  }

  const baseUrl = resolveBaseUrl(req);
  after(() => runAndChain(courseId, baseUrl));
  return NextResponse.json({ ok: true }, { status: 202 });
}
