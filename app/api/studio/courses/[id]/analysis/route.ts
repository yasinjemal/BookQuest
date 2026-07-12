import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { studioApiError } from "@/lib/studio-api";
import { analyzeCourseVersion } from "@/lib/studio";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId)) return NextResponse.json({ error: "Invalid course" }, { status: 400 });
  try {
    return NextResponse.json(await analyzeCourseVersion(user.id, courseId));
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
