import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { resolveCompetencyClaimDispute } from "@/lib/skill-passport";
import { skillPassportApiError } from "@/lib/skill-passport-api";
import { spaceApiError } from "@/lib/space-api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; disputeId: string }> },
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.passportMutationUser,
    rateLimitSubject("user", user.id),
  );
  if (!limit.allowed) return tooManyRequests(limit);
  let body: {
    decision?: "accepted" | "rejected";
    resolutionCode?: "corrected_with_replacement" | "evidence_confirmed" | "insufficient_information";
    replacementCredentialId?: string;
  };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body.decision || !body.resolutionCode) {
    return NextResponse.json({ error: "Choose a resolution" }, { status: 400 });
  }
  const routeParams = await params;
  try {
    const dispute = await resolveCompetencyClaimDispute(
      user.id,
      routeParams.id,
      routeParams.disputeId,
      {
        decision: body.decision,
        resolutionCode: body.resolutionCode,
        replacementCredentialId: body.replacementCredentialId,
      },
    );
    return NextResponse.json({ dispute }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const spaceResponse = spaceApiError(error);
    if (spaceResponse) return spaceResponse;
    const passportResponse = skillPassportApiError(error);
    if (passportResponse) return passportResponse;
    throw error;
  }
}
