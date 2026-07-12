import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { inviteSpaceMember } from "@/lib/spaces";
import type { SpaceRole } from "@/lib/space-authorization";

const ROLES = new Set<SpaceRole>(["administrator", "creator", "reviewer", "manager", "learner", "auditor"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as { email?: string; role?: SpaceRole };
  const invitee = body.email ? await getUserByEmail(body.email) : undefined;
  if (!invitee || !body.role || !ROLES.has(body.role)) {
    return NextResponse.json({ error: "Enter an existing account email and valid role" }, { status: 400 });
  }
  try {
    const result = await inviteSpaceMember(
      user.id,
      (await params).id,
      invitee.id,
      body.role as Exclude<SpaceRole, "owner">
    );
    return NextResponse.json({
      invitation: result.invitation,
      inviteUrl: `/spaces/invitations/accept?token=${encodeURIComponent(result.token)}`,
    }, { status: 201 });
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
