import type { Card } from "./schemas";

export type QuizCard = Extract<
  Card,
  { type: "quiz_mcq" | "quiz_truefalse" | "quiz_fillblank" }
>;

export type QuizAnswerValue = number | boolean | string | null;

/** Rich client telemetry. Correctness is only advisory; the server grades again. */
export interface QuizAnswerResult {
  eventId: string;
  answer: QuizAnswerValue;
  correct: boolean;
  responseTimeMs: number;
  occurredAt: string;
  attemptNumber: number;
  hintCount: number;
}

export interface PracticeSessionItem {
  questionId: string;
  courseId?: number;
  concept: string;
  card: QuizCard;
  lessonId?: number;
  cardIndex?: number;
  generatorModel?: string | null;
  promptVersion?: string | null;
  courseVersion?: number;
}
