import { NextRequest, NextResponse } from "next/server";
import { verifyCredential } from "@/lib/institutional";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limit = await consumeRateLimit(RATE_LIMITS.credentialVerifyIp, rateLimitSubject("ip", requestIp(req)));
  if (!limit.allowed) return tooManyRequests(limit);
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const credential = await verifyCredential(token);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  return NextResponse.json({ credential }, { headers: { "Cache-Control": "no-store" } });
}
