import { describe, expect, it } from "vitest";
import {
  parseReadingDisplayBlocks,
  readingBookProgress,
  readingUnitProgress,
  reconcileReadingProgress,
  remainingReadingMinutes,
} from "../lib/reading-content";

describe("Lumen reading blocks", () => {
  it("preserves source words while identifying conservative block semantics", () => {
    const blocks = parseReadingDisplayBlocks([
      "A first paragraph with the original words.",
      "## A source heading",
      "1. First step\n2) Second step",
      "> A quoted line\n> kept intact",
    ].join("\n\n"));

    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "heading", "list", "quote"]);
    expect(blocks[1]).toMatchObject({ text: "A source heading", headingLevel: 3 });
    expect(blocks[2]).toMatchObject({ ordered: true, items: ["First step", "Second step"] });
    expect(blocks[3].text).toBe("A quoted line\nkept intact");
    expect(blocks.every((block) => block.signal >= .2 && block.signal <= .92)).toBe(true);
  });

  it("creates stable anchors across newline styles and content appended later", () => {
    const original = parseReadingDisplayBlocks("First idea.\r\n\r\nSecond idea.");
    const normalized = parseReadingDisplayBlocks("First idea.\n\nSecond idea.");
    const extended = parseReadingDisplayBlocks("First idea.\n\nSecond idea.\n\nThird idea.");

    expect(normalized.map((block) => block.id)).toEqual(original.map((block) => block.id));
    expect(extended.slice(0, 2).map((block) => block.id)).toEqual(original.map((block) => block.id));
  });

  it("keeps repeated passages uniquely addressable", () => {
    const blocks = parseReadingDisplayBlocks("A refrain.\n\nA refrain.\n\nA refrain.");
    expect(new Set(blocks.map((block) => block.id)).size).toBe(3);
  });

  it("creates useful passages for long PDF-style pages without blank lines", () => {
    const sentence = "A complete sentence keeps every original word and punctuation mark. ";
    const source = sentence.repeat(34).trim();
    const blocks = parseReadingDisplayBlocks(source);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.wordCount <= 130)).toBe(true);
    expect(blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ")).toBe(source.replace(/\s+/g, " "));
  });

  it("bounds an unusually long sentence even when shorter sentences follow it", () => {
    const longSentence = `${Array.from({ length: 220 }, () => "word").join(" ")}.`;
    const source = `${longSentence} A short sentence follows.`;
    const blocks = parseReadingDisplayBlocks(source);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.wordCount <= 130)).toBe(true);
    expect(blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ")).toBe(source);
  });

  it("estimates time remaining from the active passage", () => {
    const paragraph = Array.from({ length: 100 }, () => "word").join(" ");
    const blocks = parseReadingDisplayBlocks(`${paragraph}\n\n${paragraph}\n\n${paragraph}`);

    expect(remainingReadingMinutes(blocks, 0, 100)).toBe(3);
    expect(remainingReadingMinutes(blocks, 1, 100)).toBe(2);
    expect(remainingReadingMinutes(blocks, 2, 100)).toBe(1);
    expect(remainingReadingMinutes([], 0)).toBe(0);
  });

  it("measures progress from source words rather than decorative article height", () => {
    const blocks = parseReadingDisplayBlocks("one two three four\n\nfive six\n\nseven eight nine ten");

    expect(readingUnitProgress(blocks, 0, 0)).toBe(0);
    expect(readingUnitProgress(blocks, 1, 0)).toBe(40);
    expect(readingUnitProgress(blocks, 1, .5)).toBe(50);
    expect(readingUnitProgress(blocks, 2, 1)).toBe(100);
  });

  it("weights full-book progress by source words rather than unit count", () => {
    const outline = [
      { index: 0, wordCount: 100 },
      { index: 1, wordCount: 900 },
    ];

    expect(readingBookProgress(outline, 0, 100)).toBe(10);
    expect(readingBookProgress(outline, 1, 50)).toBeCloseTo(55);
    expect(readingBookProgress(outline, 1, 100)).toBe(100);
  });

  it("keeps a compatible device-local passage anchor when the server timestamp is newer", () => {
    const local = { unitIndex: 2, unitProgress: 48.2, overallProgress: 31, passageId: "passage-local-1", updatedAt: "2026-07-19T10:00:00.000Z" };
    const server = { unitIndex: 2, unitProgress: 48.3, overallProgress: 31, updatedAt: "2026-07-19T10:00:01.000Z" };
    expect(reconcileReadingProgress(server, local)).toEqual({ ...server, passageId: local.passageId });

    const advancedServer = { ...server, unitProgress: 72 };
    expect(reconcileReadingProgress(advancedServer, local)).toEqual(advancedServer);
  });
});
