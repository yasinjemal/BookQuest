import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  addStatsXp,
  answerReviewItem,
  CourseParticipationRevokedError,
  EvidenceConflictError,
  getAnswerSession,
  getPracticeSession,
  getReviewItemForUser,
  InvalidAnswerError,
  isEventRecordedForUser,
  recordAnswerEvidence,
} from "@/lib/db";
import { AnswerSubmission } from "@/lib/learning";
import type { QuizCard } from "@/lib/learning-types";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  operationalSubject,
  recordOperationalError,
} from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;

  const limit = await consumeRateLimit(
    RATE_LIMITS.answerUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = AnswerSubmission.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid answer", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const body = parsed.data;
  if (body.accountId !== user.id) {
    return NextResponse.json(
      { error: "This queued answer belongs to a different account." },
      { status: 403 }
    );
  }
  let context:
    | {
        courseId: number;
        courseVersion?: number;
        lessonId?: number;
        cardIndex?: number;
        questionId: string;
        concept: string;
        card: QuizCard;
        sessionKind: "lesson" | "practice" | "review";
        sessionId?: string;
        generatorModel?: string | null;
        promptVersion?: string | null;
      }
    | undefined;

  if (body.source === "lesson") {
    const session = await getAnswerSession(user.id, body.sessionId, "lesson");
    const item = session?.items.find(
      (candidate) =>
        candidate.lessonId === body.lessonId &&
        candidate.cardIndex === body.cardIndex
    );
    if (!session || !item) {
      return NextResponse.json({ error: "Lesson attempt not found" }, { status: 404 });
    }
    context = {
      courseId: item.courseId,
      courseVersion: item.courseVersion,
      lessonId: item.lessonId,
      cardIndex: item.cardIndex,
      questionId: item.questionId,
      concept: item.concept,
      card: item.card,
      sessionKind: "lesson",
      sessionId: session.id,
      generatorModel: item.generatorModel,
      promptVersion: item.promptVersion,
    };
  } else if (body.source === "practice") {
    const session = await getPracticeSession(user.id, body.sessionId);
    const item = session?.items[body.itemIndex];
    const courseId = item?.courseId ?? session?.course_id;
    if (!session || !item || !courseId) {
      return NextResponse.json({ error: "Practice session not found" }, { status: 404 });
    }
    context = {
      courseId,
      courseVersion: item.courseVersion,
      lessonId: item.lessonId,
      cardIndex: item.cardIndex,
      questionId: item.questionId,
      concept: item.concept,
      card: item.card,
      sessionKind: "practice",
      sessionId: session.id,
      generatorModel: item.generatorModel ?? session.generator_model,
      promptVersion: item.promptVersion ?? session.prompt_version,
    };
  } else {
    const session = await getAnswerSession(user.id, body.sessionId, "review");
    const item = session?.items.find(
      (candidate) => candidate.reviewId === body.reviewId
    );
    if (!session || !item) {
      return NextResponse.json({ error: "Review attempt not found" }, { status: 404 });
    }
    const review = await getReviewItemForUser(user.id, body.reviewId);
    const isRecordedReplay = await isEventRecordedForUser(user.id, body.eventId);
    if (review && review.next_due !== item.reviewDueAt && !isRecordedReplay) {
      return NextResponse.json(
        { error: "This review attempt is stale" },
        { status: 409 }
      );
    }
    context = {
      courseId: item.courseId,
      courseVersion: item.courseVersion,
      lessonId: item.lessonId,
      cardIndex: item.cardIndex,
      questionId: item.questionId,
      concept: item.concept,
      card: item.card,
      sessionKind: "review",
      sessionId: session.id,
      generatorModel: item.generatorModel,
      promptVersion: item.promptVersion,
    };
  }

  const reviewId = body.source === "review" ? body.reviewId : undefined;
  try {
    // The `project` callback runs inside recordAnswerEvidence's transaction and
    // only when a new event is inserted, keeping source-specific projections in
    // the same commit as the event.
    const result = await recordAnswerEvidence(
      {
        ...context,
        eventId: body.eventId,
        userId: user.id,
        answer: body.answer,
        responseTimeMs: body.responseTimeMs,
        occurredAt: body.occurredAt,
        attemptNumber: 1,
        hintCount: body.hintCount,
      },
      async (client, recorded) => {
        if (body.source === "practice" && recorded.correct) {
          await addStatsXp(user.id, 2, client);
        }
        if (body.source === "review" && reviewId !== undefined) {
          await answerReviewItem(user.id, reviewId, recorded.correct, client);
        }
      }
    );

    return NextResponse.json({
      ok: true,
      duplicate: !result.inserted,
      eventId: result.eventId,
      correct: result.correct,
      mastery: {
        before: result.masteryBefore,
        after: result.masteryAfter,
        algorithm: "ewma-v1",
      },
      questionVersionId: result.questionVersionId,
    });
  } catch (error) {
    if (error instanceof CourseParticipationRevokedError) {
      return NextResponse.json(
        { error: "Course access is no longer available" },
        { status: 403 }
      );
    }
    if (error instanceof InvalidAnswerError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof EvidenceConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Could not record answer evidence", error);
    await recordOperationalError({
      eventType: "learning.answer_failed",
      area: "learning.answers",
      error,
      subjectKey: operationalSubject("user", user.id),
      metadata: { answer_source: body.source },
    });
    return NextResponse.json({ error: "Could not record answer" }, { status: 500 });
  }
}
