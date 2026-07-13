import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { renewCredential, revokeCredential } from "@/lib/institutional";
import { institutionalApiError } from "@/lib/institutional-api";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const credentialId = (await params).id;
  const body = (await req.json()) as { action?: "revoke" | "renew"; reason?: string; expiresAt?: string };
  try {
    if (body.action === "revoke" && body.reason) return NextResponse.json({ credential: await revokeCredential(user.id, credentialId, body.reason) });
    if (body.action === "renew" && body.expiresAt) return NextResponse.json({ credential: await renewCredential(user.id, credentialId, body.expiresAt) });
    return NextResponse.json({ error: "Invalid credential action" }, { status: 400 });
  } catch (error) {
    const response = institutionalApiError(error);
    if (response) return response;
    throw error;
  }
}
