import { NextRequest, NextResponse } from "next/server";
import { publicUser, register, startSession } from "@/lib/auth";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/account-security";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ipLimit = await consumeRateLimit(
    RATE_LIMITS.registerIp,
    rateLimitSubject("ip", requestIp(req))
  );
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  let email = "";
  let name = "";
  let password = "";
  let acceptedServiceTerms = false;
  try {
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
      acceptedServiceTerms?: boolean;
    };
    email = body.email ?? "";
    name = body.name ?? "";
    password = body.password ?? "";
    acceptedServiceTerms = body.acceptedServiceTerms === true;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const accountLimit = await consumeRateLimit(
    RATE_LIMITS.registerAccount,
    rateLimitSubject("email", email || "missing")
  );
  if (!accountLimit.allowed) return tooManyRequests(accountLimit);

  const result = await register(
    email ?? "",
    name ?? "",
    password ?? "",
    acceptedServiceTerms
  );
  if (!result.user) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const verification = await sendVerificationEmail(result.user.id, req.nextUrl.origin);
  const responseBody = {
    user: publicUser(result.user),
    verificationSent: verification.sent,
    ...(verification.previewUrl ? { previewUrl: verification.previewUrl } : {}),
  };
  const resWithVerification = NextResponse.json(responseBody);
  await startSession(resWithVerification, result.user.id);
  return resWithVerification;
}
