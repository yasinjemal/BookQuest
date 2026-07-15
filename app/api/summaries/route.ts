import { after, NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { resolveBaseUrl } from "@/lib/generation";
import {
  claimStalledSummaries,
  listOwnedSummaries,
} from "@/lib/summary-db";
import {
  kickSummaryGeneration,
  SUMMARY_GENERATION_STALE_MS,
} from "@/lib/summary-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;

  const summaries = await listOwnedSummaries(user.id);
  const claimedAt = new Date();
  const staleBefore = new Date(
    claimedAt.getTime() - SUMMARY_GENERATION_STALE_MS
  ).toISOString();
  const stalled = await claimStalledSummaries(
    user.id,
    staleBefore,
    claimedAt.toISOString()
  );
  if (stalled.length > 0) {
    const baseUrl = resolveBaseUrl(req);
    after(() =>
      Promise.all(
        stalled.map((summary) =>
          kickSummaryGeneration(summary.id, summary.generation_run_id, baseUrl)
        )
      )
    );
  }

  return NextResponse.json({ summaries });
}
