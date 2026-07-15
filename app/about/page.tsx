import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { absoluteUrl, publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "About BookQuest",
  description: "BookQuest is a source-backed learning platform built to turn trusted documents into editable courses, deliberate practice, and reviewable evidence.",
  path: "/about",
});

export default function AboutPage() {
  return <div className="min-h-dvh bg-paper">
    <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", name: "BookQuest", url: absoluteUrl("/"), logo: absoluteUrl("/icon.svg"), description: metadata.description as string, foundingLocation: { "@type": "Country", name: "South Africa" }, knowsAbout: ["document-to-course creation", "source-backed learning", "online course authoring", "learning evidence"] }} />
    <PublicHeader />
    <main>
      <section className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16"><p className="section-label">About BookQuest</p><h1 className="display mt-4 max-w-5xl text-[clamp(3.7rem,11vw,7.2rem)] leading-[.87]">Useful knowledge deserves more than an attachment.</h1><p className="mt-8 max-w-3xl text-lg leading-8 text-ink-soft">BookQuest is being built in South Africa for creators, learners, and organizations that need to turn trusted material into learning without losing the source, human judgment, or evidence behind it.</p></section>
      <section className="bg-pine text-white"><div className="mx-auto grid max-w-7xl gap-px px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-3">{[
        ["Source before spectacle", "A beautiful course still needs a trustworthy foundation. Documents and supporting sections remain part of the review workflow."],
        ["Human review before release", "AI can accelerate a draft, but a creator must be able to edit, inspect, and approve what learners receive."],
        ["Evidence without overclaiming", "Learning records should be scoped, versioned, and verifiable. They should not pretend that a click proves every kind of competence."],
      ].map(([title, body]) => <article key={title} className="border-white/10 p-7 md:border-l md:first:border-l-0"><h2 className="display text-4xl text-signal">{title}</h2><p className="mt-5 text-sm leading-7 text-white/68">{body}</p></article>)}</div></section>
      <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20"><div><p className="section-label">What we are solving</p><h2 className="display mt-4 text-5xl">Close the distance between having information and being able to use it.</h2></div><div className="space-y-5 text-base leading-8 text-ink-soft"><p>Books, policies, manuals, and presentations carry valuable knowledge, but sending the file does not create understanding. Course builders then repeat the work by copying material into disconnected tools.</p><p>BookQuest gives that material a structured path: editable lessons, learning activities, source review, deliberate practice, delivery controls, progress, credentials, and supported offline access.</p><p>The product does not claim that automation replaces subject experts, educators, auditors, or legal judgment. Its purpose is to make their work clearer, faster, and easier to examine.</p></div></section>
      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8"><div className="rounded-[1.8rem] bg-signal p-8 sm:p-12"><h2 className="display text-5xl">See the product, then judge the method.</h2><div className="mt-7 flex flex-wrap gap-3"><Link href="/how-it-works" className="rounded-full bg-ink px-6 py-3 text-sm font-bold text-white">How BookQuest works</Link><Link href="/security" className="rounded-full border border-ink/20 px-6 py-3 text-sm font-bold">Read the security summary</Link><Link href="/demo" className="rounded-full border border-ink/20 px-6 py-3 text-sm font-bold">Open the demo</Link></div></div></section>
    </main>
    <PublicFooter />
  </div>;
}

