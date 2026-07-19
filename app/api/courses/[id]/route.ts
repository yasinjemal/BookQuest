import { NextRequest, NextResponse } from "next/server";
import {
  deleteCourse,
  CourseDeletionConflictError,
  canAccessCourse,
  countDueReviewsForCourse,
  canReadCourseWithoutEnrollment,
  getCompletedLessonIds,
  getCourse,
  getCourseAppearanceJson,
  getCourseMastery,
  listLessons,
  listModules,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { authorizeCourseAction, authorizeStoredMembership } from "@/lib/spaces";
import { spaceApiError } from "@/lib/space-api";
import { parseCourseAppearance } from "@/lib/course-appearance";
import { isCourseGenerationStalled } from "@/lib/generation";
import { getCourseDisplayCoverHash } from "@/lib/cover-images";
import { pool } from "@/lib/pg";
import { isCoursePubliclyVisible } from "@/lib/public-product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const course = await getCourse(Number(id));
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const legacyOwner = course.owner_id === user.id;
  let canViewDraft = false;
  if (course.owning_space_id) {
    try {
      await authorizeStoredMembership(user.id, course.owning_space_id, "content.review", pool);
      canViewDraft = true;
    } catch {
      canViewDraft = false;
    }
  }
  let canEdit = false;
  try {
    await authorizeCourseAction(user.id, course.id, "content.update");
    canEdit = true;
  } catch {
    canEdit = false;
  }
  const hasExistingLearningAccess = !canViewDraft && await canReadCourseWithoutEnrollment(user.id, course.id);
  const canOpenPublicCourse = !canViewDraft && !hasExistingLearningAccess &&
    await isCoursePubliclyVisible(course.id) && await canAccessCourse(user.id, course.id);
  if (!canViewDraft && !hasExistingLearningAccess && !canOpenPublicCourse) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [completed, moduleRows, mastery, dueReviews, appearanceJson, coverHash] = await Promise.all([
    getCompletedLessonIds(user.id),
    listModules(course.id),
    getCourseMastery(user.id, course.id),
    countDueReviewsForCourse(user.id, course.id),
    getCourseAppearanceJson(course.id, canViewDraft),
    getCourseDisplayCoverHash(course.id, canViewDraft),
  ]);
  const modules = await Promise.all(
    moduleRows.map(async (m) => ({
      ...m,
      lessons: (await listLessons(m.id)).map((l) => ({
        id: l.id,
        title: l.title,
        position: l.position,
        cardCount: (JSON.parse(l.cards) as unknown[]).length,
        completed: completed.has(l.id),
      })),
    }))
  );
  return NextResponse.json({
    viewerId: user.id,
    course: {
      ...course,
      isOwner: legacyOwner && canEdit,
      canEdit,
      generation_stalled: isCourseGenerationStalled(course),
      appearance: parseCourseAppearance(appearanceJson),
      coverHash,
    },
    modules,
    learning: {
      conceptCount: mastery.length,
      avgMastery: mastery.length > 0 ? mastery.reduce((sum, row) => sum + row.mastery, 0) / mastery.length : null,
      weakest: mastery.slice(0, 3).map(({ concept, mastery: score }) => ({ concept, mastery: score })),
      dueReviews,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
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
  try {
    await deleteCourse(course.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CourseDeletionConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
