"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PricingAction({ product, children }: { product?: "premium_month" | "credits_5" | "credits_15"; children: React.ReactNode }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function act() {
    if (!product) { router.push("/register"); return; }
    setBusy(true); const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product }) });
    if (response.status === 401) { router.push("/register?next=/pricing"); return; }
    const data = await response.json(); if (data.link) window.location.href = data.link; else if (data.simulated) router.push("/profile?payment=success"); else setBusy(false);
  }
  return <button onClick={() => void act()} disabled={busy} className="mt-7 min-h-12 w-full rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Opening checkout…" : children}</button>;
}
