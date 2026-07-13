import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  createLegalHold,
  getOrganizationPolicy,
  OrganizationPolicyError,
  publishOrganizationPolicy,
  releaseLegalHold,
} from "@/lib/organization-policies";
import { spaceApiError } from "@/lib/space-api";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

function policyError(error: unknown) {
  return spaceApiError(error) ?? (error instanceof OrganizationPolicyError
    ? NextResponse.json({ error: error.message }, { status: 409 })
    : undefined);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  try {
    return NextResponse.json({ policy: await getOrganizationPolicy(user.id, (await params).id) });
  } catch (error) {
    const response = policyError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const spaceId = (await params).id;
  const body = (await req.json()) as {
    action?: "publish" | "hold" | "release_hold";
    minimumPasswordLength?: number;
    sessionMaxDays?: number;
    requireMfaRoles?: string[];
    retentionDays?: number;
    legalHoldEnabled?: boolean;
    reason?: string;
    scope?: { type: "space" } | { type: "assignment"; assignmentId: string } | { type: "membership"; membershipId: string };
    holdId?: string;
  };
  try {
    if (body.action === "publish") return NextResponse.json({ policy: await publishOrganizationPolicy(user.id, spaceId, {
      minimumPasswordLength: Number(body.minimumPasswordLength),
      sessionMaxDays: Number(body.sessionMaxDays),
      requireMfaRoles: body.requireMfaRoles ?? [],
      retentionDays: Number(body.retentionDays),
      legalHoldEnabled: body.legalHoldEnabled === true,
    }) }, { status: 201 });
    if (body.action === "hold" && body.reason && body.scope) return NextResponse.json({ hold: await createLegalHold(user.id, spaceId, { reason: body.reason, scope: body.scope }) }, { status: 201 });
    if (body.action === "release_hold" && body.holdId && body.reason) return NextResponse.json({ hold: await releaseLegalHold(user.id, spaceId, body.holdId, body.reason) });
    return NextResponse.json({ error: "Invalid institutional policy action" }, { status: 400 });
  } catch (error) {
    const response = policyError(error);
    if (response) return response;
    throw error;
  }
}

