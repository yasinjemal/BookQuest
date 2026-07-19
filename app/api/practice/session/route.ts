import { NextRequest, NextResponse } from "next/server";
import {
  canAccessCourse,
  createPracticeSession,
  getCourse,
  getCourseMastery,
  isPremium,
  listLessons,
  listModules,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  generatePracticeQuiz,
  getGeneratorModel,
  PRACTICE_PROMPT_VERSION,
} from "@/lib/generator";
import { aiUnavailablePayload, getAiAvailability } from "@/lib/ai-provider";
import {
  AiBudgetExceededError,
  aiBudgetErrorPayload,
  aiBudgetRetryAfterSeconds,
} from "@/lib/ai-budget";
import type { Card } from "@/lib/schemas";
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
  recordOperationalEvent,
} from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 300;

interface PracticeCard {
  concept: string;
  card: QuizCard;
  questionId: string;
  lessonId: number;
  cardIndex: number;
  generatorModel: string | null;
  promptVersion: string | null;
}

/** Build a practice session for a course.
    - default: reuse the course's own quiz cards for the weakest concepts (free)
    - fresh: Claude writes brand-new questions (premium / admin) */
export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const body = (await req.json()) as { courseId: number; fresh?: boolean };
  const course = await getCourse(Number(body.courseId));
  if (!course || !(await canAccessCourse(user.id, course.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mastery = await getCourseMastery(user.id, course.id);
  const weakest = mastery.slice(0, 4).map((m) => m.concept);

  // Gather all quiz cards in the course, grouped by concept
  const allQuiz: PracticeCard[] = [];
  const conceptTexts: string[] = [];
  for (const m of await listModules(course.id)) {
    for (const l of await listLessons(m.id)) {
      const cards = JSON.parse(l.cards) as Card[];
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
        const card = cards[cardIndex];
        if (card.type.startsWith("quiz_")) {
          const concept =
            ("concept" in card && (card as { concept?: string }).concept) ||
            l.title;
          allQuiz.push({
            concept: concept.toLowerCase(),
            card: card as QuizCard,
            questionId: `lesson:${l.id}:card:${cardIndex}`,
            lessonId: l.id,
            cardIndex,
            generatorModel: l.generator_model,
            promptVersion: l.prompt_version,
          });
        } else if (card.type === "concept" || card.type === "example") {
          conceptTexts.push(`${card.title}: ${card.body}`);
        }
      }
    }
  }
  if (allQuiz.length === 0) {
    return NextResponse.json(
      { error: "This course has no quiz questions yet." },
      { status: 400 }
    );
  }

  if (body.fresh) {
    if (!(user.role === "admin" || isPremium(user))) {
      return NextResponse.json(
        {
          error: "Fresh AI questions are a Premium feature.",
          code: "premium_required",
        },
        { status: 402 }
      );
    }
    const ai = getAiAvailability();
    if (!ai.enabled) {
      return NextResponse.json(aiUnavailablePayload(ai), { status: 503 });
    }
    const generatorModel = getGeneratorModel();
    const limit = await consumeRateLimit(
      RATE_LIMITS.freshPracticeUser,
      rateLimitSubject("user", user.id)
    );
    if (!limit.allowed) return tooManyRequests(limit);
    const concepts =
      weakest.length > 0 ? weakest : allQuiz.slice(0, 4).map((q) => q.concept);
    try {
      await recordOperationalEvent({
        eventType: "ai.request",
        severity: "info",
        area: "practice.fresh",
        subjectKey: operationalSubject("user", user.id),
        metadata: { model: generatorModel, prompt_version: PRACTICE_PROMPT_VERSION },
      });
      const cards = await generatePracticeQuiz(
        course.id,
        course.title,
        concepts,
        conceptTexts.join("\n")
      );
      const items = cards
        .filter((card): card is QuizCard => card.type.startsWith("quiz_"))
        .map((card) => ({
          concept:
            ("concept" in card && (card as { concept?: string }).concept) ||
            concepts[0],
          card,
        }));
      const session = await createPracticeSession(
        user.id,
        course.id,
        items,
        true,
        {
          generatorModel,
          promptVersion: PRACTICE_PROMPT_VERSION,
        }
      );
      return NextResponse.json({
        sessionId: session.id,
        viewerId: user.id,
        fresh: true,
        cards: session.items,
      });
    } catch (err) {
      await recordOperationalError({
        eventType: "ai.failure",
        area: "practice.fresh",
        error: err,
        subjectKey: operationalSubject("user", user.id),
        metadata: { model: generatorModel },
      });
      if (err instanceof AiBudgetExceededError) {
        return NextResponse.json(aiBudgetErrorPayload(err), {
          status: 429,
          headers: { "Retry-After": String(aiBudgetRetryAfterSeconds(err)) },
        });
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Generation failed" },
        { status: 502 }
      );
    }
  }

  // Free session: weakest-concept cards first, then fill randomly
  const inWeakest = allQuiz.filter((q) =>
    weakest.some((w) => q.concept === w.toLowerCase())
  );
  const rest = allQuiz.filter((q) => !inWeakest.includes(q));
  const shuffled = [...inWeakest.sort(() => Math.random() - 0.5), ...rest.sort(() => Math.random() - 0.5)];
  const session = await createPracticeSession(
    user.id,
    course.id,
    shuffled.slice(0, 8),
    false
  );
  return NextResponse.json({
    sessionId: session.id,
    viewerId: user.id,
    fresh: false,
    cards: session.items,
  });
}
