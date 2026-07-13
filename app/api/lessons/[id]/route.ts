import { NextRequest, NextResponse } from "next/server";
import {
  canAccessCourse,
  createLessonAnswerSession,
  getCourse,
  getLesson,
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
  const lesson = await getLesson(Number(id));
  if (!lesson || !(await canAccessCourse(user.id, lesson.course_id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [course, modules] = await Promise.all([
    getCourse(lesson.course_id),
    listModules(lesson.course_id),
  ]);
  const lessonLocations = (await Promise.all(
    modules.map(async (module) => (await listLessons(module.id)).map((item) => ({
      id: item.id,
      moduleTitle: module.title,
    })))
  )).flat();
  const lessonPosition = lessonLocations.findIndex((item) => item.id === lesson.id);
  const answerSession = await createLessonAnswerSession(user.id, lesson.id);
  return NextResponse.json({
    id: lesson.id,
    module_id: lesson.module_id,
    title: lesson.title,
    cards: JSON.parse(lesson.cards),
    answerSessionId: answerSession?.id,
    viewerId: user.id,
    course: { id: lesson.course_id, title: course?.title ?? "Course" },
    moduleTitle: lessonLocations[lessonPosition]?.moduleTitle ?? "Current region",
    position: lessonPosition >= 0 ? lessonPosition + 1 : 1,
    totalLessons: lessonLocations.length,
    nextLessonId: lessonPosition >= 0 ? lessonLocations[lessonPosition + 1]?.id ?? null : null,
  });
}
