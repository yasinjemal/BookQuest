import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSkillPassport } from "@/lib/skill-passport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  return NextResponse.json(await getSkillPassport(user.id), {
    headers: { "Cache-Control": "no-store" },
  });
}
