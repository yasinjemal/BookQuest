import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCourseReader, PublicProductError, recordCourseEvent } from "@/lib/public-product";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(request); if (!user) return unauth;
  try { const courseId = Number((await params).id); const result = await getCourseReader(user.id, courseId); await recordCourseEvent(courseId, "reader_open"); return NextResponse.json(result); }
  catch (error) { if (error instanceof PublicProductError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
}
