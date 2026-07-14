import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { createCompetencyClaimDispute } from "@/lib/skill-passport";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.passportMutationUser,
    rateLimitSubject("user", user.id),
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let body: { claimVersionId?: string; category?: string; statement?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body.claimVersionId || !body.category || typeof body.statement !== "string") {
    return NextResponse.json({ error: "Choose a claim, category and explanation" }, { status: 400 });
  }
  try {
    const dispute = await createCompetencyClaimDispute(user.id, {
      claimVersionId: body.claimVersionId,
      category: body.category,
      statement: body.statement,
    });
    return NextResponse.json({ dispute }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
