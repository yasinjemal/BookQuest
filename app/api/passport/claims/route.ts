import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { createCompetencyClaim } from "@/lib/skill-passport";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.passportMutationUser,
    rateLimitSubject("user", user.id),
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let body: { credentialId?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body.credentialId) return NextResponse.json({ error: "Choose an eligible credential" }, { status: 400 });
  try {
    return NextResponse.json({ claim: await createCompetencyClaim(user.id, body.credentialId) });
  } catch (error) {
    const response = skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
