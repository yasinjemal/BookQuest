import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/account-security";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const GENERIC_MESSAGE =
  "If an account exists for that email, a password reset link has been sent.";

export async function POST(req: NextRequest) {
  const ipLimit = await consumeRateLimit(
    RATE_LIMITS.forgotPasswordIp,
    rateLimitSubject("ip", requestIp(req))
  );
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);
  let email = "";
  try {
    const body = (await req.json()) as { email?: string };
    email = body.email?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const accountLimit = await consumeRateLimit(
    RATE_LIMITS.forgotPasswordAccount,
    rateLimitSubject("email", email || "missing")
  );
  if (!accountLimit.allowed) return tooManyRequests(accountLimit);
  const result = await requestPasswordReset(email, req.nextUrl.origin);
  return NextResponse.json({
    ok: true,
    message: GENERIC_MESSAGE,
    ...(result.previewUrl ? { previewUrl: result.previewUrl } : {}),
  });
}
