import { describe, expect, it } from "vitest";
import { isGenerationRunId, newGenerationRunId } from "../lib/generation-run";

describe("generation run identity", () => {
  it("creates distinct valid run identifiers", () => {
    const first = newGenerationRunId();
    const second = newGenerationRunId();
    expect(isGenerationRunId(first)).toBe(true);
    expect(isGenerationRunId(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("accepts legacy backfills but rejects malformed trigger input", () => {
    expect(isGenerationRunId("a".repeat(32))).toBe(true);
    expect(isGenerationRunId("not-a-run")) .toBe(false);
    expect(isGenerationRunId("a".repeat(64))).toBe(false);
  });
});
