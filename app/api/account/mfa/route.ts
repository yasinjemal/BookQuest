import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { beginTotpEnrollment, confirmTotpEnrollment, disableTotp, hasActiveMfa, MfaError } from "@/lib/mfa";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  return NextResponse.json({ active: await hasActiveMfa(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.mfaUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as { action?: "begin" | "confirm" | "disable"; code?: string };
  try {
    if (body.action === "begin") return NextResponse.json(await beginTotpEnrollment(user.id, user.email), { headers: { "Cache-Control": "no-store" } });
    if (body.action === "confirm" && body.code) return NextResponse.json(await confirmTotpEnrollment(user.id, body.code), { headers: { "Cache-Control": "no-store" } });
    if (body.action === "disable" && body.code) return NextResponse.json(await disableTotp(user.id, body.code));
    return NextResponse.json({ error: "Invalid MFA action" }, { status: 400 });
  } catch (error) {
    if (error instanceof MfaError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
