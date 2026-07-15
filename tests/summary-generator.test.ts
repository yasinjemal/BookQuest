import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ai-provider", () => ({
  DEFAULT_AI_MODEL: "test-model",
  createAiProvider: vi.fn(),
  getAiAvailability: vi.fn(),
}));

vi.mock("../lib/summary-db", () => ({
  bumpSummaryGenerationAttempts: vi.fn(),
  claimNextSummarySection: vi.fn(),
  commitSummaryOutline: vi.fn(),
  countFailedSummarySections: vi.fn(),
  countSummarySections: vi.fn(),
  countUnfinishedSummarySections: vi.fn(),
  createSummarySection: vi.fn(),
  getGenerationSummary: vi.fn(),
  recoverStuckSummarySections: vi.fn(),
  setSummaryMeta: vi.fn(),
  setSummarySectionContent: vi.fn(),
  setSummarySectionStatus: vi.fn(),
  setSummaryStatus: vi.fn(),
  touchSummaryGenerationHeartbeat: vi.fn(),
  StaleSummaryGenerationError: class StaleSummaryGenerationError extends Error {},
}));
import {
  SUMMARY_PROMPT_VERSION,
  SUMMARY_SECTION_SOURCE_MAX_CHARS,
  runSummaryGenerationStep,
  validateSummaryChapterCoverage,
  validateSummarySectionGrounding,
} from "../lib/summary-generator";
import { SummaryOutline, SummarySectionContent } from "../lib/summary-types";
import * as aiProvider from "../lib/ai-provider";
import * as summaryDb from "../lib/summary-db";

function outline(sectionIndexes: number[][]) {
  return SummaryOutline.parse({
    title: "A guided understanding",
    description: "Follow the complete argument without losing its thread.",
    thesis: "The source develops one connected argument across its chapters.",
    document_kind: "nonfiction",
    estimated_minutes: 35,
    sections: sectionIndexes.map((chapter_indexes, index) => ({
      title: `Part ${index + 1}`,
      hook: `What changes in part ${index + 1}?`,
      chapter_indexes,
    })),
  });
}

function sectionContent() {
  return {
    takeaway: "The argument becomes useful when its connected parts stay visible.",
    overview: "The source develops the idea in stages and then joins them.",
    key_ideas: [
      {
        title: "First idea",
        explanation: "The opening establishes the problem.",
        why_it_matters: "It gives the rest of the reasoning a purpose.",
        citation_ids: ["c1"],
      },
      {
        title: "Second idea",
        explanation: "The next chapter develops the response.",
        why_it_matters: "It connects the diagnosis to action.",
        citation_ids: ["c2"],
      },
    ],
    source_examples: [],
    connections: ["The second idea answers the problem raised by the first."],
    nuances: [],
    practical_applications: [],
    chapter_recap: [
      {
        chapter_index: 0,
        source_chapter: "Opening",
        summary: "Introduces the problem.",
        citation_ids: ["c1"],
      },
      {
        chapter_index: 1,
        source_chapter: "Response",
        summary: "Develops the response.",
        citation_ids: ["c2"],
      },
    ],
    closing_reflection: "The value lies in seeing the reasoning as a whole.",
    citations: [
      {
        id: "c1",
        chapter_index: 0,
        source_chapter: "Opening",
        locator: "Opening",
        supporting_excerpt: "The problem begins here.",
      },
      {
        id: "c2",
        chapter_index: 1,
        source_chapter: "Response",
        locator: "Response",
        supporting_excerpt: "The response follows.",
      },
    ],
  };
}

