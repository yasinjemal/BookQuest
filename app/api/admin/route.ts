import { NextRequest, NextResponse } from "next/server";
import { adjustCredits, listUsers, platformCounts } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return NextResponse.json({
    counts: platformCounts(),
    users: listUsers().map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      credits: u.credits,
      premium_until: u.premium_until,
      created_at: u.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await req.json()) as { userId: number; credits: number };
  adjustCredits(Number(body.userId), Math.trunc(body.credits));
  return NextResponse.json({ ok: true });
}
