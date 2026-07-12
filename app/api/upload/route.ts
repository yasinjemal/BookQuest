import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { adjustCredits, createCourse, setCourseSource, setCourseStatus } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { extractDocument } from "@/lib/extract";
import { resolveBaseUrl, runAndChain } from "@/lib/generation";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  operationalSubject,
  recordOperationalError,
} from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED = new Set(["pdf", "docx", "md", "txt", "markdown"]);

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;

  const userLimit = await consumeRateLimit(
    RATE_LIMITS.uploadUser,
    rateLimitSubject("user", user.id)
  );
  if (!userLimit.allowed) return tooManyRequests(userLimit);
  const ipLimit = await consumeRateLimit(
    RATE_LIMITS.uploadIp,
    rateLimitSubject("ip", requestIp(req))
  );
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

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

  const createdCourse = await createCourse(user.id, file.name);
  const courseId = createdCourse.id;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { chapters } = await extractDocument(buffer, file.name);
    // Persist the extracted chapters so a retry can regenerate without the
    // original file (there is no durable filesystem on serverless).
    await setCourseSource(courseId, JSON.stringify(chapters));
    // Charge only after extraction succeeds; a failed generation can be
    // retried free of charge from the course card.
    if (!isAdmin) await adjustCredits(user.id, -1);
    // Durable, resumable generation that survives the serverless time limit by
    // chaining fresh invocations. `after` triggers the first one post-response.
    const baseUrl = resolveBaseUrl(req);
    after(() => runAndChain(courseId, createdCourse.generationRunId, baseUrl));
    return NextResponse.json({ courseId, chapters: chapters.length });
  } catch (err) {
    await recordOperationalError({
      eventType: "document.extraction_failed",
      area: "course.upload",
      error: err,
      subjectKey: operationalSubject("course", courseId),
      metadata: { file_extension: ext, file_size_bytes: file.size },
    });
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
