import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PRODUCTS, startCheckout, type ProductId } from "@/lib/billing";
import {
  operationalSubject,
  recordOperationalError,
} from "@/lib/observability";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.billingCheckoutUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const { product } = (await req.json()) as { product: ProductId };
  if (!PRODUCTS[product]) {
    return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  }
  try {
    const result = await startCheckout(
      user.id,
      user.email,
      user.name,
      product,
      req.nextUrl.origin
    );
    return NextResponse.json(result);
  } catch (err) {
    await recordOperationalError({
      eventType: "billing.checkout_failed",
      area: "billing.checkout",
      error: err,
      subjectKey: operationalSubject("user", user.id),
      metadata: { product },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment failed to start" },
      { status: 502 }
    );
  }
}
