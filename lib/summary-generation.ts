import { GENERATION_STEP_BUDGET_MS } from "./generation";
import { runSummaryGenerationUntilBudget } from "./summary-generator";
import { StaleSummaryGenerationError } from "./summary-db";
import { withSummaryGenerationLock } from "./pg";
import {
  operationalSubject,
  recordOperationalError,
} from "./observability";

const INTERNAL_GENERATE_SUMMARY_PATH = "/api/internal/generate-summary";

export const SUMMARY_GENERATION_STALE_MS = 180_000;

export async function kickSummaryGeneration(
  summaryId: number,
  generationRunId: string,
  baseUrl: string
): Promise<void> {
  let responseStatus: number | null = null;
  try {
    const response = await fetch(`${baseUrl}${INTERNAL_GENERATE_SUMMARY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-generation-secret": process.env.GENERATION_SECRET ?? "",
      },
      body: JSON.stringify({ summaryId, generationRunId }),
      cache: "no-store",
    });
    responseStatus = response.status;
    if (!response.ok) {
      throw new Error(`Summary generation trigger returned ${response.status}`);
    }
  } catch (error) {
    console.error(`Failed to kick generation for summary ${summaryId}:`, error);
    await recordOperationalError({
      eventType: "summary.generation_trigger_failed",
      area: "summary.generation",
      error,
      subjectKey: operationalSubject("summary", summaryId),
      metadata: { http_status: responseStatus },
    });
  }
}

export async function runSummaryAndChain(
  summaryId: number,
  generationRunId: string,
  baseUrl: string
): Promise<void> {
  const finished = await withSummaryGenerationLock(summaryId, async () => {
    try {
      return await runSummaryGenerationUntilBudget(
        summaryId,
        generationRunId,
        Date.now() + GENERATION_STEP_BUDGET_MS
      );
    } catch (error) {
      if (error instanceof StaleSummaryGenerationError) return true;
      console.error(`Generation chain error for summary ${summaryId}:`, error);
      await recordOperationalError({
        eventType: "summary.generation_chain_failed",
        area: "summary.generation",
        error,
        subjectKey: operationalSubject("summary", summaryId),
      });
      return false;
    }
  });
  if (finished === false) {
    await kickSummaryGeneration(summaryId, generationRunId, baseUrl);
  }
}
