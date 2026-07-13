import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { CourseAppearanceSchema } from "@/lib/course-appearance";
import { getCourse } from "@/lib/db";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";
import {
  branchPublishedCourseVersion,
  updateCourseAppearance,
} from "@/lib/studio";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.studioMutationUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId)) {
    return NextResponse.json({ error: "Invalid course" }, { status: 400 });
  }
  const parsed = CourseAppearanceSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid course appearance" }, { status: 400 });
  }
  try {
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let branched = false;
    if (!course.current_draft_version_id && course.published_version_id) {
      await branchPublishedCourseVersion(user.id, courseId);
      branched = true;
    }
    const result = await updateCourseAppearance(user.id, courseId, parsed.data);
    return NextResponse.json({ ...result, branched });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
