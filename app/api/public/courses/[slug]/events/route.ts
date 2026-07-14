import { NextRequest, NextResponse } from "next/server";
import { recordPublicCourseEvent, type PublicEventType } from "@/lib/public-product";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, requestIp, tooManyRequests } from "@/lib/rate-limit";

const EVENTS = new Set<PublicEventType>(["view", "share", "reader_open"]);
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const limit = await consumeRateLimit(RATE_LIMITS.publicCourseEventIp, rateLimitSubject("ip", requestIp(request)));
  if (!limit.allowed) return tooManyRequests(limit);
  const { eventType } = await request.json() as { eventType?: PublicEventType };
  if (!eventType || !EVENTS.has(eventType)) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const ok = await recordPublicCourseEvent((await params).slug, eventType);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
