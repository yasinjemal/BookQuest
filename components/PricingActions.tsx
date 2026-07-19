"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PricingAction({ product, children }: { product?: "premium_month" | "credits_5" | "credits_15"; children: React.ReactNode }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function act() {
    if (!product) { router.push("/register"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product }) });
      if (response.status === 401) { router.push("/register?next=/pricing"); return; }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Checkout could not be opened.");
      if (data.link) window.location.assign(data.link);
      else if (data.simulated) router.push("/profile?payment=success");
      else throw new Error("Checkout could not be opened. No payment link was returned.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be opened. Try again.");
      setBusy(false);
    }
  }
  return <div className="mt-7"><button type="button" onClick={() => void act()} disabled={busy} className="btn-primary w-full">{busy ? "Opening secure checkout…" : children}</button>{error && <p role="alert" className="mt-3 rounded-xl border border-no/25 bg-no-soft px-3 py-2 text-xs font-semibold leading-5 text-no-deep">{error}</p>}</div>;
}
