import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getPrivacyStatus, recordConsent } from "@/lib/privacy";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  return NextResponse.json(await getPrivacyStatus(user.id));
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.privacyMutationUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let body: { purpose?: string; granted?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (
    (body.purpose !== "analytics" && body.purpose !== "product_research") ||
    typeof body.granted !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Choose an optional consent and a decision." },
      { status: 400 }
    );
  }
  const consent = await recordConsent(
    user.id,
    body.purpose,
    body.granted,
    "profile"
  );
  return NextResponse.json({ consent, status: await getPrivacyStatus(user.id) });
}
