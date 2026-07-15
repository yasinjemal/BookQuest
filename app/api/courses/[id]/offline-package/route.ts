import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildOfflineCoursePackage, ChannelDeliveryError } from "@/lib/channel-delivery";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.studioMutationUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  try {
    const coursePackage = await buildOfflineCoursePackage(user.id, courseId);
    const download = new URL(req.url).searchParams.get("download") === "1";
    return NextResponse.json(coursePackage, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(download ? {
          "Content-Disposition": `attachment; filename="bookquest-course-${courseId}-v${coursePackage.course.version}.json"`,
        } : {}),
      },
    });
  } catch (error) {
    if (error instanceof ChannelDeliveryError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    throw error;
  }
}
