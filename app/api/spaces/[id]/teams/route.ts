import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { createSpaceTeam } from "@/lib/spaces";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as { name?: string };
  if (!body.name) return NextResponse.json({ error: "Team name required" }, { status: 400 });
  try {
    return NextResponse.json({ team: await createSpaceTeam(user.id, (await params).id, body.name) }, { status: 201 });
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
