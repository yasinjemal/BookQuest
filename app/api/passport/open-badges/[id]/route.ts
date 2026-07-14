import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { revokeSignedOpenBadge } from "@/lib/open-badges";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  const limit = await consumeRateLimit(RATE_LIMITS.passportMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  try {
    return NextResponse.json({ credential: await revokeSignedOpenBadge(user.id, (await params).id) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
