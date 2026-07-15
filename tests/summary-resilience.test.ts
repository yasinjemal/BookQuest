import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Deep Summary resilience contracts", () => {
  it("keeps long PDFs page-addressable and hard-bounded", () => {
    const extract = source("lib/extract.ts");
    expect(extract).toContain("mergePages: false");
    expect(extract).toContain("Page ${index + 1}");
    expect(extract).toContain("enforceChapterSize(readablePages)");
    expect(extract).toContain("remaining.length > MAX_CHAPTER_CHARS");
  });

  it("recovers a lost initial worker from both the shelf and reader", () => {
    const db = source("lib/summary-db.ts");
    const detail = source("app/api/summaries/[id]/route.ts");
    expect(db).toContain("status IN ('extracting','outlining','generating')");
    expect(detail).toContain("claimStalledSummary(");
    expect(detail).toContain("kickSummaryGeneration(");
  });

  it("checks retry prerequisites and preserves completed sections", () => {
    const retry = source("app/api/summaries/[id]/retry/route.ts");
    const db = source("lib/summary-db.ts");
    expect(retry.indexOf("getAiAvailability()")).toBeLessThan(
      retry.indexOf("prepareSummaryRetry(summaryId")
    );
    expect(db).toContain("status <> 'ready'");
    expect(db).not.toContain('DELETE FROM summary_sections WHERE summary_id = $1');
  });

  it("cleans failed artifacts before refunding a combined creation", () => {
    const upload = source("app/api/upload/route.ts");
    expect(upload.indexOf("deleteSummary(createdSummary.id")).toBeLessThan(
      upload.indexOf("adjustCredits(user.id, creditsRequired)")
    );
    expect(upload.indexOf("deleteCourse(createdCourse.id")).toBeLessThan(
      upload.indexOf("adjustCredits(user.id, creditsRequired)")
    );
  });
});
