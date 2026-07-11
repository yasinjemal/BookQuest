import { NextRequest, NextResponse } from "next/server";
import {
  addReviewItem,
  canAccessCourse,
  completeLesson,
  getLesson,
  getStats,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const lessonId = Number(id);
  const lesson = getLesson(lessonId);
  if (!lesson || !canAccessCourse(user.id, lesson.course_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json()) as {
    score: number;
    total: number;
    wrongCardIndexes?: number[];
  };
  const score = Math.max(0, Math.floor(body.score ?? 0));
  const total = Math.max(1, Math.floor(body.total ?? 1));
  const xp = 10 + score * 5;

  completeLesson(user.id, lessonId, score, total, xp);
  for (const idx of body.wrongCardIndexes ?? []) {
    addReviewItem(user.id, lessonId, idx);
  }
  return NextResponse.json({ xp, stats: getStats(user.id) });
}
