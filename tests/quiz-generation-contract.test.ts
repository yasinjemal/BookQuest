import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Card,
  GeneratedQuizMcqCard,
  ModuleLessons,
  PracticeQuiz,
} from "../lib/schemas";

const twoOptionQuestion = {
  type: "quiz_mcq" as const,
  concept: "community trust",
  question: "What builds durable trust?",
  options: ["Known local partners", "More anonymous adverts"],
  correct_index: 0,
  explanation: "Known partners bring existing relationships.",
};

const legacyFill = {
  type: "quiz_fillblank" as const,
  concept: "community trust",
  sentence: "Trusted community ___ can advocate for the platform.",
  answer: "leaders",
  accepted_answers: ["community leaders"],
  explanation: "Local leaders already hold community trust.",
};

describe("two-choice generation contract", () => {
  it("requires exactly two MCQ options and a valid answer index", () => {
    expect(GeneratedQuizMcqCard.safeParse(twoOptionQuestion).success).toBe(true);
    expect(GeneratedQuizMcqCard.safeParse({ ...twoOptionQuestion, options: ["Only one"] }).success).toBe(false);
    expect(GeneratedQuizMcqCard.safeParse({ ...twoOptionQuestion, options: ["One", "Two", "Three"] }).success).toBe(false);
    expect(GeneratedQuizMcqCard.safeParse({ ...twoOptionQuestion, correct_index: 2 }).success).toBe(false);
  });

  it("allows only two-option MCQ or true/false in newly generated output", () => {
    expect(PracticeQuiz.safeParse({ cards: [twoOptionQuestion] }).success).toBe(true);
    expect(PracticeQuiz.safeParse({ cards: [legacyFill] }).success).toBe(false);
    expect(ModuleLessons.safeParse({ lessons: [{ title: "Trust", cards: [twoOptionQuestion] }] }).success).toBe(true);
    expect(ModuleLessons.safeParse({ lessons: [{ title: "Trust", cards: [legacyFill] }] }).success).toBe(false);
  });

  it("continues reading legacy fill-in and four-option course data", () => {
    expect(Card.safeParse(legacyFill).success).toBe(true);
    expect(Card.safeParse({
      ...twoOptionQuestion,
      options: ["One", "Two", "Three", "Four"],
      correct_index: 3,
    }).success).toBe(true);
  });

  it("instructs AI and Studio creation to use the same simple formats", () => {
    const generator = readFileSync(new URL("../lib/generator.ts", import.meta.url), "utf8");
    const studio = readFileSync(new URL("../app/studio/[id]/page.tsx", import.meta.url), "utf8");
    expect(generator).toContain('COURSE_LESSON_PROMPT_VERSION = "course-lessons-v2-two-choice"');
    expect(generator).toContain("multiple choice with exactly 2");
    expect(generator).toContain("Never create fill-in");
    expect(generator).toContain("attempt <= 2");
    expect(studio).toContain('const CREATION_BLOCKS = BLOCKS.filter((item) => item.type !== "fill_in")');
    expect(studio).toContain('options: ["Correct option", "Plausible alternative"]');
  });
});
