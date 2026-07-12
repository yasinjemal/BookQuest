import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  addReviewItem,
  canAccessCourse,
  completeLesson,
  courseAverageScore,
  db,
  getCompletedLessonIds,
  getLearnerKey,
  getLesson,
  getLessonEvidenceSummary,
  getStats,
  issueCertificate,
  listLessons,
  listModules,
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
    answerSessionId?: string;
  };
  if (!body.answerSessionId) {
    return NextResponse.json(
      { error: "Reload the lesson before completing it." },
      { status: 400 }
    );
  }
  const evidence = getLessonEvidenceSummary(
    user.id,
    lessonId,
    body.answerSessionId
  );
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

  const completion = db.transaction(() => {
    const duplicate = db
      .prepare(
        "SELECT 1 FROM lesson_completion_events WHERE answer_session_id = ?"
      )
      .get(body.answerSessionId);
    if (duplicate) {
      return { xp: 0, certificate: null as { id: string } | null, duplicate: true };
    }

    const xp = completeLesson(user.id, lessonId, score, total, possibleXp);
    for (const idx of wrongCardIndexes) addReviewItem(user.id, lessonId, idx);

    let certificate: { id: string } | null = null;
    const completed = getCompletedLessonIds(user.id);
    completed.add(lessonId);
    let allLessons = 0;
    let allDone = 0;
    for (const module of listModules(lesson.course_id)) {
      for (const courseLesson of listLessons(module.id)) {
        allLessons++;
        if (completed.has(courseLesson.id)) allDone++;
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

    db.prepare(
      `INSERT INTO lesson_completion_events
        (answer_session_id, learner_key, course_id, lesson_id, score, total, xp_awarded)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      body.answerSessionId,
      getLearnerKey(user.id),
      lesson.course_id,
      lessonId,
      score,
      total,
      xp
    );
    return { xp, certificate, duplicate: false };
  })();

  return NextResponse.json({
    xp: completion.xp,
    stats: getStats(user.id),
    certificate: completion.certificate,
    duplicate: completion.duplicate,
  });
}
