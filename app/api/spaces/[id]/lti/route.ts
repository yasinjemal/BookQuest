import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createLtiRegistration, listLtiRegistrations, revokeLtiRegistration } from "@/lib/lti";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) { unauth.headers.set("Cache-Control", "private, no-store"); return unauth; }
  try { return NextResponse.json(await listLtiRegistrations(user.id, (await params).id), { headers }); }
  catch (error) { const response = spaceApiError(error); if (response) { response.headers.set("Cache-Control", "private, no-store"); return response; } throw error; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) { unauth.headers.set("Cache-Control", "private, no-store"); return unauth; }
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) { const response = tooManyRequests(limit); response.headers.set("Cache-Control", "private, no-store"); return response; }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers }); }
  const spaceId = (await params).id;
  try {
    if (body.action === "create") {
      return NextResponse.json({ registration: await createLtiRegistration(user.id, spaceId, {
        courseId: Number(body.courseId), issuer: String(body.issuer ?? ""),
        clientId: String(body.clientId ?? ""), deploymentId: String(body.deploymentId ?? ""),
        authorizationEndpoint: String(body.authorizationEndpoint ?? ""),
        tokenEndpoint: String(body.tokenEndpoint ?? ""), jwksUrl: String(body.jwksUrl ?? ""),
      }) }, { status: 201, headers });
    }
    if (body.action === "revoke") {
      return NextResponse.json({ registration: await revokeLtiRegistration(
        user.id, spaceId, String(body.registrationId ?? ""),
      ) }, { headers });
    }
    return NextResponse.json({ error: "Unsupported LTI action" }, { status: 400, headers });
  } catch (error) { const response = spaceApiError(error); if (response) { response.headers.set("Cache-Control", "private, no-store"); return response; } throw error; }
}
