import { describe, expect, it } from "vitest";
import {
  AnswerSubmission,
  answerEvidence,
  describeQuestionVersion,
  gradeQuizCard,
  isQuizAnswerCompatible,
  normalizeFillAnswer,
} from "../lib/learning";
import type { QuizCard } from "../lib/learning-types";

const mcq: QuizCard = {
  type: "quiz_mcq",
  concept: "cash flow",
  question: "Which item is cash entering a business?",
  options: ["Rent paid", "Customer payment", "Tax paid", "Loan repayment"],
  correct_index: 1,
  explanation: "A customer payment brings cash into the business.",
};

describe("server grading", () => {
  it("grades MCQ and literal false answers without truthiness bugs", () => {
    expect(gradeQuizCard(mcq, 1)).toBe(true);
    expect(gradeQuizCard(mcq, 0)).toBe(false);
    expect(isQuizAnswerCompatible(mcq, "arbitrary text")).toBe(false);
    expect(answerEvidence(mcq, "arbitrary text")).not.toContain("arbitrary text");

    const card: QuizCard = {
      type: "quiz_truefalse",
      concept: "working capital",
      statement: "Working capital is always negative.",
      answer: false,
      explanation: "It may be positive or negative.",
    };
    expect(gradeQuizCard(card, false)).toBe(true);
    expect(gradeQuizCard(card, true)).toBe(false);
  });

  it("normalizes accepted fill-in answers", () => {
    const card: QuizCard = {
      type: "quiz_fillblank",
      concept: "assets",
      sentence: "Cash is an ___.",
      answer: "asset",
      accepted_answers: ["an asset"],
      explanation: "Cash is controlled economic value.",
    };
    expect(normalizeFillAnswer(" Asset! ")).toBe("asset");
    expect(gradeQuizCard(card, "ASSET.")).toBe(true);
    expect(gradeQuizCard(card, "liability")).toBe(false);

    const evidence = answerEvidence(card, "sensitive free text");
    expect(evidence).toContain("hashed_text");
    expect(evidence).not.toContain("sensitive free text");
  });
});

describe("question version identity", () => {
  it("is stable for identical content and changes when content changes", () => {
    const first = describeQuestionVersion("lesson:1:card:2", mcq);
    const again = describeQuestionVersion("lesson:1:card:2", { ...mcq });
    const edited = describeQuestionVersion("lesson:1:card:2", {
      ...mcq,
      explanation: "Edited explanation.",
    });
    expect(again.id).toBe(first.id);
    expect(edited.id).not.toBe(first.id);
  });
});

describe("answer input validation", () => {
  it("accepts a bounded valid lesson event", () => {
    expect(
      AnswerSubmission.safeParse({
        source: "lesson",
        accountId: 1,
        sessionId: "lesson_session_123",
        lessonId: 1,
        cardIndex: 2,
        eventId: "event_123456",
        answer: 1,
        responseTimeMs: 2500,
        occurredAt: new Date().toISOString(),
      }).success
    ).toBe(true);
  });

  it("rejects malformed IDs, timings, and timestamps", () => {
    expect(
      AnswerSubmission.safeParse({
        source: "lesson",
        accountId: 1,
        sessionId: "lesson_session_123",
        lessonId: 1,
        cardIndex: 2,
        eventId: "bad id",
        answer: 1,
        responseTimeMs: -1,
        occurredAt: "yesterday",
      }).success
    ).toBe(false);
  });
});
