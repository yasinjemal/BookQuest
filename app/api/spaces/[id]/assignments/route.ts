import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { createSpaceAssignment } from "@/lib/spaces";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as { courseId?: number; dueAt?: string | null };
  const courseId = Number(body.courseId);
  if (!Number.isInteger(courseId) || (body.dueAt && Number.isNaN(Date.parse(body.dueAt)))) {
    return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      { assignment: await createSpaceAssignment(user.id, (await params).id, courseId, body.dueAt) },
      { status: 201 }
    );
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
