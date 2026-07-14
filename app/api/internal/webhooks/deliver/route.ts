import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { deliverNextWebhook } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(value: string | null) {
  const expected = process.env.WEBHOOK_DELIVERY_SECRET || process.env.GENERATION_SECRET;
  const supplied = value?.startsWith("Bearer ") ? value.slice(7) : "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected); const right = Buffer.from(supplied);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (!authorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const delivered = [];
  for (let index = 0; index < 25; index += 1) {
    const result = await deliverNextWebhook();
    if (!result) break;
    delivered.push(result);
  }
  return NextResponse.json({ processed: delivered.length, deliveries: delivered }, { headers: { "Cache-Control": "no-store" } });
}
