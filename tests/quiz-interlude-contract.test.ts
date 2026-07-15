import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("quiz interlude experience", () => {
  it("moves quiz-only moments into a dedicated learner stage", () => {
    const lesson = source("app/lesson/[id]/page.tsx");
    const layout = source("lib/lesson-layout.ts");

    expect(layout).toContain("if (isLessonQuiz(card))");
    expect(layout).toContain("Retrieval checks become their own focused interludes");
    expect(lesson).toContain("<QuizInterlude");
    expect(lesson).toContain("const quizEntry");
  });

  it("uses deliberate answer locking and restores completed answer state", () => {
    const quiz = source("components/QuizCard.tsx");
    const interlude = source("components/QuizInterlude.tsx");

    expect(quiz).toContain('variant?: QuizVariant');
    expect(quiz).toContain('answerResult?: QuizAnswerResult');
    expect(quiz).toContain("Lock answer");
    expect(quiz).toContain('role={immersive ? "radiogroup" : "group"}');
    expect(interlude).toContain('answerResult={result}');
    expect(interlude).toContain("Continue the journey");
  });

  it("includes mobile, safe-area, and reduced-motion treatment", () => {
    const css = source("components/QuizInterlude.module.css");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("@media (max-width: 44rem)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

