import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { withdrawCompetencyClaimDispute } from "@/lib/skill-passport";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.passportMutationUser,
    rateLimitSubject("user", user.id),
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let body: { action?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (body.action !== "withdraw") {
    return NextResponse.json({ error: "Invalid dispute action" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      dispute: await withdrawCompetencyClaimDispute(user.id, (await params).id),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
