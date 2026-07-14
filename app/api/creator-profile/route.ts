import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCreatorProfile, PublicProductError, updateCreatorProfile } from "@/lib/public-product";

export async function GET(request: NextRequest) {
  const [user, unauth] = await requireUser(request); if (!user) return unauth;
  return NextResponse.json({ profile: await getCreatorProfile(user.id) });
}
export async function PATCH(request: NextRequest) {
  const [user, unauth] = await requireUser(request); if (!user) return unauth;
  try { return NextResponse.json({ profile: await updateCreatorProfile(user.id, await request.json()) }); }
  catch (error) { if (error instanceof PublicProductError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
}
