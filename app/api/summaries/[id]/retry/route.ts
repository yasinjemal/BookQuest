import { after, NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { aiUnavailablePayload, getAiAvailability } from "@/lib/ai-provider";
import { resolveBaseUrl } from "@/lib/generation";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";
import { getOwnedSummary, prepareSummaryRetry } from "@/lib/summary-db";
import { runSummaryAndChain } from "@/lib/summary-generation";

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
  const active = new Set(["extracting", "outlining", "generating"]);
  const generationRunId = summary.status === "error"
    ? await prepareSummaryRetry(summaryId, user.id)
    : active.has(summary.status)
      ? summary.generation_run_id
      : undefined;
  if (!generationRunId) {
    return NextResponse.json(
      { error: "This summary is not ready to resume." },
      { status: 409 }
    );
  }
  const baseUrl = resolveBaseUrl(req);
  after(() => runSummaryAndChain(summaryId, generationRunId, baseUrl));
  return NextResponse.json({ ok: true, summaryId, resumed: summary.status !== "error" });
}
