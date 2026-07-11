import { NextRequest, NextResponse } from "next/server";
import { enroll, getCourse } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const course = getCourse(Number(id));
  if (!course || !course.published) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // price_cents is always 0 for now; paid enrollment ships with the marketplace
  enroll(user.id, course.id);
  return NextResponse.json({ ok: true });
}
