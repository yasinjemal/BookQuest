import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { addSpaceTeamMember, removeSpaceTeamMember } from "@/lib/spaces";

type Context = { params: Promise<{ id: string; teamId: string; userId: string }> };

async function mutate(req: NextRequest, context: Context, remove: boolean) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const values = await context.params;
  const subjectUserId = Number(values.userId);
  if (!Number.isInteger(subjectUserId)) return NextResponse.json({ error: "Invalid member" }, { status: 400 });
  try {
    if (remove) await removeSpaceTeamMember(user.id, values.id, values.teamId, subjectUserId);
    else await addSpaceTeamMember(user.id, values.id, values.teamId, subjectUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}

export async function PUT(req: NextRequest, context: Context) {
  return mutate(req, context, false);
}

export async function DELETE(req: NextRequest, context: Context) {
  return mutate(req, context, true);
}
