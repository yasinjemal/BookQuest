import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedReadingUnit } from "@/lib/reading-editions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const values = await params;
  const editionId = Number(values.id);
  const index = Number(values.index);
  if (!Number.isInteger(editionId) || editionId <= 0 || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid reading unit" }, { status: 400 });
  }
  const unit = await getOwnedReadingUnit(editionId, user.id, index);
  if (!unit) return NextResponse.json({ error: "Reading unit not found" }, { status: 404 });
  return NextResponse.json(
    { unit },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
