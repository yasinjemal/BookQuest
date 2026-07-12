import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { adjustCredits, createCourse, setCourseSource, setCourseStatus } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { extractDocument } from "@/lib/extract";
import { generateCourse } from "@/lib/generator";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED = new Set(["pdf", "docx", "md", "txt", "markdown"]);

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;

  const isAdmin = user.role === "admin";
  if (!isAdmin && user.credits < 1) {
    return NextResponse.json(
      {
        error:
          "You have no generation credits left. Get more credits from your Profile.",
        code: "no_credits",
      },
      { status: 402 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type .${ext}. Use PDF, DOCX, MD or TXT.` },
      { status: 400 }
    );
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 50 MB)." }, { status: 400 });
  }

  const courseId = await createCourse(user.id, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { chapters } = await extractDocument(buffer, file.name);
    // Persist the extracted chapters so a retry can regenerate without the
    // original file (there is no durable filesystem on serverless).
    await setCourseSource(courseId, JSON.stringify(chapters));
    // Charge only after extraction succeeds; a failed generation can be
    // retried free of charge from the course card.
    if (!isAdmin) await adjustCredits(user.id, -1);
    // `after` runs post-response within the function's budget — unlike a bare
    // fire-and-forget promise, which a serverless worker freezes immediately.
    after(() => generateCourse(courseId, chapters));
    return NextResponse.json({ courseId, chapters: chapters.length });
  } catch (err) {
    await setCourseStatus(
      courseId,
      "error",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: "Could not extract text from this file.", courseId },
      { status: 422 }
    );
  }
}