describe("deep summary generation contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an outline only when every source chapter is assigned exactly once", () => {
    expect(() => validateSummaryChapterCoverage(outline([[0, 1], [2], [3, 4]]), 5)).not.toThrow();

    expect(() => validateSummaryChapterCoverage(outline([[0, 1], [1, 3]]), 4)).toThrow(
      /duplicated: 1.*missing: 2/i
    );
    expect(() => validateSummaryChapterCoverage(outline([[0, 1], [2, 4]]), 4)).toThrow(
      /out of range: 4.*missing: 3/i
    );
  });

  it("keeps section work bounded and versioned for durable retries", () => {
    expect(SUMMARY_SECTION_SOURCE_MAX_CHARS).toBeGreaterThanOrEqual(60_000);
    expect(SUMMARY_SECTION_SOURCE_MAX_CHARS).toBeLessThanOrEqual(80_000);
    expect(SUMMARY_PROMPT_VERSION).toMatch(/^deep-summary-section-v\d+$/);
  });

  it("requires compact, chapter-addressable evidence in generated content", () => {
    const valid = sectionContent();

    expect(SummarySectionContent.safeParse(valid).success).toBe(true);
    expect(
      SummarySectionContent.safeParse({
        ...valid,
        citations: [
          {
            ...valid.citations[0],
            supporting_excerpt: "x".repeat(281),
          },
        ],
      }).success
    ).toBe(false);
  });

  it("rejects swapped chapter evidence and mislabeled source trails", () => {
    const chapters = [
      { title: "Opening", text: "The problem begins here." },
      { title: "Response", text: "The response follows." },
    ];
    const swapped = sectionContent();
    swapped.chapter_recap[0].citation_ids = ["c2"];
    expect(() => validateSummarySectionGrounding(swapped, chapters, [0, 1])).toThrow(
      /evidence from another chapter/i
    );

    const mislabeled = sectionContent();
    mislabeled.citations[0].source_chapter = "Wrong chapter";
    expect(() => validateSummarySectionGrounding(mislabeled, chapters, [0, 1])).toThrow(
      /labels chapter 0 incorrectly/i
    );
  });

  it("commits the whole outline as one durable database step", async () => {
    const source = [
      { title: "Opening", text: "The problem begins here." },
      { title: "Response", text: "The response follows." },
    ];
    vi.mocked(aiProvider.getAiAvailability).mockReturnValue({
      provider: "anthropic",
      model: "test-model",
      baseUrl: null,
      enabled: true,
      mode: "enabled",
      message: null,
    });
    vi.mocked(aiProvider.createAiProvider).mockReturnValue({
      model: "test-model",
      provider: "anthropic",
      client: {
        messages: {
          parse: vi.fn().mockResolvedValue({ parsed_output: outline([[0, 1]]) }),
        },
      },
    } as never);
    vi.mocked(summaryDb.getGenerationSummary).mockResolvedValue({
      id: 7,
      status: "extracting",
      source_json: JSON.stringify(source),
      generation_run_id: "run-1",
    });
    vi.mocked(summaryDb.countSummarySections).mockResolvedValue(0);

    await expect(runSummaryGenerationStep(7, "run-1")).resolves.toBe("continue");

    expect(summaryDb.commitSummaryOutline).toHaveBeenCalledTimes(1);
    expect(summaryDb.commitSummaryOutline).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ title: "A guided understanding" }),
      [expect.objectContaining({ title: "Part 1", chapterIndexes: [0, 1] })],
      expect.objectContaining({
        generatorModel: "test-model",
        promptVersion: "deep-summary-outline-v1",
        generationRunId: "run-1",
      })
    );
  });

  it("claims, stores, and completes only one independently retryable section per step", async () => {
    const source = [
      { title: "Opening", text: "The problem begins here." },
      { title: "Response", text: "The response follows." },
    ];
    vi.mocked(aiProvider.getAiAvailability).mockReturnValue({
      provider: "anthropic",
      model: "test-model",
      baseUrl: null,
      enabled: true,
      mode: "enabled",
      message: null,
    });
    vi.mocked(aiProvider.createAiProvider).mockReturnValue({
      model: "test-model",
      provider: "anthropic",
      client: {
        messages: {
          parse: vi.fn().mockResolvedValue({ parsed_output: sectionContent() }),
        },
      },
    } as never);
    vi.mocked(summaryDb.getGenerationSummary).mockResolvedValue({
      id: 7,
      status: "generating",
      source_json: JSON.stringify(source),
      generation_run_id: "run-1",
    });
    vi.mocked(summaryDb.countSummarySections).mockResolvedValue(2);
    vi.mocked(summaryDb.claimNextSummarySection).mockResolvedValue({
      id: 11,
      title: "The connected argument",
      hook: "How do the two parts work together?",
      chapter_indexes: [0, 1],
      attempts: 1,
    });

    await expect(runSummaryGenerationStep(7, "run-1")).resolves.toBe("continue");

    expect(summaryDb.setSummarySectionContent).toHaveBeenCalledTimes(1);
    expect(summaryDb.setSummarySectionContent).toHaveBeenCalledWith(
      11,
      JSON.stringify(sectionContent()),
      expect.objectContaining({
        generatorModel: "test-model",
        promptVersion: SUMMARY_PROMPT_VERSION,
        generationRunId: "run-1",
      })
    );
    expect(summaryDb.setSummarySectionStatus).not.toHaveBeenCalled();
    expect(summaryDb.touchSummaryGenerationHeartbeat).toHaveBeenCalledTimes(2);
    expect(summaryDb.countUnfinishedSummarySections).not.toHaveBeenCalled();
  });

  it("does not present a summary with failed sections as complete", async () => {
    vi.mocked(aiProvider.getAiAvailability).mockReturnValue({
      provider: "anthropic",
      model: "test-model",
      baseUrl: null,
      enabled: true,
      mode: "enabled",
      message: null,
    });
    vi.mocked(summaryDb.getGenerationSummary).mockResolvedValue({
      id: 7,
      status: "generating",
      source_json: JSON.stringify([{ title: "Opening", text: "The problem begins here." }]),
      generation_run_id: "run-1",
    });
    vi.mocked(summaryDb.countSummarySections).mockResolvedValue(1);
    vi.mocked(summaryDb.claimNextSummarySection).mockResolvedValue(undefined);
    vi.mocked(summaryDb.countUnfinishedSummarySections).mockResolvedValue(0);
    vi.mocked(summaryDb.countFailedSummarySections).mockResolvedValue(1);

    await expect(runSummaryGenerationStep(7, "run-1")).resolves.toBe("done");

    expect(summaryDb.setSummaryStatus).toHaveBeenCalledWith(
      7,
      "error",
      expect.stringContaining("1 summary section could not be completed"),
      "run-1"
    );
  });
});
