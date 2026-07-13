import { NextRequest, NextResponse } from "next/server";
import { isEnrolled, listPublishedCourses } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseCourseAppearance } from "@/lib/course-appearance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const published = await listPublishedCourses(q, category);
  const courses = await Promise.all(
    published.map(async (c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      category: c.category,
      owner_name: c.owner_name,
      enroll_count: c.enroll_count,
      appearance: parseCourseAppearance(c.appearance_json),
      mine: c.owner_id === user.id,
      enrolled: await isEnrolled(user.id, c.id),
    }))
  );
  return NextResponse.json({ courses });
}
