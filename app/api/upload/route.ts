import { after, NextRequest, NextResponse } from "next/server";
import {
  adjustCredits,
  consumeCredits,
  createCourse,
  deleteCourse,
  setCourseSource,
  setCourseStatus,
} from "@/lib/db";
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
import { aiUnavailablePayload, getAiAvailability } from "@/lib/ai-provider";
import {
  createSummary,
  deleteSummary,
  setSummarySource,
  setSummaryStatus,
} from "@/lib/summary-db";
import { runSummaryAndChain } from "@/lib/summary-generation";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED = new Set(["pdf", "docx", "pptx", "md", "txt", "markdown"]);
type OutputMode = "course" | "summary" | "both";

function outputMode(value: FormDataEntryValue | null): OutputMode | null {
  if (value === null) return "course";
  return value === "course" || value === "summary" || value === "both"
    ? value
    : null;
}

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

  const form = await req.formData();
  const output = outputMode(form.get("output"));
  if (!output) {
    return NextResponse.json({ error: "Choose course, summary, or both." }, { status: 400 });
  }
  const generateRequested = form.get("generate") !== "false";
  const wantsCourse = output === "course" || output === "both";
  const wantsSummary = output === "summary" || output === "both";
  const courseUsesAi = wantsCourse && (output === "both" || generateRequested);
  const requiresAi = wantsSummary || courseUsesAi;
  const creditsRequired = (wantsSummary ? 1 : 0) + (courseUsesAi ? 1 : 0);
  const ai = getAiAvailability();
  if (requiresAi && !ai.enabled) {
    return NextResponse.json(aiUnavailablePayload(ai), { status: 503 });
  }

  const isAdmin = user.role === "admin";
  if (!isAdmin && creditsRequired > 0 && user.credits < creditsRequired) {
    return NextResponse.json(
      {
        error: `This creation needs ${creditsRequired} credit${creditsRequired === 1 ? "" : "s"}. You currently have ${user.credits}.`,
        code: "no_credits",
        creditsRequired,
      },
      { status: 402 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type .${ext}. Use PDF, DOCX, PPTX, MD or TXT.` },
      { status: 400 }
    );
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 50 MB)." }, { status: 400 });
  }

  let chapters;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    ({ chapters } = await extractDocument(buffer, file.name));
  } catch (error) {
    await recordOperationalError({
      eventType: "document.extraction_failed",
      area: "creation.upload",
      error,
      subjectKey: operationalSubject("user", user.id),
      metadata: { file_extension: ext, file_size_bytes: file.size, output },
    });
    return NextResponse.json(
      { error: "Could not extract readable text from this file." },
      { status: 422 }
    );
  }

  let charged = false;
  if (!isAdmin && creditsRequired > 0) {
    charged = await consumeCredits(user.id, creditsRequired);
    if (!charged) {
      return NextResponse.json(
        {
          error: `This creation needs ${creditsRequired} credit${creditsRequired === 1 ? "" : "s"}. Your balance changed before the upload finished.`,
          code: "no_credits",
          creditsRequired,
        },
        { status: 402 }
      );
    }
  }

  let createdCourse: Awaited<ReturnType<typeof createCourse>> | undefined;
  let createdSummary: Awaited<ReturnType<typeof createSummary>> | undefined;
  const sourceJson = JSON.stringify(chapters);
  try {
    if (wantsCourse) {
      createdCourse = await createCourse(user.id, file.name);
      await setCourseSource(createdCourse.id, sourceJson, {
        mimeType: file.type || null,
        extractorVersion: "bookquest-extract-v2",
        metadata: {
          file_extension: ext,
          file_size_bytes: file.size,
          chapter_count: chapters.length,
          requested_output: output,
        },
      });
    }
    if (wantsSummary) {
      createdSummary = await createSummary(user.id, file.name, createdCourse?.id);
      await setSummarySource(
        createdSummary.id,
        sourceJson,
        chapters.length,
        createdSummary.generationRunId
      );
    }
    if (createdCourse && !courseUsesAi) {
      await setCourseStatus(createdCourse.id, "ready");
    }
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    // Creation spans the established course and summary stores. If either half
    // fails, remove every artifact before refunding so a retryable, source-backed
    // course can never survive after the full charge was returned.
    if (createdSummary) {
      await deleteSummary(createdSummary.id, user.id).catch((cleanupError) => {
        cleanupErrors.push(cleanupError);
      });
    }
    if (createdCourse) {
      await deleteCourse(createdCourse.id).catch((cleanupError) => {
        cleanupErrors.push(cleanupError);
      });
    }
    let creditsRefunded = false;
    if (charged && cleanupErrors.length === 0) {
      await adjustCredits(user.id, creditsRequired)
        .then(() => { creditsRefunded = true; })
        .catch((refundError) => { cleanupErrors.push(refundError); });
    }
    if (cleanupErrors.length > 0) {
      if (createdCourse) {
        await setCourseStatus(
          createdCourse.id,
          "error",
          "Artifact creation did not finish safely."
        ).catch(() => undefined);
      }
      if (createdSummary) {
        await setSummaryStatus(
          createdSummary.id,
          "error",
          "Artifact creation did not finish safely."
        ).catch(() => undefined);
      }
    }
    await recordOperationalError({
      eventType: "creation.artifact_failed",
      area: "creation.upload",
      error,
      subjectKey: operationalSubject("user", user.id),
      metadata: {
        output,
        file_extension: ext,
        cleanup_error_count: cleanupErrors.length,
        credits_refunded: creditsRefunded,
      },
    });
    return NextResponse.json(
      { error: "The document was opened, but its new reading experience could not be created." },
      { status: 500 }
    );
  }

  const baseUrl = requiresAi ? resolveBaseUrl(req) : null;
  if (baseUrl) {
    after(() =>
      Promise.all([
        ...(createdCourse && courseUsesAi
          ? [runAndChain(createdCourse.id, createdCourse.generationRunId, baseUrl)]
          : []),
        ...(createdSummary
          ? [runSummaryAndChain(createdSummary.id, createdSummary.generationRunId, baseUrl)]
          : []),
      ])
    );
  }

  const destinationUrl = createdSummary
    ? `/summary/${createdSummary.id}`
    : createdCourse
      ? `/studio/${createdCourse.id}`
      : "/";
  return NextResponse.json({
    mode: output,
    courseId: createdCourse?.id,
    summaryId: createdSummary?.id,
    chapters: chapters.length,
    creditsUsed: isAdmin ? 0 : creditsRequired,
    destinationUrl,
    ...(createdCourse ? { studioUrl: `/studio/${createdCourse.id}` } : {}),
  });
}
