import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/pg", () => ({
  withCourseGenerationLock: vi.fn(),
  withSummaryGenerationLock: vi.fn(),
}));
vi.mock("../lib/generator", () => ({ runGenerationUntilBudget: vi.fn() }));
vi.mock("../lib/db", () => ({
  StaleGenerationRunError: class StaleGenerationRunError extends Error {},
}));
vi.mock("../lib/summary-generator", () => ({
  runSummaryGenerationUntilBudget: vi.fn(),
}));
vi.mock("../lib/summary-db", () => ({
  recordSummaryGenerationTriggerFailure: vi.fn(),
  resetSummaryGenerationTriggerFailures: vi.fn(),
  StaleSummaryGenerationError: class StaleSummaryGenerationError extends Error {},
}));
vi.mock("../lib/observability", () => ({
  operationalSubject: vi.fn(() => "subject"),
  recordOperationalError: vi.fn(),
}));

import { kickSummaryGeneration } from "../lib/summary-generation";
import * as summaryDb from "../lib/summary-db";

describe("summary worker handoff recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GENERATION_SECRET = "generation-secret";
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "bypass-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GENERATION_SECRET;
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  });

  it("authenticates a successful protected-deployment handoff", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      kickSummaryGeneration(7, "run-1", "https://deployment.vercel.app")
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://deployment.vercel.app/api/internal/generate-summary",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-generation-secret": "generation-secret",
          "x-vercel-protection-bypass": "bypass-secret",
        }),
      })
    );
    expect(summaryDb.resetSummaryGenerationTriggerFailures).toHaveBeenCalledWith(7, "run-1");
    expect(summaryDb.recordSummaryGenerationTriggerFailure).not.toHaveBeenCalled();
  });

  it("durably counts a rejected handoff instead of swallowing it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(
      kickSummaryGeneration(7, "run-1", "https://deployment.vercel.app")
    ).resolves.toBe(false);

    expect(summaryDb.recordSummaryGenerationTriggerFailure).toHaveBeenCalledWith(
      7,
      "run-1",
      3,
      expect.stringContaining("deployment automation access is blocked")
    );
    expect(summaryDb.resetSummaryGenerationTriggerFailures).not.toHaveBeenCalled();
  });
});
