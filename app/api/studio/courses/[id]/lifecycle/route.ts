import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";
import {
  addCourseVersionComment,
  archiveCourseDraftVersion,
  branchPublishedCourseVersion,
  reviewCourseVersion,
  resolveCourseVersionComment,
  submitCourseVersionForReview,
  type CourseReviewDecision,
} from "@/lib/studio";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const courseId = Number((await params).id);
  if (!Number.isInteger(courseId)) return NextResponse.json({ error: "Invalid course" }, { status: 400 });
  const body = (await req.json()) as {
    action?: "submit" | "review" | "comment" | "resolve_comment" | "branch" | "archive";
    decision?: CourseReviewDecision;
    summary?: string;
    checklist?: Record<string, unknown>;
    comment?: string;
    blockLineageId?: string | null;
    commentId?: string;
    versionId?: string;
  };
  try {
    if (body.action === "submit") {
      return NextResponse.json(await submitCourseVersionForReview(user.id, courseId));
    }
    if (body.action === "review" && body.decision) {
      return NextResponse.json(await reviewCourseVersion(user.id, courseId, {
        decision: body.decision,
        summary: body.summary,
        checklist: body.checklist,
      }));
    }
    if (body.action === "comment" && body.comment) {
      return NextResponse.json({ comment: await addCourseVersionComment(user.id, courseId, {
        body: body.comment,
        blockLineageId: body.blockLineageId,
      }) }, { status: 201 });
    }
    if (body.action === "resolve_comment" && body.commentId) {
      return NextResponse.json({
        comment: await resolveCourseVersionComment(user.id, courseId, body.commentId),
      });
    }
    if (body.action === "branch") {
      return NextResponse.json(
        await branchPublishedCourseVersion(user.id, courseId, body.versionId),
        { status: 201 }
      );
    }
    if (body.action === "archive") {
      return NextResponse.json(await archiveCourseDraftVersion(user.id, courseId));
    }
    return NextResponse.json({ error: "Invalid lifecycle action" }, { status: 400 });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
