import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { createPassportShare } from "@/lib/skill-passport";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.passportMutationUser,
    rateLimitSubject("user", user.id),
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let body: { claimVersionIds?: string[]; expiresAt?: string; includeLearnerName?: boolean };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!Array.isArray(body.claimVersionIds) || typeof body.expiresAt !== "string") {
    return NextResponse.json({ error: "Choose claims and an expiry" }, { status: 400 });
  }
  try {
    const share = await createPassportShare(user.id, {
      claimVersionIds: body.claimVersionIds,
      expiresAt: body.expiresAt,
      includeLearnerName: body.includeLearnerName,
    });
    return NextResponse.json({ share }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
