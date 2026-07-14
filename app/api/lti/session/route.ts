import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { completeLtiLaunch, LtiError } from "@/lib/lti";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) { unauth.headers.set("Cache-Control", "private, no-store"); return unauth; }
  let body: { ticket?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Launch unavailable" }, { status: 400, headers }); }
  try {
    return NextResponse.json({ launch: await completeLtiLaunch(user.id, String(body.ticket ?? "")) }, { headers });
  } catch (error) {
    if (error instanceof LtiError) return NextResponse.json({ error: error.message }, { status: 404, headers });
    throw error;
  }
}
