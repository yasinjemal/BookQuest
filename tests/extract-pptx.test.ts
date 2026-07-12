import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractDocument } from "../lib/extract";

describe("PowerPoint extraction", () => {
  it("extracts ordered visible slide text from PPTX bytes", async () => {
    const archive = zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "ppt/slides/slide2.xml": strToU8(
        '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Second &amp; safe</a:t></p:sld>'
      ),
      "ppt/slides/slide1.xml": strToU8(
        '<p:sld xmlns:p="p" xmlns:a="a"><a:t>First slide</a:t><a:t>Key idea</a:t></p:sld>'
      ),
      "ppt/media/image1.png": new Uint8Array([1, 2, 3]),
    });
    const result = await extractDocument(Buffer.from(archive), "lesson.pptx");
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["Slide 1", "Slide 2"]);
    expect(result.chapters[0].text).toContain("First slide");
    expect(result.chapters[0].text).toContain("Key idea");
    expect(result.chapters[1].text).toContain("Second & safe");
  });

  it("rejects a PPTX with no readable slide text", async () => {
    const archive = zipSync({
      "ppt/slides/slide1.xml": strToU8('<p:sld xmlns:p="p"/>'),
    });
    await expect(extractDocument(Buffer.from(archive), "empty.pptx")).rejects.toThrow(
      /no readable slide text/i
    );
  });
});
