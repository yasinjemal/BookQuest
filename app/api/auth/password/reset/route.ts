import { NextRequest, NextResponse } from "next/server";
import { confirmPasswordReset } from "@/lib/account-security";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(
    RATE_LIMITS.resetPasswordIp,
    rateLimitSubject("ip", requestIp(req))
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let token = "";
  let password = "";
  try {
    const body = (await req.json()) as { token?: string; password?: string };
    token = body.token ?? "";
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const result = await confirmPasswordReset(token, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
