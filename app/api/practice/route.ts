import { NextRequest, NextResponse } from "next/server";
import {
  getCourseMastery,
  listEnrolledCourses,
  listOwnedCourses,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Practice hub summary: per accessible course, the learner's weakest concepts. */
export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const [owned, enrolled] = await Promise.all([
    listOwnedCourses(user.id),
    listEnrolledCourses(user.id),
  ]);
  const courses = [...owned, ...enrolled].filter((c) => c.status === "ready");
  const summary = await Promise.all(
    courses.map(async (c) => {
      const mastery = await getCourseMastery(user.id, c.id);
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
    })
  );
  return NextResponse.json({ courses: summary });
}

/** Old clients supplied their own correctness. Reload to use verified evidence. */
export async function POST() {
  return NextResponse.json(
    { error: "This answer endpoint has moved. Reload BookQuest and try again." },
    { status: 410 }
  );
}
