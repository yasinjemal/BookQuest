import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { createSpaceAssignment } from "@/lib/spaces";
import { createInstitutionalAssignment, type AssignmentAudience } from "@/lib/institutional";
import { institutionalApiError } from "@/lib/institutional-api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as {
    courseId?: number;
    completionRuleVersionId?: string;
    audience?: AssignmentAudience;
    startAt?: string | null;
    dueAt?: string | null;
    expiresAt?: string | null;
    maxAttempts?: number | null;
    reminderHoursBeforeDue?: number[];
    escalationHoursAfterDue?: number[];
  };
  const courseId = Number(body.courseId);
  if (!Number.isInteger(courseId) || [body.startAt, body.dueAt, body.expiresAt].some((value) => value && Number.isNaN(Date.parse(value)))) {
    return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  }
  try {
    if (body.completionRuleVersionId && body.audience) {
      return NextResponse.json(
        { assignment: await createInstitutionalAssignment(user.id, (await params).id, courseId, {
          completionRuleVersionId: body.completionRuleVersionId,
          audience: body.audience,
          startAt: body.startAt,
          dueAt: body.dueAt,
          expiresAt: body.expiresAt,
          maxAttempts: body.maxAttempts,
          reminderHoursBeforeDue: body.reminderHoursBeforeDue,
          escalationHoursAfterDue: body.escalationHoursAfterDue,
        }) },
        { status: 201 }
      );
    }
    return NextResponse.json(
      { assignment: await createSpaceAssignment(user.id, (await params).id, courseId, body.dueAt) },
      { status: 201 }
    );
  } catch (error) {
    const institutional = institutionalApiError(error);
    if (institutional) return institutional;
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
