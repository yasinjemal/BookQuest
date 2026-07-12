import { NextRequest, NextResponse } from "next/server";
import { requireUser, verifyPassword } from "@/lib/auth";
import {
  cancelAccountDeletion,
  scheduleAccountDeletion,
  SoleAdministratorDeletionError,
} from "@/lib/privacy";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function mutationLimit(userId: number) {
  return consumeRateLimit(
    RATE_LIMITS.privacyMutationUser,
    rateLimitSubject("user", userId)
  );
}

export async function DELETE(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await mutationLimit(user.id);
  if (!limit.allowed) return tooManyRequests(limit);
  let password = "";
  try {
    password = ((await req.json()) as { password?: string }).password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 403 });
  }
  try {
    const effectiveAt = await scheduleAccountDeletion(user.id);
    return NextResponse.json({ scheduled: true, effectiveAt });
  } catch (error) {
    if (error instanceof SoleAdministratorDeletionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await mutationLimit(user.id);
  if (!limit.allowed) return tooManyRequests(limit);
  const cancelled = await cancelAccountDeletion(user.id);
  return NextResponse.json({ cancelled });
}
