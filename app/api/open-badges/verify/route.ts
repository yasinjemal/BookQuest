import { NextRequest, NextResponse } from "next/server";
import { verifySignedOpenBadge } from "@/lib/open-badges";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(RATE_LIMITS.credentialVerifyIp, rateLimitSubject("ip", requestIp(req)));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }
  let body: { credential?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, {
    status: 400,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  }); }
  const result = body.credential ? await verifySignedOpenBadge(body.credential) : null;
  if (!result) return NextResponse.json({ error: "Signed credential not found" }, {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
}
