import type { Metadata } from "next";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import PricingAction from "@/components/PricingActions";
import { publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "Pricing",
  description: "Start creating source-backed interactive courses for free. Compare BookQuest creation credits, Creator Pass, and one-time credit packs.",
  path: "/pricing",
});

const plans = [
  { name: "Free", price: "$0", note: "Start without a card", product: undefined, features: ["3 course-creation credits", "Edit, learn, and publish", "Public course and creator pages"] },
  { name: "Creator Pass", price: "$4.99", note: "30 days · renew manually", product: "premium_month" as const, features: ["15 course-creation credits", "Creator analytics", "Everything in Free"] },
  { name: "15-credit pack", price: "$6.99", note: "One-time purchase", product: "credits_15" as const, features: ["15 course-creation credits", "Credits do not expire", "No recurring charge"] },
];
export default function PricingPage() {
  return <div className="min-h-dvh bg-paper"><PublicHeader /><main className="mx-auto max-w-7xl px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
    <div className="mx-auto max-w-3xl text-center"><p className="section-label">Simple pricing</p><h1 className="display mt-4 text-[clamp(3.8rem,12vw,7rem)] leading-[.86]">Create first. Pay when you need more.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-ink-soft">Upload a book, PDF, notes, or training document. Turn it into an interactive course you can edit, study, and share.</p></div>
    <div className="mt-14 grid gap-5 lg:grid-cols-3">{plans.map((plan, index) => <article key={plan.name} className={`rounded-[1.7rem] border p-7 shadow-card sm:p-9 ${index === 1 ? "border-pine bg-pine text-white" : "border-line bg-card"}`}><p className={`text-xs font-bold uppercase tracking-[.16em] ${index === 1 ? "text-signal" : "text-teal"}`}>{plan.name}</p><p className="display mt-5 text-6xl">{plan.price}</p><p className={`mt-2 text-sm ${index === 1 ? "text-white/65" : "text-ink-soft"}`}>{plan.note}</p><ul className="mt-7 space-y-3 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-3"><span className={index === 1 ? "text-signal" : "text-teal"}>✓</span>{feature}</li>)}</ul><PricingAction product={plan.product}>{plan.product ? "Choose this option" : "Start free"}</PricingAction></article>)}</div>
    <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-ink-soft">Creator Pass is a 30-day access purchase, not an automatically recurring subscription. Currency is USD unless checkout states otherwise. A 5-credit pack is also available in Account for $2.99.</p>
  </main><PublicFooter /></div>;
}
