import { NextRequest, NextResponse } from "next/server";
import { publicUser, startSession } from "@/lib/auth";
import { getUserById } from "@/lib/db";
import { consumeLoginMfaChallenge, MfaError } from "@/lib/mfa";
import { getUserAuthenticationPolicy } from "@/lib/organization-policies";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(RATE_LIMITS.mfaChallengeIp, rateLimitSubject("ip", requestIp(req)));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as { challengeToken?: string; code?: string };
  if (!body.challengeToken || !body.code) return NextResponse.json({ error: "Challenge and code are required" }, { status: 400 });
  try {
    const verified = await consumeLoginMfaChallenge(body.challengeToken, body.code);
    const user = await getUserById(verified.userId);
    if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const policy = await getUserAuthenticationPolicy(user.id);
    const response = NextResponse.json({ user: publicUser(user) });
    await startSession(response, user.id, policy.sessionMaxDays);
    return response;
  } catch (error) {
    if (error instanceof MfaError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
}

