import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { revokeSpaceInvitation } from "@/lib/spaces";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; invitationId: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const values = await params;
  try {
    await revokeSpaceInvitation(user.id, values.id, values.invitationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
