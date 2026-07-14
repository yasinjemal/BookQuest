import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { revokePassportShare, withdrawPassportShareConsent } from "@/lib/skill-passport";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.passportMutationUser,
    rateLimitSubject("user", user.id),
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let body: { action?: "revoke" | "withdraw_consent" };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  try {
    const id = (await params).id;
    if (body.action === "revoke") {
      return NextResponse.json({ share: await revokePassportShare(user.id, id) });
    }
    if (body.action === "withdraw_consent") {
      return NextResponse.json({ share: await withdrawPassportShareConsent(user.id, id) });
    }
    return NextResponse.json({ error: "Invalid share action" }, { status: 400 });
  } catch (error) {
    const response = skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
