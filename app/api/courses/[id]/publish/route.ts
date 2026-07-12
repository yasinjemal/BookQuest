import { NextRequest, NextResponse } from "next/server";
import { getCourse, setCoursePublished } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { authorizeCourseAction } from "@/lib/spaces";
import { spaceApiError } from "@/lib/space-api";
import { publishApprovedCourseVersion, StudioConflictError } from "@/lib/studio";
import { studioApiError } from "@/lib/studio-api";

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
  try {
    await authorizeCourseAction(user.id, course.id, "content.publish");
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
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
  try {
    if (!body.published) {
      await setCoursePublished(course.id, false, category);
      return NextResponse.json({ ok: true, published: false });
    }
    return NextResponse.json(await publishApprovedCourseVersion(user.id, course.id, category));
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    if (error instanceof StudioConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
