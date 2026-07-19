import { after, NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { aiUnavailablePayload, getAiAvailability } from "@/lib/ai-provider";
import {
  AiBudgetConfigurationError,
  AiBudgetExceededError,
  aiBudgetErrorPayload,
  aiBudgetRetryAfterSeconds,
  assertAiBudgetAvailable,
} from "@/lib/ai-budget";
import { resolveBaseUrl } from "@/lib/generation";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  claimStalledSummary,
  getOwnedSummary,
  prepareSummaryRetry,
} from "@/lib/summary-db";
import { runSummaryAndChain } from "@/lib/summary-generation";
import { SUMMARY_GENERATION_STALE_MS } from "@/lib/summary-types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.summaryRetryUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const summaryId = Number((await params).id);
  if (!Number.isInteger(summaryId) || summaryId <= 0) {
    return NextResponse.json({ error: "Invalid summary id" }, { status: 400 });
  }
  const ai = getAiAvailability();
  if (!ai.enabled) {
    return NextResponse.json(aiUnavailablePayload(ai), { status: 503 });
  }
  const summary = await getOwnedSummary(summaryId, user.id);
  if (!summary) {
    return NextResponse.json({ error: "Summary not found" }, { status: 404 });
  }
  let sourceIsReadable = false;
  try {
    const source = JSON.parse(summary.source_json ?? "null") as unknown;
    sourceIsReadable = Array.isArray(source) && source.length > 0 && source.every(
      (chapter) =>
        typeof chapter === "object" && chapter !== null &&
        typeof (chapter as { title?: unknown }).title === "string" &&
        typeof (chapter as { text?: unknown }).text === "string" &&
        Boolean((chapter as { text: string }).text.trim())
    );
  } catch {
    sourceIsReadable = false;
  }
  if (!sourceIsReadable) {
    return NextResponse.json(
      { error: "This Deep Read no longer has a readable source to retry." },
      { status: 409 }
    );
  }
  try {
    await assertAiBudgetAvailable(ai.model!);
  } catch (error) {
    if (error instanceof AiBudgetExceededError) {
      return NextResponse.json(aiBudgetErrorPayload(error), {
        status: 429,
        headers: { "Retry-After": String(aiBudgetRetryAfterSeconds(error)) },
      });
    }
    if (error instanceof AiBudgetConfigurationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 503 }
      );
    }
    throw error;
  }
  const active = new Set(["extracting", "outlining", "generating"]);
  let generationRunId: string | undefined;
  if (summary.status === "error") {
    generationRunId = await prepareSummaryRetry(summaryId, user.id);
  } else if (active.has(summary.status)) {
    const claimedAt = new Date();
    const stalled = await claimStalledSummary(
      summaryId,
      user.id,
      new Date(claimedAt.getTime() - SUMMARY_GENERATION_STALE_MS).toISOString(),
      claimedAt.toISOString()
    );
    generationRunId = stalled?.generation_run_id;
    if (!generationRunId) {
      return NextResponse.json(
        {
          error: "Generation is still active. Wait for the current section to finish before resuming.",
          code: "generation_active",
        },
        { status: 409 }
      );
    }
  }
  if (!generationRunId) {
    return NextResponse.json(
      { error: "This summary is not ready to resume." },
      { status: 409 }
    );
  }
  const baseUrl = resolveBaseUrl(req);
  after(() => runSummaryAndChain(summaryId, generationRunId, baseUrl));
  return NextResponse.json(
    { ok: true, summaryId, resumed: summary.status !== "error" },
    { status: 202 }
  );
}
