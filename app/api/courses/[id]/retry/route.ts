import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getCourse, prepareCourseRetry, setCourseStatus } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { extractDocument } from "@/lib/extract";
import { generateCourse } from "@/lib/generator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const course = getCourse(Number(id));
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (course.owner_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Only the owner can retry" }, { status: 403 });
  }
  const uploadPath = path.join(
    process.cwd(),
    "data",
    "uploads",
    `${course.id}-${course.source_filename.replace(/[^\w.\-]+/g, "_")}`
  );
  try {
    await fs.access(uploadPath);
  } catch {
    return NextResponse.json(
      { error: "Original file no longer exists. Please upload it again." },
      { status: 410 }
    );
  }

  // Retrying a failed generation is free — the credit was already spent.
  if (!prepareCourseRetry(course.id)) {
    return NextResponse.json(
      { error: "This course is already being generated." },
      { status: 409 }
    );
  }

  try {
    const { chapters } = await extractDocument(uploadPath, course.source_filename);
    void generateCourse(course.id, chapters);
    return NextResponse.json({ ok: true });
  } catch (err) {
    setCourseStatus(
      course.id,
      "error",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json({ error: "Extraction failed" }, { status: 422 });
  }
}
