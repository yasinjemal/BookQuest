import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  reassignAssignmentMember,
  removeAssignmentMember,
  reviseInstitutionalAssignment,
  type AssignmentAudience,
} from "@/lib/institutional";
import { institutionalApiError } from "@/lib/institutional-api";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const assignmentId = (await params).id;
  const body = (await req.json()) as {
    action?: "revise" | "reassign" | "remove" | "exempt";
    membershipId?: string;
    reason?: string;
    completionRuleVersionId?: string;
    audience?: AssignmentAudience;
    startAt?: string | null;
    dueAt?: string | null;
    expiresAt?: string | null;
    maxAttempts?: number | null;
    reminderHoursBeforeDue?: number[];
    escalationHoursAfterDue?: number[];
  };
  try {
    if (body.action === "revise" && body.completionRuleVersionId && body.audience) {
      return NextResponse.json({ assignment: await reviseInstitutionalAssignment(user.id, assignmentId, {
        completionRuleVersionId: body.completionRuleVersionId,
        audience: body.audience,
        startAt: body.startAt,
        dueAt: body.dueAt,
        expiresAt: body.expiresAt,
        maxAttempts: body.maxAttempts,
        reminderHoursBeforeDue: body.reminderHoursBeforeDue,
        escalationHoursAfterDue: body.escalationHoursAfterDue,
      }) });
    }
    if (body.action === "reassign" && body.membershipId && body.reason) {
      return NextResponse.json({ participation: await reassignAssignmentMember(user.id, assignmentId, body.membershipId, body.reason) });
    }
    if ((body.action === "remove" || body.action === "exempt") && body.membershipId && body.reason) {
      return NextResponse.json(await removeAssignmentMember(user.id, assignmentId, body.membershipId, {
        exempt: body.action === "exempt",
        reason: body.reason,
      }));
    }
    return NextResponse.json({ error: "Invalid assignment action" }, { status: 400 });
  } catch (error) {
    const response = institutionalApiError(error);
    if (response) return response;
    throw error;
  }
}

