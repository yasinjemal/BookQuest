import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createOpenBadgeDocument } from "@/lib/open-badges";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { skillPassportApiError } from "@/lib/skill-passport-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ claimVersionId: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.privacyExportUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const { claimVersionId } = await params;
  try {
    const payload = await createOpenBadgeDocument(user.id, claimVersionId, {
      includeLearnerName: req.nextUrl.searchParams.get("includeLearnerName") === "1",
    });
    return new NextResponse(JSON.stringify(payload.credential, null, 2), {
      headers: {
        "Content-Type": "application/ld+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="bookquest-open-badge-${claimVersionId}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-BookQuest-Export-Profile": payload.profile,
        "X-BookQuest-Credential-Proof": payload.proof,
      },
    });
  } catch (error) {
    const response = skillPassportApiError(error);
    if (response) return response;
    throw error;
  }
}
