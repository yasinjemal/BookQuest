import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listSpaceCompetencyClaimDisputes } from "@/lib/skill-passport";
import { skillPassportApiError } from "@/lib/skill-passport-api";
import { spaceApiError } from "@/lib/space-api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  try {
    const disputes = await listSpaceCompetencyClaimDisputes(user.id, (await params).id);
    return NextResponse.json({ disputes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const spaceResponse = spaceApiError(error);
    if (spaceResponse) return spaceResponse;
    const passportResponse = skillPassportApiError(error);
    if (passportResponse) return passportResponse;
    throw error;
  }
}
