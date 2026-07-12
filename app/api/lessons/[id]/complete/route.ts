import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  addReviewItem,
  canAccessCourse,
  completeLesson,
  courseAverageScore,
  getCompletedLessonIds,
  getLearnerKey,
  getLesson,
  getLessonEvidenceSummary,
  getStats,
  issueCertificate,
  lessonCompletionExists,
  listLessons,
  listModules,
  recordLessonCompletion,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const lessonId = Number(id);
  const lesson = await getLesson(lessonId);
  if (!lesson || !(await canAccessCourse(user.id, lesson.course_id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json()) as {
    answerSessionId?: string;
  };
  if (!body.answerSessionId) {
    return NextResponse.json(
      { error: "Reload the lesson before completing it." },
      { status: 400 }
    );
  }
  const answerSessionId = body.answerSessionId;
  const evidence = await getLessonEvidenceSummary(user.id, lessonId, answerSessionId);
  if (!evidence) {
    return NextResponse.json(
      {
        error: "Your answers are still syncing. Check your connection and try again.",
        code: "evidence_pending",
      },
      { status: 409 }
    );
  }
  const { score, total, wrongCardIndexes } = evidence;
  const possibleXp = 10 + score * 5;

  let completion: {
    xp: number;
    certificate: { id: string } | null;
    duplicate: boolean;
  };

  if (await lessonCompletionExists(answerSessionId)) {
    completion = { xp: 0, certificate: null, duplicate: true };
  } else {
    // completeLesson (progress upsert), addReviewItem and issueCertificate are
    // each internally idempotent; recordLessonCompletion's PK is the final
    // guard against double-crediting if two requests race.
    const xp = await completeLesson(user.id, lessonId, score, total, possibleXp);
    for (const idx of wrongCardIndexes) await addReviewItem(user.id, lessonId, idx);

    let certificate: { id: string } | null = null;
    const completed = await getCompletedLessonIds(user.id);
    completed.add(lessonId);
    let allLessons = 0;
    let allDone = 0;
    for (const module of await listModules(lesson.course_id)) {
      for (const courseLesson of await listLessons(module.id)) {
        allLessons++;
        if (completed.has(courseLesson.id)) allDone++;
      }
    }
    if (allLessons > 0 && allDone === allLessons) {
      const cert = await issueCertificate(
        crypto.randomBytes(8).toString("hex"),
        user.id,
        lesson.course_id,
        await courseAverageScore(user.id, lesson.course_id)
      );
      certificate = { id: cert.id };
    }

    const learnerKey = await getLearnerKey(user.id);
    const inserted = await recordLessonCompletion({
      answerSessionId,
      learnerKey,
      courseId: lesson.course_id,
      lessonId,
      score,
      total,
      xpAwarded: xp,
    });
    completion = inserted
      ? { xp, certificate, duplicate: false }
      : { xp: 0, certificate: null, duplicate: true };
  }

  return NextResponse.json({
    xp: completion.xp,
    stats: await getStats(user.id),
    certificate: completion.certificate,
    duplicate: completion.duplicate,
  });
}
