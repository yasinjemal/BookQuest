import { NextRequest, NextResponse } from "next/server";
import {
  createReviewAnswerSession,
  getDueReviewItems,
  getLesson,
  type AnswerSessionItem,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Card } from "@/lib/schemas";
import type { QuizCard } from "@/lib/learning-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const due = getDueReviewItems(user.id);
  const sessionItems: AnswerSessionItem[] = [];
  const items = due
    .map((item) => {
      const lesson = getLesson(item.lesson_id);
      if (!lesson) return null;
      const cards = JSON.parse(lesson.cards) as Card[];
      const card = cards[item.card_index];
      if (!card || !card.type.startsWith("quiz_")) return null;
      const quizCard = card as QuizCard;
      sessionItems.push({
        courseId: lesson.course_id,
        lessonId: lesson.id,
        cardIndex: item.card_index,
        questionId: `lesson:${lesson.id}:card:${item.card_index}`,
        concept: quizCard.concept || lesson.title,
        card: quizCard,
        generatorModel: lesson.generator_model,
        promptVersion: lesson.prompt_version,
        reviewId: item.id,
        reviewDueAt: item.next_due,
      });
      return { reviewId: item.id, lessonTitle: lesson.title, card };
    })
    .filter(Boolean);
  const answerSession =
    sessionItems.length > 0
      ? createReviewAnswerSession(user.id, sessionItems)
      : undefined;
  return NextResponse.json({
    items,
    answerSessionId: answerSession?.id,
    viewerId: user.id,
  });
}

export async function POST() {
  return NextResponse.json(
    { error: "This answer endpoint has moved. Reload BookQuest and try again." },
    { status: 410 }
  );
}
