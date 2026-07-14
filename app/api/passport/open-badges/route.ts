import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { issueSignedOpenBadge } from "@/lib/open-badges";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.passportMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  let body: { claimVersionId?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body.claimVersionId) return NextResponse.json({ error: "Choose a current claim" }, { status: 400 });
  try {
    return NextResponse.json({ credential: await issueSignedOpenBadge(user.id, body.claimVersionId, req.nextUrl.origin) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
