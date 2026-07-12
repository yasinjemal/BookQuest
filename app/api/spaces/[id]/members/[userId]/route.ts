import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { removeSpaceMember, updateSpaceMemberRole } from "@/lib/spaces";
import type { SpaceRole } from "@/lib/space-authorization";

const ROLES = new Set<SpaceRole>(["administrator", "creator", "reviewer", "manager", "learner", "auditor"]);

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const values = await params;
  const subjectUserId = Number(values.userId);
  if (!Number.isInteger(subjectUserId)) return NextResponse.json({ error: "Invalid member" }, { status: 400 });
  try {
    await removeSpaceMember(user.id, values.id, subjectUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const values = await params;
  const subjectUserId = Number(values.userId);
  const body = (await req.json()) as { role?: SpaceRole };
  if (!Number.isInteger(subjectUserId) || !body.role || !ROLES.has(body.role)) {
    return NextResponse.json({ error: "Invalid member role" }, { status: 400 });
  }
  try {
    return NextResponse.json({ membership: await updateSpaceMemberRole(user.id, values.id, subjectUserId, body.role as Exclude<SpaceRole, "owner">) });
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
