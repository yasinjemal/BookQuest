import { NextRequest, NextResponse } from "next/server";
import { getCourse, setCoursePublished } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const course = await getCourse(Number(id));
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (course.owner_id !== user.id) {
    return NextResponse.json({ error: "Only the owner can publish" }, { status: 403 });
  }
  if (course.status !== "ready") {
    return NextResponse.json(
      { error: "Wait until the course finishes generating." },
      { status: 400 }
    );
  }
  const body = (await req.json()) as { published: boolean; category?: string };
  const category = CATEGORIES.includes(body.category ?? "")
    ? (body.category as string)
    : course.category;
  await setCoursePublished(course.id, !!body.published, category);
  return NextResponse.json({ ok: true });
}
