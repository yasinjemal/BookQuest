import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  evaluateAssignmentCompletion,
  recordAssignmentAttestation,
  recordAssignmentLessonCompletion,
  startAssignmentParticipation,
  submitPracticalTask,
} from "@/lib/institutional";
import { institutionalApiError } from "@/lib/institutional-api";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.answerUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const assignmentId = (await params).id;
  const body = (await req.json()) as {
    action?: "start" | "lesson" | "attest" | "practical" | "evaluate";
    lessonKey?: string;
    score?: number;
    total?: number;
    sourceCompletionEventId?: string | null;
    blockLineageId?: string;
    statement?: string;
    accepted?: boolean;
    response?: Record<string, unknown>;
    artifactHash?: string | null;
  };
  try {
    if (body.action === "start") return NextResponse.json({ participation: await startAssignmentParticipation(user.id, assignmentId) });
    if (body.action === "lesson" && body.lessonKey) return NextResponse.json({ evidence: await recordAssignmentLessonCompletion(user.id, assignmentId, {
      lessonKey: body.lessonKey,
      score: Number(body.score),
      total: Number(body.total),
      sourceCompletionEventId: body.sourceCompletionEventId,
    }) }, { status: 201 });
    if (body.action === "attest" && body.blockLineageId && body.statement) return NextResponse.json({ evidence: await recordAssignmentAttestation(user.id, assignmentId, {
      blockLineageId: body.blockLineageId,
      statement: body.statement,
      accepted: body.accepted === true,
    }) }, { status: 201 });
    if (body.action === "practical" && body.blockLineageId && body.response) return NextResponse.json({ submission: await submitPracticalTask(user.id, assignmentId, {
      blockLineageId: body.blockLineageId,
      response: body.response,
      artifactHash: body.artifactHash,
    }) }, { status: 201 });
    if (body.action === "evaluate") return NextResponse.json(await evaluateAssignmentCompletion(user.id, assignmentId));
    return NextResponse.json({ error: "Invalid participation action" }, { status: 400 });
  } catch (error) {
    const response = institutionalApiError(error);
    if (response) return response;
    throw error;
  }
}

