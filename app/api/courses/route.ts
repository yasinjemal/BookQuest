import { NextRequest, NextResponse } from "next/server";
import {
  getCompletedLessonIds,
  listEnrolledCourses,
  listLessons,
  listModules,
  listOwnedCourses,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { PlatformCourseCols } from "@/lib/db";
import type { CourseRow } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withProgress(
  courses: (CourseRow & PlatformCourseCols)[],
  completed: Set<number>
) {
  return courses.map((c) => {
    const modules = listModules(c.id);
    let totalLessons = 0;
    let doneLessons = 0;
    for (const m of modules) {
      const lessons = listLessons(m.id);
      totalLessons += lessons.length;
      doneLessons += lessons.filter((l) => completed.has(l.id)).length;
    }
    return { ...c, totalLessons, doneLessons, moduleCount: modules.length };
  });
}

export async function GET(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const completed = getCompletedLessonIds(user.id);
  return NextResponse.json({
    owned: withProgress(listOwnedCourses(user.id), completed),
    enrolled: withProgress(listEnrolledCourses(user.id), completed),
  });
}
