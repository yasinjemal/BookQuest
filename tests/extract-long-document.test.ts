import { beforeEach, describe, expect, it, vi } from "vitest";

const extractText = vi.fn();
const getDocumentProxy = vi.fn();

vi.mock("unpdf", () => ({ extractText, getDocumentProxy }));

import { extractDocument, splitIntoChapters } from "../lib/extract";

describe("long-document extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDocumentProxy.mockResolvedValue({ numPages: 2 });
  });

  it("preserves PDF pages as source-addressable chapters", async () => {
    extractText.mockResolvedValue({
      totalPages: 2,
      text: ["First page evidence.", "Second page evidence."],
    });

    const result = await extractDocument(Buffer.from("pdf"), "book.pdf");

    expect(extractText).toHaveBeenCalledWith(expect.anything(), { mergePages: false });
    expect(result.chapters).toEqual([
      { title: "Page 1", text: "First page evidence." },
      { title: "Page 2", text: "Second page evidence." },
    ]);
  });

  it("hard-splits a giant paragraph that has no natural boundaries", () => {
    const source = "x".repeat(70_000);
    const chapters = splitIntoChapters(source);

    expect(chapters.length).toBeGreaterThan(1);
    expect(chapters.every((chapter) => chapter.text.length <= 24_000)).toBe(true);
    expect(chapters.map((chapter) => chapter.text).join("")).toBe(source);
  });
});
