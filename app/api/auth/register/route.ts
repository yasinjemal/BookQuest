import { NextRequest, NextResponse } from "next/server";
import { publicUser, register, startSession } from "@/lib/auth";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ipLimit = await consumeRateLimit(
    RATE_LIMITS.registerIp,
    rateLimitSubject("ip", requestIp(req))
  );
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  let email = "";
  let name = "";
  let password = "";
  try {
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
    };
    email = body.email ?? "";
    name = body.name ?? "";
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const accountLimit = await consumeRateLimit(
    RATE_LIMITS.registerAccount,
    rateLimitSubject("email", email || "missing")
  );
  if (!accountLimit.allowed) return tooManyRequests(accountLimit);

  const result = await register(email ?? "", name ?? "", password ?? "");
  if (!result.user) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const res = NextResponse.json({ user: publicUser(result.user) });
  await startSession(res, result.user.id);
  return res;
}
