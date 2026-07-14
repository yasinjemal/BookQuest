import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { issueSignedOpenBadge } from "@/lib/open-badges";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
  let body: { claimVersionId?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
  if (!body.claimVersionId) return NextResponse.json({ error: "Choose a current claim" }, {
    status: 400,
    headers: { "Cache-Control": "private, no-store" },
  });
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
