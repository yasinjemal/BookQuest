import { NextRequest, NextResponse } from "next/server";
import { enrollPublicCourse } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const { id } = await params;
  const courseId = Number(id);
  if (!Number.isInteger(courseId) || !(await enrollPublicCourse(user.id, courseId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // price_cents is always 0 for now; paid enrollment ships with the marketplace
  return NextResponse.json({ ok: true });
}
