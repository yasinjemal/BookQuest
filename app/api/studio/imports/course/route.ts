import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { analyzeCourseArchive, importCourseArchive, MAX_COURSE_ARCHIVE_BYTES, portabilityApiError, type CourseImportReport } from "@/lib/portability";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

function creatorReport(report: CourseImportReport) {
  return {
    ...report,
    counts: { ...report.counts, recipes: report.counts.recipe },
    conflicts: report.issues.filter((issue) => issue.severity !== "error").map((issue) => ({
      code: issue.code,
      message: issue.message,
      resolution: issue.code === "title_conflict" ? "You can rename the private draft before restoring it." : "The import keeps an isolated owned copy.",
    })),
    warnings: report.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
  };
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_COURSE_ARCHIVE_BYTES) return NextResponse.json({ error: "Course archive exceeds the 10 MB limit" }, { status: 413, headers: privateHeaders });
  let body: { mode?: "dry_run" | "import"; targetSpaceId?: string; title?: string; package?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Upload a valid BookQuest portable course JSON file" }, { status: 400, headers: privateHeaders }); }
  if (!body.targetSpaceId || !body.package || !(["dry_run", "import"] as unknown[]).includes(body.mode)) {
    return NextResponse.json({ error: "Mode, destination workspace, and package are required" }, { status: 400, headers: privateHeaders });
  }
  try {
    if (body.mode === "dry_run") {
      const report = await analyzeCourseArchive(user.id, body.targetSpaceId, body.package, body.title);
      return NextResponse.json(
        { report: creatorReport(report) },
        { headers: privateHeaders }
      );
    }
    const imported = await importCourseArchive(user.id, body.targetSpaceId, body.package, body.title);
    return NextResponse.json(
      { import: { ...imported, studioUrl: `/studio/${imported.courseId}` } },
      { status: 201, headers: privateHeaders }
    );
  } catch (error) {
    const portability = portabilityApiError(error);
    if (portability) return NextResponse.json({ error: portability.error }, { status: portability.status, headers: privateHeaders });
    const response = spaceApiError(error);
    if (response) { response.headers.set("Cache-Control", "private, no-store"); return response; }
    throw error;
  }
}
