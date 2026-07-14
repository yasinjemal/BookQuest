import { NextRequest, NextResponse } from "next/server";
import { LtiError, validateLtiLaunch } from "@/lib/lti";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'self'" };

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 128 * 1024) {
    return NextResponse.json({ error: "LTI launch unavailable" }, { status: 413, headers });
  }
  const limit = await consumeRateLimit(RATE_LIMITS.ltiLaunchIp, rateLimitSubject("ip", requestIp(req)));
  if (!limit.allowed) { const response = tooManyRequests(limit); response.headers.set("Cache-Control", "no-store"); return response; }
  let form: URLSearchParams;
  try { form = new URLSearchParams(await req.text()); }
  catch { return NextResponse.json({ error: "LTI launch unavailable" }, { status: 400, headers }); }
  try {
    const launch = await validateLtiLaunch(form.get("state") ?? "", form.get("id_token") ?? "", req.nextUrl.origin);
    return NextResponse.redirect(new URL(launch.redirectPath, req.nextUrl.origin), { status: 303, headers });
  } catch (error) {
    if (error instanceof LtiError) return NextResponse.json({ error: "LTI launch unavailable" }, { status: 401, headers });
    throw error;
  }
}
