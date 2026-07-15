import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  buildLearningAnalysis,
  LearningGenomeError,
  learningGenomeDashboard,
  proposeConceptMapping,
  publishLearningAnalysis,
  reviewConceptMapping,
  reviewQuestion,
  setLearningFeatureFlags,
} from "@/lib/learning-genome";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

function apiError(error: unknown) {
  if (error instanceof LearningGenomeError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
  }
  throw error;
}

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403, headers: noStore });
  }
  return NextResponse.json(await learningGenomeDashboard(), { headers: noStore });
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403, headers: noStore });
  }
  const limit = await consumeRateLimit(
    RATE_LIMITS.studioMutationUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }

  try {
    let result: unknown;
    switch (body.action) {
      case "build":
        result = await buildLearningAnalysis(user.id);
        break;
      case "publish":
        result = await publishLearningAnalysis(user.id, String(body.analysisId ?? ""));
        break;
      case "review_question":
        result = await reviewQuestion({
          actorUserId: user.id,
          questionVersionId: String(body.questionVersionId ?? ""),
          analysisVersionId: body.analysisVersionId
            ? String(body.analysisVersionId)
            : undefined,
          decision: body.decision as "keep" | "revise" | "retire",
          reason: String(body.reason ?? ""),
        });
        break;
      case "propose_mapping":
        result = await proposeConceptMapping({
          actorUserId: user.id,
          analysisVersionId: String(body.analysisVersionId ?? ""),
          sourceConceptId: String(body.sourceConceptId ?? ""),
          targetConceptId: String(body.targetConceptId ?? ""),
          confidence: Number(body.confidence),
          rationale: String(body.rationale ?? ""),
        });
        break;
      case "review_mapping":
        result = await reviewConceptMapping({
          actorUserId: user.id,
          mappingId: String(body.mappingId ?? ""),
          decision: body.decision as "approved" | "rejected" | "revoked",
          reason: String(body.reason ?? ""),
        });
        break;
      case "flags":
        result = await setLearningFeatureFlags({
          actorUserId: user.id,
          courseId: Number(body.courseId),
          adaptiveReviewEnabled: body.adaptiveReviewEnabled === true,
          adaptiveSequencingEnabled: body.adaptiveSequencingEnabled === true,
          placementEnabled: body.placementEnabled === true,
          explanationExperimentsEnabled: body.explanationExperimentsEnabled === true,
        });
        break;
      default:
        return NextResponse.json(
          { error: "Unknown learning-genome action" },
          { status: 400, headers: noStore }
        );
    }
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
