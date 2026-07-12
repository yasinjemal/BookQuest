import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { acceptSpaceInvitation } from "@/lib/spaces";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as { token?: string };
  if (!body.token) return NextResponse.json({ error: "Invitation token required" }, { status: 400 });
  try {
    return NextResponse.json(await acceptSpaceInvitation(user.id, body.token));
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
