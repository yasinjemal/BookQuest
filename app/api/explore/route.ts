import { NextRequest, NextResponse } from "next/server";
import { isEnrolled, listPublishedCourses } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const courses = listPublishedCourses(q, category).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    owner_name: c.owner_name,
    enroll_count: c.enroll_count,
    mine: c.owner_id === user.id,
    enrolled: isEnrolled(user.id, c.id),
  }));
  return NextResponse.json({ courses });
}
