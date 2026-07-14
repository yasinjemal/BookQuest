import { NextRequest, NextResponse } from "next/server";
import { openBadgeStatus } from "@/lib/open-badges";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limit = await consumeRateLimit(RATE_LIMITS.credentialVerifyIp, rateLimitSubject("ip", requestIp(req)));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }
  const status = await openBadgeStatus((await params).token);
  if (!status) return NextResponse.json({ error: "Credential status not found" }, {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
}
