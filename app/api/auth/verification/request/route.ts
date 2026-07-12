import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/account-security";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  if (user.email_verified_at) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }
  const limit = await consumeRateLimit(
    RATE_LIMITS.verificationUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const delivery = await sendVerificationEmail(user.id, req.nextUrl.origin);
  return NextResponse.json({
    ok: true,
    sent: delivery.sent,
    ...(delivery.previewUrl ? { previewUrl: delivery.previewUrl } : {}),
  });
}
