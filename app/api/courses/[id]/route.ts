import { NextRequest, NextResponse } from "next/server";
import {
  canAccessCourse,
  deleteCourse,
  getCompletedLessonIds,
  getCourse,
  isEnrolled,
  listLessons,
  listModules,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const course = getCourse(Number(id));
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = course.owner_id === user.id;
  if (!isOwner && !course.published && !isEnrolled(user.id, course.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const completed = getCompletedLessonIds(user.id);
  const modules = listModules(course.id).map((m) => ({
    ...m,
    lessons: listLessons(m.id).map((l) => ({
      id: l.id,
      title: l.title,
      position: l.position,
      cardCount: (JSON.parse(l.cards) as unknown[]).length,
      completed: completed.has(l.id),
    })),
  }));
  return NextResponse.json({
    course: { ...course, isOwner },
    modules,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const course = getCourse(Number(id));
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (course.owner_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Only the owner can delete a course" }, { status: 403 });
  }
  deleteCourse(course.id);
  return NextResponse.json({ ok: true });
}
