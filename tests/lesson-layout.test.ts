import { describe, expect, it } from "vitest";
import type { Card } from "../lib/schemas";
import { buildLessonMoments, lessonBlockMeta } from "../lib/lesson-layout";

const cards: Card[] = [
  { type: "concept", title: "The core signal", body: "A concise explanation." },
  { type: "example", title: "In practice", body: "A short example." },
  { type: "quiz_truefalse", statement: "The signal is visible.", answer: true, explanation: "It is visible." },
  { type: "concept", title: "A second idea", body: "Another explanation." },
  { type: "recap", title: "Remember this", points: ["First", "Second"] },
  { type: "story", title: "A field story", body: "A standalone narrative." },
];

describe("lesson editorial layout", () => {
  it("groups related reading blocks into moments that end at checks or summaries", () => {
    const moments = buildLessonMoments(cards);
    expect(moments.map((moment) => moment.entries.map((entry) => entry.cardIndex))).toEqual([
      [0, 1, 2],
      [3, 4],
      [5],
    ]);
    expect(moments.map((moment) => moment.title)).toEqual([
      "The core signal",
      "A second idea",
      "A field story",
    ]);
  });

  it("assigns semantic labels and varied widths without changing card data", () => {
    expect(lessonBlockMeta(cards[0], 0)).toEqual({ kind: "idea", label: "Key idea", size: "medium" });
    expect(lessonBlockMeta(cards[1], 1)).toEqual({ kind: "example", label: "Example", size: "compact" });
    expect(lessonBlockMeta(cards[2], 2)).toEqual({ kind: "quiz", label: "Knowledge check", size: "wide" });
    expect(lessonBlockMeta(cards[5], 5)).toEqual({ kind: "quote", label: "Story / quote", size: "wide" });
  });
});
