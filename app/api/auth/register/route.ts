import { NextRequest, NextResponse } from "next/server";
import { publicUser, register, startSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, name, password } = (await req.json()) as {
    email: string;
    name: string;
    password: string;
  };
  const result = register(email ?? "", name ?? "", password ?? "");
  if (!result.user) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const res = NextResponse.json({ user: publicUser(result.user) });
  startSession(res, result.user.id);
  return res;
}
