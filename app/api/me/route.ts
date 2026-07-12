import { NextRequest, NextResponse } from "next/server";
import { getUser, publicUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: publicUser(user) });
}
