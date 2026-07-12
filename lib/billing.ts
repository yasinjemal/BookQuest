import crypto from "crypto";
import {
  adjustCredits,
  createTransaction,
  getTransaction,
  grantPremium,
  markTransaction,
} from "./db";

/** Products. Prices in USD cents; Flutterwave converts to local methods
    (mobile money, Telebirr, M-Pesa, cards) at checkout. */
export const PRODUCTS = {
  credits_5: {
    name: "5 course credits",
    amount_cents: 299,
    grant: { credits: 5 },
  },
  credits_15: {
    name: "15 course credits",
    amount_cents: 699,
    grant: { credits: 15 },
  },
  premium_month: {
    name: "Premium (1 month)",
    amount_cents: 499,
    grant: { credits: 15, premiumDays: 30 },
  },
} as const;

export type ProductId = keyof typeof PRODUCTS;
export const CURRENCY = process.env.BILLING_CURRENCY ?? "USD";

export function isLiveBilling(): boolean {
  return !!process.env.FLW_SECRET_KEY;
}

export function newTxRef(userId: number): string {
  return `bq-${userId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Create a pending transaction and (in live mode) a Flutterwave payment link. */
export async function startCheckout(
  userId: number,
  email: string,
  name: string,
  product: ProductId,
  origin: string
): Promise<{ link?: string; simulated?: boolean; txRef: string }> {
  const p = PRODUCTS[product];
  const txRef = newTxRef(userId);
  await createTransaction(userId, txRef, product, p.amount_cents, CURRENCY);

  if (!isLiveBilling()) {
    // Test mode: no Flutterwave keys configured — fulfill immediately so the
    // whole flow can be exercised locally.
    await fulfill(txRef, "simulated");
    return { simulated: true, txRef };
  }

  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount: (p.amount_cents / 100).toFixed(2),
      currency: CURRENCY,
      redirect_url: `${origin}/api/billing/callback`,
      customer: { email, name },
      customizations: { title: "BookQuest", description: p.name },
    }),
  });
  const data = (await res.json()) as {
    status: string;
    data?: { link: string };
    message?: string;
  };
  if (data.status !== "success" || !data.data?.link) {
    await markTransaction(txRef, "failed");
    throw new Error(data.message ?? "Could not start payment");
  }
  return { link: data.data.link, txRef };
}

/** Verify a redirect callback against Flutterwave, then fulfill. */
export async function verifyAndFulfill(
  txRef: string,
  transactionId: string
): Promise<boolean> {
  const tx = await getTransaction(txRef);
  if (!tx) return false;
  if (tx.status === "successful") return true; // idempotent

  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
    { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
  );
  const data = (await res.json()) as {
    status: string;
    data?: { status: string; tx_ref: string; amount: number; currency: string };
  };
  const ok =
    data.status === "success" &&
    data.data?.status === "successful" &&
    data.data.tx_ref === txRef &&
    Math.round(data.data.amount * 100) >= tx.amount_cents &&
    data.data.currency === tx.currency;

  if (ok) await fulfill(txRef, transactionId);
  else await markTransaction(txRef, "failed", transactionId);
  return ok;
}

/** Idempotent: grants the product exactly once. */
export async function fulfill(txRef: string, providerRef: string) {
  const tx = await getTransaction(txRef);
  if (!tx || tx.status === "successful") return;
  const p = PRODUCTS[tx.product as ProductId];
  if (!p) return;
  await markTransaction(txRef, "successful", providerRef);
  if ("credits" in p.grant && p.grant.credits)
    await adjustCredits(tx.user_id, p.grant.credits);
  if ("premiumDays" in p.grant && p.grant.premiumDays) {
    await grantPremium(tx.user_id, p.grant.premiumDays);
  }
}
