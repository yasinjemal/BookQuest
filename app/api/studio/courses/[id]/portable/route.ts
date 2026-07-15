import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { COURSE_ARCHIVE_FORMAT, COURSE_ARCHIVE_SCHEMA_VERSION, exportCourseArchive, portabilityApiError } from "@/lib/portability";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  const limit = await consumeRateLimit(RATE_LIMITS.privacyExportUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Invalid course" }, { status: 400, headers: privateHeaders });
  }
  try {
    const coursePackage = await exportCourseArchive(user.id, courseId);
    return new NextResponse(JSON.stringify(coursePackage, null, 2), {
      headers: {
        ...privateHeaders,
        "Content-Type": `application/vnd.bookquest.course+json; version=${COURSE_ARCHIVE_SCHEMA_VERSION}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="bookquest-course-${coursePackage.integrity.sha256.slice(0, 12)}.json"`,
        "X-BookQuest-Portable-Profile": `${COURSE_ARCHIVE_FORMAT}-${COURSE_ARCHIVE_SCHEMA_VERSION}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const portability = portabilityApiError(error);
    if (portability) return NextResponse.json({ error: portability.error }, { status: portability.status, headers: privateHeaders });
    const response = spaceApiError(error);
    if (response) { response.headers.set("Cache-Control", "private, no-store"); return response; }
    throw error;
  }
}
