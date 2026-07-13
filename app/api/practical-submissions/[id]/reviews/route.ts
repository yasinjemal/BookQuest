import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { reviewPracticalTask } from "@/lib/institutional";
import { institutionalApiError } from "@/lib/institutional-api";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

const DECISIONS = new Set(["approved", "changes_requested", "rejected"] as const);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as {
    decision?: "approved" | "changes_requested" | "rejected";
    rubric?: Record<string, unknown>;
    summary?: string;
  };
  if (!body.decision || !DECISIONS.has(body.decision)) return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  try {
    return NextResponse.json({ review: await reviewPracticalTask(user.id, (await params).id, {
      decision: body.decision,
      rubric: body.rubric,
      summary: body.summary,
    }) }, { status: 201 });
  } catch (error) {
    const response = institutionalApiError(error);
    if (response) return response;
    throw error;
  }
}

