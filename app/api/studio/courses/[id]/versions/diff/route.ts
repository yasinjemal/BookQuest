import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { studioApiError } from "@/lib/studio-api";
import { diffCourseVersions } from "@/lib/studio";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const courseId = Number((await params).id);
  const base = req.nextUrl.searchParams.get("base");
  const compare = req.nextUrl.searchParams.get("compare");
  if (!Number.isInteger(courseId) || !base || !compare) {
    return NextResponse.json({ error: "Two course versions are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await diffCourseVersions(user.id, courseId, base, compare));
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
