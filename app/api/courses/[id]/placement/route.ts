import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { canAccessCourse } from "@/lib/db";
import {
  getPlacementRecommendation,
  LearningGenomeError,
  savePlacementPreference,
} from "@/lib/learning-genome";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

async function context(req: NextRequest, params: Promise<{ id: string }>) {
  const [user, unauth] = await requireUser(req);
  if (!user) return { response: unauth } as const;
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId) || !(await canAccessCourse(user.id, courseId))) {
    return {
      response: NextResponse.json({ error: "Course not found" }, { status: 404, headers: noStore }),
    } as const;
  }
  return { user, courseId } as const;
}

function apiError(error: unknown) {
  if (error instanceof LearningGenomeError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
  }
  throw error;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await context(req, params);
  if ("response" in resolved) return resolved.response;
  try {
    return NextResponse.json(
      await getPlacementRecommendation(resolved.user.id, resolved.courseId),
      { headers: noStore }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await context(req, params);
  if ("response" in resolved) return resolved.response;
  const limit = await consumeRateLimit(
    RATE_LIMITS.answerUser,
    rateLimitSubject("user", resolved.user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let body: { selectedLessonId?: number; decision?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  if (!(["accepted", "overridden", "start_beginning"] as const).includes(
    body.decision as "accepted" | "overridden" | "start_beginning"
  )) {
    return NextResponse.json({ error: "Invalid placement decision" }, { status: 400, headers: noStore });
  }
  try {
    return NextResponse.json(await savePlacementPreference({
      userId: resolved.user.id,
      courseId: resolved.courseId,
      selectedLessonId: body.selectedLessonId === undefined
        ? undefined
        : Number(body.selectedLessonId),
      decision: body.decision as "accepted" | "overridden" | "start_beginning",
    }), { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
