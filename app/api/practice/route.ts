import { NextRequest, NextResponse } from "next/server";
import {
  db,
  getCourseMastery,
  listEnrolledCourses,
  listOwnedCourses,
  recordConceptAnswer,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Practice hub summary: per accessible course, the learner's weakest concepts. */
export async function GET(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const courses = [...listOwnedCourses(user.id), ...listEnrolledCourses(user.id)]
    .filter((c) => c.status === "ready");
  const summary = courses.map((c) => {
    const mastery = getCourseMastery(user.id, c.id);
    const avg =
      mastery.length > 0
        ? mastery.reduce((s, m) => s + m.mastery, 0) / mastery.length
        : null;
    return {
      courseId: c.id,
      title: c.title,
      conceptCount: mastery.length,
      avgMastery: avg,
      weakest: mastery.slice(0, 3).map((m) => ({
        concept: m.concept,
        mastery: m.mastery,
      })),
    };
  });
  return NextResponse.json({ courses: summary });
}

/** Record a practice answer against the mastery model (+2 XP if correct). */
export async function POST(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const body = (await req.json()) as {
    courseId: number;
    concept: string;
    correct: boolean;
  };
  if (!body.courseId || !body.concept) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  recordConceptAnswer(user.id, Number(body.courseId), body.concept, !!body.correct);
  if (body.correct) {
    db.prepare("UPDATE user_stats SET total_xp = total_xp + 2 WHERE user_id = ?").run(
      user.id
    );
  }
  return NextResponse.json({ ok: true });
}
