import { describe, expect, it } from "vitest";
import type { QuizCard } from "../lib/learning-types";
import {
  FILL_BLANK_CLUE_CHOICE,
  fillBlankChoiceOptions,
  isAcceptedFillBlankAnswer,
} from "../lib/quiz-presentation";

const fillCard: Extract<QuizCard, { type: "quiz_fillblank" }> = {
  type: "quiz_fillblank",
  concept: "community trust",
  sentence: "Trusted community ___ can advocate for the platform.",
  answer: "leaders",
  accepted_answers: ["community leaders"],
  explanation: "Local leaders already hold community trust.",
};

describe("two-choice presentation for legacy fill-in cards", () => {
  it("keeps accepted answers tolerant of case and punctuation", () => {
    expect(isAcceptedFillBlankAnswer(fillCard, "LEADERS!")).toBe(true);
    expect(isAcceptedFillBlankAnswer(fillCard, "community leaders")).toBe(true);
    expect(isAcceptedFillBlankAnswer(fillCard, "observers")).toBe(false);
  });

  it("offers an honest clue path when an old card has no distractor", () => {
    const choices = fillBlankChoiceOptions(fillCard);
    expect(choices).toHaveLength(2);
    expect(choices).toContain("leaders");
    expect(choices).toContain(FILL_BLANK_CLUE_CHOICE);
    expect(fillBlankChoiceOptions(fillCard)).toEqual(choices);

    const unusualCard = { ...fillCard, answer: FILL_BLANK_CLUE_CHOICE, accepted_answers: [] };
    expect(fillBlankChoiceOptions(unusualCard)).toContain("Show me the answer");
  });
});
