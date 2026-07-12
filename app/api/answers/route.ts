import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  answerReviewItem,
  db,
  EvidenceConflictError,
  getAnswerSession,
  getLearnerKey,
  getPracticeSession,
  getReviewItemForUser,
  InvalidAnswerError,
  recordAnswerEvidence,
} from "@/lib/db";
import { AnswerSubmission } from "@/lib/learning";
import type { QuizCard } from "@/lib/learning-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;

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
    const session = getAnswerSession(user.id, body.sessionId, "lesson");
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
    const session = getPracticeSession(user.id, body.sessionId);
    const item = session?.items[body.itemIndex];
    const courseId = item?.courseId ?? session?.course_id;
    if (!session || !item || !courseId) {
      return NextResponse.json({ error: "Practice session not found" }, { status: 404 });
    }
    context = {
      courseId,
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
    const session = getAnswerSession(user.id, body.sessionId, "review");
    const item = session?.items.find(
      (candidate) => candidate.reviewId === body.reviewId
    );
    if (!session || !item) {
      return NextResponse.json({ error: "Review attempt not found" }, { status: 404 });
    }
    const review = getReviewItemForUser(user.id, body.reviewId);
    const isRecordedReplay = !!db
      .prepare(
        "SELECT 1 FROM learning_events WHERE event_id = ? AND learner_key = ?"
      )
      .get(body.eventId, getLearnerKey(user.id));
    if (review && review.next_due !== item.reviewDueAt && !isRecordedReplay) {
      return NextResponse.json(
        { error: "This review attempt is stale" },
        { status: 409 }
      );
    }
    context = {
      courseId: item.courseId,
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

  try {
    const result = db.transaction(() => {
      const recorded = recordAnswerEvidence({
        ...context,
        eventId: body.eventId,
        userId: user.id,
        answer: body.answer,
        responseTimeMs: body.responseTimeMs,
        occurredAt: body.occurredAt,
        attemptNumber: 1,
        hintCount: body.hintCount,
      });

      // Keep source-specific projections in the same commit as the event. If
      // any projection fails, replay can safely insert the event again.
      if (recorded.inserted && body.source === "practice" && recorded.correct) {
        db.prepare(
          "UPDATE user_stats SET total_xp = total_xp + 2 WHERE user_id = ?"
        ).run(user.id);
      }
      if (recorded.inserted && body.source === "review") {
        answerReviewItem(user.id, body.reviewId, recorded.correct);
      }
      return recorded;
    })();

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
    if (error instanceof InvalidAnswerError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof EvidenceConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Could not record answer evidence", error);
    return NextResponse.json({ error: "Could not record answer" }, { status: 500 });
  }
}
