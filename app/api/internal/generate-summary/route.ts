import { after, NextRequest, NextResponse } from "next/server";
import { resolveBaseUrl, verifyGenerationSecret } from "@/lib/generation";
import { isGenerationRunId } from "@/lib/generation-run";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";
import { getGenerationSummary } from "@/lib/summary-db";
import { runSummaryAndChain } from "@/lib/summary-generation";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifyGenerationSecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let summaryId: number;
  let generationRunId: string;
  try {
    const body = (await req.json()) as {
      summaryId?: number;
      generationRunId?: string;
    };
    summaryId = Number(body.summaryId);
    generationRunId = body.generationRunId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!Number.isInteger(summaryId) || summaryId <= 0) {
    return NextResponse.json({ error: "Invalid summaryId" }, { status: 400 });
  }
  if (!isGenerationRunId(generationRunId)) {
    return NextResponse.json({ error: "Invalid generationRunId" }, { status: 400 });
  }
  const summary = await getGenerationSummary(summaryId);
  if (!summary || summary.generation_run_id !== generationRunId) {
    return NextResponse.json({ error: "Stale summary generation run" }, { status: 409 });
  }
  const limit = await consumeRateLimit(
    RATE_LIMITS.internalGenerationSummary,
    rateLimitSubject("summary", summaryId)
  );
  if (!limit.allowed) return tooManyRequests(limit);

  const baseUrl = resolveBaseUrl(req);
  after(() => runSummaryAndChain(summaryId, generationRunId, baseUrl));
  return NextResponse.json({ ok: true }, { status: 202 });
}
