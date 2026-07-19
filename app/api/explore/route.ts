import { NextRequest, NextResponse } from "next/server";
import { isEnrolled, listPublishedCourses } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { parseCourseAppearance } from "@/lib/course-appearance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
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
      coverHash: c.cover_image_hash,
      public_slug: c.public_slug,
      mine: user ? c.owner_id === user.id : false,
      enrolled: user ? await isEnrolled(user.id, c.id) : false,
    }))
  );
  return NextResponse.json({ courses });
}
