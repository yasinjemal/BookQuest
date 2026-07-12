import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  addReviewItem,
  canAccessCourse,
  completeLesson,
  courseAverageScore,
  getCompletedLessonIds,
  getLesson,
  getStats,
  issueCertificate,
  listLessons,
  listModules,
  recordConceptAnswer,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Card } from "@/lib/schemas";

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
    results?: Record<string, boolean>; // cardIndex -> correct
  };
  const score = Math.max(0, Math.floor(body.score ?? 0));
  const total = Math.max(1, Math.floor(body.total ?? 1));
  const xp = 10 + score * 5;

  completeLesson(user.id, lessonId, score, total, xp);
  for (const idx of body.wrongCardIndexes ?? []) {
    addReviewItem(user.id, lessonId, idx);
  }

  // ---- Mastery engine: record every quiz answer against its concept ----
  const cards = JSON.parse(lesson.cards) as Card[];
  for (const [idxStr, correct] of Object.entries(body.results ?? {})) {
    const card = cards[Number(idxStr)];
    if (!card || !card.type.startsWith("quiz_")) continue;
    const concept =
      ("concept" in card && card.concept) || lesson.title;
    recordConceptAnswer(user.id, lesson.course_id, concept, !!correct);
  }

  // ---- Certificate: issued when every lesson in the course is complete ----
  let certificate: { id: string } | null = null;
  const completed = getCompletedLessonIds(user.id);
  completed.add(lessonId);
  const modules = listModules(lesson.course_id);
  let allLessons = 0;
  let allDone = 0;
  for (const m of modules) {
    for (const l of listLessons(m.id)) {
      allLessons++;
      if (completed.has(l.id)) allDone++;
    }
  }
  if (allLessons > 0 && allDone === allLessons) {
    const cert = issueCertificate(
      crypto.randomBytes(8).toString("hex"),
      user.id,
      lesson.course_id,
      courseAverageScore(user.id, lesson.course_id)
    );
    certificate = { id: cert.id };
  }

  return NextResponse.json({ xp, stats: getStats(user.id), certificate });
}
