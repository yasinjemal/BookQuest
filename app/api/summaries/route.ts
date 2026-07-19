import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listOwnedSummaries } from "@/lib/summary-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;

  const summaries = await listOwnedSummaries(user.id);
  return NextResponse.json({ summaries });
}
