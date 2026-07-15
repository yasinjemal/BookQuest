import { describe, expect, it } from "vitest";
import type { Card } from "../lib/schemas";
import { buildLessonMoments, lessonBlockMeta, lessonBlockPurpose, lessonMomentGuidance } from "../lib/lesson-layout";

const cards: Card[] = [
  { type: "concept", title: "The core signal", body: "A concise explanation." },
  { type: "example", title: "In practice", body: "A short example." },
  { type: "quiz_truefalse", statement: "The signal is visible.", answer: true, explanation: "It is visible." },
  { type: "concept", title: "A second idea", body: "Another explanation." },
  { type: "recap", title: "Remember this", points: ["First", "Second"] },
  { type: "story", title: "A field story", body: "A standalone narrative." },
];

describe("lesson editorial layout", () => {
  it("keeps retrieval checks in their own moments, away from the source cards", () => {
    const moments = buildLessonMoments(cards);
    expect(moments.map((moment) => moment.entries.map((entry) => entry.cardIndex))).toEqual([
      [0, 1],
      [2],
      [3, 4],
      [5],
    ]);
    expect(moments.map((moment) => moment.title)).toEqual([
      "The core signal",
      "The signal is visible.",
      "A second idea",
      "A field story",
    ]);
  });

  it("assigns semantic labels and varied widths without changing card data", () => {
    expect(lessonBlockMeta(cards[0], 0)).toEqual({ kind: "idea", label: "Key idea", size: "medium", importance: "core", density: "balanced" });
    expect(lessonBlockMeta(cards[1], 1)).toEqual({ kind: "example", label: "Example", size: "compact", importance: "supporting", density: "compact" });
    expect(lessonBlockMeta(cards[2], 2)).toEqual({ kind: "quiz", label: "Knowledge check", size: "wide", importance: "critical", density: "immersive" });
    expect(lessonBlockMeta(cards[5], 5)).toEqual({ kind: "quote", label: "Story / quote", size: "wide", importance: "supporting", density: "immersive" });
  });

  it("uses explicit editorial intent instead of deriving treatment from position", () => {
    const explicit: Card = { type: "concept", title: "A creator aside", body: "Useful context.", intent: "creator-note", importance: "supporting", density: "compact" };
    expect(lessonBlockMeta(explicit, 99)).toEqual({ kind: "creator-note", label: "Creator note", size: "compact", importance: "supporting", density: "compact" });
    expect(lessonBlockPurpose("creator-note")).toBe("From the creator");
    expect(lessonMomentGuidance(buildLessonMoments([cards[0], cards[2]])[1])).toBe("Retrieve the idea before moving on.");
  });
});
