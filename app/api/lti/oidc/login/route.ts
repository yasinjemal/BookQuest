import { NextRequest, NextResponse } from "next/server";
import { initiateLtiLogin, LtiError } from "@/lib/lti";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

async function values(req: NextRequest) {
  if (req.method === "GET") return req.nextUrl.searchParams;
  return new URLSearchParams(await req.text());
}

async function handle(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 64 * 1024) {
    return NextResponse.json({ error: "LTI login unavailable" }, { status: 413, headers });
  }
  const limit = await consumeRateLimit(RATE_LIMITS.ltiLoginIp, rateLimitSubject("ip", requestIp(req)));
  if (!limit.allowed) { const response = tooManyRequests(limit); response.headers.set("Cache-Control", "no-store"); return response; }
  try {
    const input = await values(req);
    const initiated = await initiateLtiLogin({
      issuer: input.get("iss") ?? "", loginHint: input.get("login_hint") ?? "",
      targetLinkUri: input.get("target_link_uri") ?? "", clientId: input.get("client_id") ?? undefined,
      deploymentId: input.get("lti_deployment_id") ?? undefined,
      ltiMessageHint: input.get("lti_message_hint") ?? undefined,
    }, req.nextUrl.origin);
    return NextResponse.redirect(initiated.redirectUrl, { status: 302, headers });
  } catch (error) {
    if (error instanceof LtiError) return NextResponse.json({ error: "LTI login unavailable" }, { status: 400, headers });
    throw error;
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
