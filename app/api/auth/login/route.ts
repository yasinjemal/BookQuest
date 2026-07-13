import { NextRequest, NextResponse } from "next/server";
import { login, publicUser, startSession } from "@/lib/auth";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { createLoginMfaChallenge, hasActiveMfa } from "@/lib/mfa";
import { getUserAuthenticationPolicy } from "@/lib/organization-policies";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ipLimit = await consumeRateLimit(
    RATE_LIMITS.loginIp,
    rateLimitSubject("ip", requestIp(req))
  );
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    email = body.email ?? "";
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const accountLimit = await consumeRateLimit(
    RATE_LIMITS.loginAccount,
    rateLimitSubject("email", email || "missing")
  );
  if (!accountLimit.allowed) return tooManyRequests(accountLimit);

  const result = await login(email ?? "", password ?? "");
  if (!result.user) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  const policy = await getUserAuthenticationPolicy(result.user.id);
  if (await hasActiveMfa(result.user.id)) {
    return NextResponse.json({
      mfaRequired: true,
      challengeToken: await createLoginMfaChallenge(result.user.id),
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  if (policy.requireMfa) {
    return NextResponse.json({ error: "MFA enrollment is required by your organization" }, { status: 403 });
  }
  const res = NextResponse.json({ user: publicUser(result.user) });
  await startSession(res, result.user.id, policy.sessionMaxDays);
  return res;
}
