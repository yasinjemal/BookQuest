import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import {
  operationalSubject,
  recordOperationalEvent,
} from "@/lib/observability";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const OutboxHealth = z.object({
  answerQueueDepth: z.number().int().min(0).max(10_000),
  completionQueueDepth: z.number().int().min(0).max(10_000),
  oldestQueueSeconds: z.number().int().min(0).max(30 * 86_400),
  attempted: z.number().int().min(0).max(20_000),
  drained: z.number().int().min(0).max(20_000),
}).refine((value) => value.drained <= value.attempted, {
  message: "Drained count cannot exceed attempted count.",
});

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.outboxTelemetryUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);

  let parsed: ReturnType<typeof OutboxHealth.safeParse>;
  try {
    parsed = OutboxHealth.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid outbox telemetry" }, { status: 400 });
  }
  const value = parsed.data;
  await recordOperationalEvent({
    eventType: "learning.outbox_health",
    severity: value.answerQueueDepth + value.completionQueueDepth > 0 ? "warning" : "info",
    area: "learning.outbox",
    subjectKey: operationalSubject("user", user.id),
    metadata: {
      answer_queue_depth: value.answerQueueDepth,
      completion_queue_depth: value.completionQueueDepth,
      oldest_queue_seconds: value.oldestQueueSeconds,
      attempted: value.attempted,
      drained: value.drained,
    },
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
