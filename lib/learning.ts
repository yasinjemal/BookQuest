import crypto from "crypto";
import { z } from "zod/v4";
import type { QuizAnswerValue, QuizCard } from "./learning-types";

const EventTelemetry = z.object({
  accountId: z.number().int().positive(),
  eventId: z
    .string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9:_-]+$/, "Invalid event ID"),
  answer: z.union([
    z.string().max(500),
    z.number().int(),
    z.boolean(),
    z.null(),
  ]),
  responseTimeMs: z.number().int().min(0).max(86_400_000),
  occurredAt: z
    .string()
    .max(40)
    .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp"),
  attemptNumber: z.number().int().min(1).max(100).default(1),
  hintCount: z.number().int().min(0).max(100).default(0),
});

export const AnswerSubmission = z.discriminatedUnion("source", [
  EventTelemetry.extend({
    source: z.literal("lesson"),
    sessionId: z.string().min(8).max(100),
    lessonId: z.number().int().positive(),
    cardIndex: z.number().int().min(0),
  }),
  EventTelemetry.extend({
    source: z.literal("practice"),
    sessionId: z.string().min(8).max(100),
    itemIndex: z.number().int().min(0),
  }),
  EventTelemetry.extend({
    source: z.literal("review"),
    sessionId: z.string().min(8).max(100),
    reviewId: z.number().int().positive(),
  }),
]);
export type AnswerSubmission = z.infer<typeof AnswerSubmission>;

export const MASTERY_ALGORITHM_VERSION = "ewma-v1";
export const EVIDENCE_SCHEMA_VERSION = 1;

export function normalizeFillAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/[.,!?'\"]/g, "");
}

/** Server-authoritative grading shared with tests. */
export function gradeQuizCard(card: QuizCard, answer: QuizAnswerValue): boolean {
  if (card.type === "quiz_mcq") {
    return typeof answer === "number" && answer === card.correct_index;
  }
  if (card.type === "quiz_truefalse") {
    return typeof answer === "boolean" && answer === card.answer;
  }
  if (typeof answer !== "string") return false;
  const accepted = [card.answer, ...card.accepted_answers].map(normalizeFillAnswer);
  return accepted.includes(normalizeFillAnswer(answer));
}

export function isQuizAnswerCompatible(
  card: QuizCard,
  answer: QuizAnswerValue
): boolean {
  if (answer === null) return true;
  if (card.type === "quiz_mcq") {
    return (
      typeof answer === "number" &&
      Number.isInteger(answer) &&
      answer >= 0 &&
      answer < card.options.length
    );
  }
  if (card.type === "quiz_truefalse") return typeof answer === "boolean";
  return typeof answer === "string";
}

export function normalizeConcept(concept: string): string {
  return concept.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalCard(card: QuizCard): object {
  switch (card.type) {
    case "quiz_mcq":
      return {
        type: card.type,
        concept: card.concept ?? null,
        question: card.question,
        options: card.options,
        correct_index: card.correct_index,
        explanation: card.explanation,
      };
    case "quiz_truefalse":
      return {
        type: card.type,
        concept: card.concept ?? null,
        statement: card.statement,
        answer: card.answer,
        explanation: card.explanation,
      };
    case "quiz_fillblank":
      return {
        type: card.type,
        concept: card.concept ?? null,
        sentence: card.sentence,
        answer: card.answer,
        accepted_answers: card.accepted_answers,
        explanation: card.explanation,
      };
  }
}

export interface QuestionVersionDescriptor {
  id: string;
  questionId: string;
  contentHash: string;
  contentJson: string;
}

export function describeQuestionVersion(
  questionId: string,
  card: QuizCard
): QuestionVersionDescriptor {
  const contentJson = JSON.stringify(canonicalCard(card));
  const contentHash = sha256(contentJson);
  return {
    id: sha256(`${questionId}:${contentHash}`),
    questionId,
    contentHash,
    contentJson,
  };
}

export function makeConceptId(courseId: number, concept: string): string {
  return `concept_${sha256(`${courseId}:${normalizeConcept(concept)}`).slice(0, 32)}`;
}

/**
 * Preserve useful answer signals without storing arbitrary learner-entered text.
 * Fill-in responses are hashed; option and boolean selections are safe to retain.
 */
export function answerEvidence(card: QuizCard, answer: QuizAnswerValue): string {
  if (answer === null) return JSON.stringify({ kind: "skip" });
  if (card.type === "quiz_fillblank") {
    const normalized = typeof answer === "string" ? normalizeFillAnswer(answer) : "";
    return JSON.stringify({
      kind: "hashed_text",
      sha256: sha256(normalized),
      length: normalized.length,
    });
  }
  if (card.type === "quiz_mcq") {
    return JSON.stringify({
      kind: "option_index",
      value: typeof answer === "number" ? answer : null,
    });
  }
  return JSON.stringify({
    kind: "boolean",
    value: typeof answer === "boolean" ? answer : null,
  });
}
