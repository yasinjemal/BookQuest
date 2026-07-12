import { NextRequest, NextResponse } from "next/server";
import {
  canAccessCourse,
  createLessonAnswerSession,
  getLesson,
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
  const lesson = getLesson(Number(id));
  if (!lesson || !canAccessCourse(user.id, lesson.course_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const answerSession = createLessonAnswerSession(user.id, lesson.id);
  return NextResponse.json({
    id: lesson.id,
    module_id: lesson.module_id,
    title: lesson.title,
    cards: JSON.parse(lesson.cards),
    answerSessionId: answerSession?.id,
    viewerId: user.id,
  });
}
