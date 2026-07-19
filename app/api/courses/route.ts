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
import { isCourseGenerationStalled } from "@/lib/generation";
import { parseCourseAppearance } from "@/lib/course-appearance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function withProgress(
  courses: (CourseRow & PlatformCourseCols)[],
  completed: Set<number>
) {
  return Promise.all(
    courses.map(async (c) => {
      const modules = await listModules(c.id);
      let totalLessons = 0;
      let doneLessons = 0;
      let nextLessonId: number | null = null;
      for (const m of modules) {
        const lessons = await listLessons(m.id);
        totalLessons += lessons.length;
        doneLessons += lessons.filter((l) => completed.has(l.id)).length;
        if (nextLessonId === null) {
          nextLessonId = lessons.find((l) => !completed.has(l.id))?.id ?? null;
        }
      }
      return {
        ...c,
        appearance: parseCourseAppearance(c.appearance_json),
        totalLessons,
        doneLessons,
        nextLessonId,
        moduleCount: modules.length,
        generation_stalled: isCourseGenerationStalled(c),
      };
    })
  );
}

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const completed = await getCompletedLessonIds(user.id);
  const [ownedCourses, enrolledCourses] = await Promise.all([
    listOwnedCourses(user.id),
    listEnrolledCourses(user.id),
  ]);
  const [owned, enrolled] = await Promise.all([
    withProgress(ownedCourses, completed),
    withProgress(enrolledCourses, completed),
  ]);

  return NextResponse.json({ owned, enrolled });
}
