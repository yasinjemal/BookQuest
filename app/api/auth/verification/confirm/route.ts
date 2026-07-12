import { NextRequest, NextResponse } from "next/server";
import { confirmEmailToken } from "@/lib/account-security";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limit = await consumeRateLimit(
    RATE_LIMITS.verificationConfirmIp,
    rateLimitSubject("ip", requestIp(req))
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const verified = await confirmEmailToken(token);
  const destination = new URL("/verify-email", req.nextUrl.origin);
  destination.searchParams.set(verified ? "verified" : "error", "1");
  return NextResponse.redirect(destination, 303);
}
