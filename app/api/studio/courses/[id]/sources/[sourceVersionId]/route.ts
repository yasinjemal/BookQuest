import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { studioApiError } from "@/lib/studio-api";
import { getCourseSourceDocument } from "@/lib/studio";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sourceVersionId: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const values = await params;
  const courseId = Number(values.id);
  if (!Number.isInteger(courseId)) {
    return NextResponse.json({ error: "Invalid course" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      source: await getCourseSourceDocument(user.id, courseId, values.sourceVersionId),
    });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
