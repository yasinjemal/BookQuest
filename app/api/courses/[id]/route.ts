import { NextRequest, NextResponse } from "next/server";
import {
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
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const course = await getCourse(Number(id));
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = course.owner_id === user.id;
  if (!isOwner && !course.published && !(await isEnrolled(user.id, course.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const completed = await getCompletedLessonIds(user.id);
  const moduleRows = await listModules(course.id);
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
    course: { ...course, isOwner },
    modules,
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
  if (course.owner_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Only the owner can delete a course" }, { status: 403 });
  }
  await deleteCourse(course.id);
  return NextResponse.json({ ok: true });
}
