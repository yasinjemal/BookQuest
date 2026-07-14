import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rotateOpenBadgeIssuerKey } from "@/lib/open-badges";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  try {
    return NextResponse.json({ key: await rotateOpenBadgeIssuerKey(user.id, (await params).id) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = spaceApiError(error) ?? skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
