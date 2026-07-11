import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PRODUCTS, startCheckout, type ProductId } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const [user, unauth] = requireUser(req);
  if (!user) return unauth;
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment failed to start" },
      { status: 502 }
    );
  }
}
