import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getCourse, getCourseSource, prepareCourseRetry } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveBaseUrl, runAndChain } from "@/lib/generation";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const course = await getCourse(Number(id));
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (course.owner_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Only the owner can retry" }, { status: 403 });
  }

  // The stored chapters are what generation regenerates from (no original file).
  const sourceJson = await getCourseSource(course.id);
  if (!sourceJson) {
    return NextResponse.json(
      { error: "Original document is no longer available. Please upload it again." },
      { status: 410 }
    );
  }
  try {
    JSON.parse(sourceJson);
  } catch {
    return NextResponse.json(
      { error: "Stored document was corrupted. Please upload it again." },
      { status: 410 }
    );
  }

  // Retrying a failed generation is free — the credit was already spent.
  if (!(await prepareCourseRetry(course.id))) {
    return NextResponse.json(
      { error: "This course is already being generated." },
      { status: 409 }
    );
  }

  const baseUrl = resolveBaseUrl(req);
  after(() => runAndChain(course.id, baseUrl));
  return NextResponse.json({ ok: true });
}
