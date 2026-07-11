import { NextRequest, NextResponse } from "next/server";
import { answerReviewItem, getDueReviewItems, getLesson } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Card } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const due = getDueReviewItems(user.id);
  const items = due
    .map((item) => {
      const lesson = getLesson(item.lesson_id);
      if (!lesson) return null;
      const cards = JSON.parse(lesson.cards) as Card[];
      const card = cards[item.card_index];
      if (!card || !card.type.startsWith("quiz_")) return null;
      return { reviewId: item.id, lessonTitle: lesson.title, card };
    })
    .filter(Boolean);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
  const body = (await req.json()) as { reviewId: number; correct: boolean };
  answerReviewItem(user.id, body.reviewId, !!body.correct);
  return NextResponse.json({ ok: true });
}
