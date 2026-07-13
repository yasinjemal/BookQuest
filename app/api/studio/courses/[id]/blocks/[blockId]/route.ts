import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";
import { deleteCourseBlock, updateCourseBlock } from "@/lib/studio";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const values = await params;
  const courseId = Number(values.id);
  const body = (await req.json()) as { expectedRevision?: number; content?: unknown; sourceRefs?: unknown[] };
  if (!Number.isInteger(courseId) || !Number.isInteger(body.expectedRevision) || body.content === undefined) {
    return NextResponse.json({ error: "Revision and block content are required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ block: await updateCourseBlock(user.id, courseId, values.blockId, {
      expectedRevision: body.expectedRevision!,
      content: body.content,
      sourceRefs: body.sourceRefs,
    }) });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const values = await params;
  const courseId = Number(values.id);
  if (!Number.isInteger(courseId)) {
    return NextResponse.json({ error: "Invalid course" }, { status: 400 });
  }
  try {
    await deleteCourseBlock(user.id, courseId, values.blockId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
