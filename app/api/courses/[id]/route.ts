import { NextRequest, NextResponse } from "next/server";
import {
  deleteCourse,
  canAccessCourse,
  countDueReviewsForCourse,
  getCompletedLessonIds,
  getCourse,
  getCourseAppearanceJson,
  getCourseMastery,
  listLessons,
  listModules,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { authorizeCourseAction } from "@/lib/spaces";
import { spaceApiError } from "@/lib/space-api";
import { parseCourseAppearance } from "@/lib/course-appearance";

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

  const isOwner = course.owner_id === user.id;
  if (!(await canAccessCourse(user.id, course.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [completed, moduleRows, mastery, dueReviews] = await Promise.all([
    getCompletedLessonIds(user.id),
    listModules(course.id),
    getCourseMastery(user.id, course.id),
    countDueReviewsForCourse(user.id, course.id),
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
    course: {
      ...course,
      isOwner,
      appearance: parseCourseAppearance(await getCourseAppearanceJson(course.id, isOwner)),
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
  await deleteCourse(course.id);
  return NextResponse.json({ ok: true });
}
