import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createCompletionRuleVersion, listCompletionRuleVersions } from "@/lib/institutional";
import { institutionalApiError } from "@/lib/institutional-api";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const courseIdValue = req.nextUrl.searchParams.get("courseId");
  const courseId = courseIdValue ? Number(courseIdValue) : undefined;
  if (courseId !== undefined && !Number.isInteger(courseId)) return NextResponse.json({ error: "Invalid course" }, { status: 400 });
  try {
    return NextResponse.json({ rules: await listCompletionRuleVersions(user.id, (await params).id, courseId) });
  } catch (error) {
    const response = institutionalApiError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.spaceMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as {
    courseId?: number;
    requiredLessons?: "all" | string[];
    minimumScorePercent?: number;
    requiredAttestationLineageIds?: string[];
    requiredPracticalReviewLineageIds?: string[];
    credential?: { enabled: boolean; expiresAfterDays?: number | null };
  };
  const courseId = Number(body.courseId);
  if (!Number.isInteger(courseId) || (body.requiredLessons !== "all" && !Array.isArray(body.requiredLessons))) {
    return NextResponse.json({ error: "Invalid completion rule" }, { status: 400 });
  }
  try {
    const rule = await createCompletionRuleVersion(user.id, (await params).id, courseId, {
      requiredLessons: body.requiredLessons,
      minimumScorePercent: Number(body.minimumScorePercent ?? 0),
      requiredAttestationLineageIds: body.requiredAttestationLineageIds ?? [],
      requiredPracticalReviewLineageIds: body.requiredPracticalReviewLineageIds ?? [],
      credential: body.credential,
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    const response = institutionalApiError(error);
    if (response) return response;
    throw error;
  }
}
