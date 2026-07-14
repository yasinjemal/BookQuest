import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";
import { verifyPassportShare } from "@/lib/skill-passport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = await consumeRateLimit(
    RATE_LIMITS.passportVerifyIp,
    rateLimitSubject("ip", requestIp(req)),
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const shareLimit = await consumeRateLimit(
    RATE_LIMITS.passportVerifyShare,
    rateLimitSubject("passport-share", token),
  );
  if (!shareLimit.allowed) return tooManyRequests(shareLimit);
  const passport = await verifyPassportShare(token);
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" };
  if (!passport) return NextResponse.json({ error: "Shared passport not found" }, { status: 404, headers });
  return NextResponse.json({ passport }, { headers });
}
