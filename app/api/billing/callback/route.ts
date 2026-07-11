import { NextRequest, NextResponse } from "next/server";
import { verifyAndFulfill } from "@/lib/billing";

export const runtime = "nodejs";

/** Flutterwave redirects here after checkout:
    ?status=successful&tx_ref=...&transaction_id=... */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const txRef = req.nextUrl.searchParams.get("tx_ref");
  const transactionId = req.nextUrl.searchParams.get("transaction_id");

  let outcome = "failed";
  if (status === "successful" && txRef && transactionId) {
    const ok = await verifyAndFulfill(txRef, transactionId);
    outcome = ok ? "success" : "failed";
  } else if (status === "cancelled") {
    outcome = "cancelled";
  }
  return NextResponse.redirect(
    new URL(`/profile?payment=${outcome}`, req.nextUrl.origin)
  );
}
