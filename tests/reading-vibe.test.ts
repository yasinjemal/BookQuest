import { describe, expect, it } from "vitest";
import type { Chapter } from "../lib/extract";
import {
  cleanBookTitle,
  deriveReadingEditionProfile,
  READING_VIBES,
} from "../lib/reading-vibe";

function words(count: number, word = "word") {
  return Array.from({ length: count }, () => word).join(" ");
}

describe("deterministic Reading Edition profiles", () => {
  it("derives the same bounded profile for the same source", () => {
    const chapters: Chapter[] = [
      { title: "A small beginning", text: "An ordinary journey starts at the edge of town." },
      { title: "The road home", text: "The characters return with a different story." },
    ];

    const first = deriveReadingEditionProfile("the-long-road.txt", chapters);
    const second = deriveReadingEditionProfile("the-long-road.txt", chapters);

    expect(second).toEqual(first);
    expect(Object.keys(READING_VIBES)).toContain(first.vibeId);
    expect(first).toMatchObject({
      version: "reading-vibe-v1",
      unitCount: 2,
      unitKind: "chapter",
    });
    expect(["source-signal", "stable-fallback"]).toContain(first.matchedBy);
  });

  it("uses bounded source signals without allowing an arbitrary theme", () => {
    const profile = deriveReadingEditionProfile("orbital-physics.pdf", [
      { title: "Page 1", text: "Science and engineering describe the universe." },
      { title: "Page 2", text: "The spacecraft sends new data." },
    ]);

    expect(profile).toMatchObject({
      vibeId: "cosmic-margin",
      matchedBy: "source-signal",
      unitKind: "page",
      unitCount: 2,
    });
    expect(READING_VIBES[profile.vibeId].appearance).toBeDefined();
  });

  it("cleans common upload filenames into reader-facing titles", () => {
    expect(cleanBookTitle("THE_LEFT_HAND_OF_DARKNESS.PDF")).toBe("The Left Hand Of Darkness");
    expect(cleanBookTitle("the-long-road-home.docx")).toBe("The Long Road Home");
    expect(cleanBookTitle("Already Titled.markdown")).toBe("Already Titled");
    expect(cleanBookTitle("___ .pdf")).toBe("Untitled book");
  });

  it("reports sane word counts, reading time, and unit kinds", () => {
    const pageProfile = deriveReadingEditionProfile("sample.pdf", [
      { title: "Page 1", text: words(230) },
      { title: "Page 2", text: words(231) },
    ]);
    const sectionProfile = deriveReadingEditionProfile("single.txt", [
      { title: "Full document", text: "one two three" },
    ]);
    const emptyProfile = deriveReadingEditionProfile("empty.txt", []);

    expect(pageProfile).toMatchObject({
      wordCount: 461,
      estimatedMinutes: 3,
      unitCount: 2,
      unitKind: "page",
    });
    expect(sectionProfile).toMatchObject({
      wordCount: 3,
      estimatedMinutes: 1,
      unitCount: 1,
      unitKind: "section",
    });
    expect(emptyProfile).toMatchObject({
      wordCount: 0,
      estimatedMinutes: 0,
      unitCount: 0,
      unitKind: "section",
    });
    for (const metric of [
      pageProfile.wordCount,
      pageProfile.estimatedMinutes,
      pageProfile.unitCount,
    ]) {
      expect(Number.isFinite(metric)).toBe(true);
      expect(metric).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the public vibe catalogue internally consistent", () => {
    const entries = Object.entries(READING_VIBES);
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries.length).toBeLessThanOrEqual(12);

    for (const [id, vibe] of entries) {
      expect(vibe.id).toBe(id);
      expect(vibe.name.trim().length).toBeGreaterThan(0);
      expect(vibe.description.trim().length).toBeGreaterThan(0);
      expect(vibe.appearance).toMatchObject({
        template: expect.any(String),
        typography: expect.any(String),
        surface: expect.any(String),
        atmosphere: expect.any(String),
        readingWidth: expect.any(String),
      });
    }
  });
});

describe("creation output costs", () => {
  it("creates a full book without AI or credits even when generation was requested", async () => {
    const { resolveCreationOutput } = await import("../lib/creation-output");

    expect(resolveCreationOutput("book", true)).toEqual({
      output: "book",
      wantsBook: true,
      wantsCourse: false,
      wantsSummary: false,
      courseUsesAi: false,
      requiresAi: false,
      creditsRequired: 0,
    });
  });

  it("retains existing AI costs and the source-only course option", async () => {
    const { resolveCreationOutput } = await import("../lib/creation-output");

    expect(resolveCreationOutput("summary", false)).toMatchObject({
      wantsSummary: true,
      requiresAi: true,
      creditsRequired: 1,
    });
    expect(resolveCreationOutput("course", true)).toMatchObject({
      wantsCourse: true,
      courseUsesAi: true,
      requiresAi: true,
      creditsRequired: 1,
    });
    expect(resolveCreationOutput("course", false)).toMatchObject({
      wantsCourse: true,
      courseUsesAi: false,
      requiresAi: false,
      creditsRequired: 0,
    });
    expect(resolveCreationOutput("both", false)).toMatchObject({
      wantsCourse: true,
      wantsSummary: true,
      courseUsesAi: true,
      requiresAi: true,
      creditsRequired: 2,
    });
    expect(resolveCreationOutput("unexpected", true)).toBeNull();
  });
});
