import { NextRequest, NextResponse } from "next/server";
import { login, publicUser, startSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, password } = (await req.json()) as {
    email: string;
    password: string;
  };
  const result = await login(email ?? "", password ?? "");
  if (!result.user) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  const res = NextResponse.json({ user: publicUser(result.user) });
  await startSession(res, result.user.id);
  return res;
}
