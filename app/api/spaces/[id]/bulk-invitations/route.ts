import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { bulkInviteSpaceMembers } from "@/lib/spaces";
import { spaceApiError } from "@/lib/space-api";
import type { SpaceRole } from "@/lib/space-authorization";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as {
    entries?: Array<{ email?: string; role?: Exclude<SpaceRole, "owner"> }>;
    expiresAt?: string;
  };
  if (!Array.isArray(body.entries)) return NextResponse.json({ error: "Entries are required" }, { status: 400 });
  try {
    const invitations = await bulkInviteSpaceMembers(
      user.id,
      (await params).id,
      body.entries.map((entry) => ({ email: entry.email ?? "", role: entry.role ?? "learner" })),
      body.expiresAt
    );
    return NextResponse.json({ invitations: invitations.map((item) => ({
      email: item.email,
      role: item.invitation.role,
      expiresAt: item.invitation.expires_at,
      inviteUrl: `/spaces/invitations/accept?token=${encodeURIComponent(item.token)}`,
    })) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}

