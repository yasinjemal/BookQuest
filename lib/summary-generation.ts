import {
  GENERATION_STEP_BUDGET_MS,
  internalGenerationHeaders,
} from "./generation";
import { runSummaryGenerationUntilBudget } from "./summary-generator";
import {
  recordSummaryGenerationTriggerFailure,
  resetSummaryGenerationTriggerFailures,
  StaleSummaryGenerationError,
} from "./summary-db";
import { withSummaryGenerationLock } from "./pg";
import {
  operationalSubject,
  recordOperationalError,
} from "./observability";

const INTERNAL_GENERATE_SUMMARY_PATH = "/api/internal/generate-summary";

export const SUMMARY_GENERATION_STALE_MS = 210_000;
export const MAX_SUMMARY_TRIGGER_FAILURES = 3;

function triggerFailureMessage(status: number | null): string {
  if (status === 401 || status === 403) {
    return "The summary worker could not restart because deployment automation access is blocked. Check deployment protection, then retry this Deep Read.";
  }
  if (status === 429) {
    return "The summary worker was repeatedly rate limited. Wait a moment, then retry this Deep Read.";
  }
  return "The summary worker could not restart after several attempts. Retry this Deep Read to continue from the completed work.";
}

export async function kickSummaryGeneration(
  summaryId: number,
  generationRunId: string,
  baseUrl: string
): Promise<boolean> {
  let responseStatus: number | null = null;
  try {
    const response = await fetch(`${baseUrl}${INTERNAL_GENERATE_SUMMARY_PATH}`, {
      method: "POST",
      headers: internalGenerationHeaders(),
      body: JSON.stringify({ summaryId, generationRunId }),
      cache: "no-store",
    });
    responseStatus = response.status;
    if (!response.ok) {
      throw new Error(`Summary generation trigger returned ${response.status}`);
    }
    await resetSummaryGenerationTriggerFailures(summaryId, generationRunId);
    return true;
  } catch (error) {
    console.error(`Failed to kick generation for summary ${summaryId}:`, error);
    await recordOperationalError({
      eventType: "summary.generation_trigger_failed",
      area: "summary.generation",
      error,
      subjectKey: operationalSubject("summary", summaryId),
      metadata: { http_status: responseStatus },
    });
    try {
      await recordSummaryGenerationTriggerFailure(
        summaryId,
        generationRunId,
        MAX_SUMMARY_TRIGGER_FAILURES,
        triggerFailureMessage(responseStatus)
      );
    } catch (recordError) {
      if (!(recordError instanceof StaleSummaryGenerationError)) {
        console.error(`Failed to record generation trigger failure for summary ${summaryId}:`, recordError);
      }
    }
    return false;
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
