import type { Metadata } from "next";
import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import JsonLd from "@/components/JsonLd";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { SOLUTIONS } from "@/lib/marketing-content";
import { absoluteUrl, publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "Document-to-Course Solutions",
  description: "See how BookQuest turns PDFs, policies, manuals, books, and presentations into source-backed courses for creators, teams, and offline learners.",
  path: "/solutions",
});

export default function SolutionsPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "BookQuest solutions", description: metadata.description as string, url: absoluteUrl("/solutions") }} />
      <PublicHeader />
      <main>
        <section className="mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-16">
          <p className="section-label">Solutions</p>
          <h1 className="display mt-4 max-w-5xl text-[clamp(3.5rem,11vw,7rem)] leading-[.88]">Make important documents useful after they are sent.</h1>
          <p className="mt-7 max-w-3xl text-base leading-8 text-ink-soft sm:text-lg">BookQuest turns trusted source material into editable learning journeys. Choose the problem closest to yours.</p>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SOLUTIONS.map((solution, index) => (
              <Link key={solution.slug} href={`/solutions/${solution.slug}`} className={`group flex min-h-80 flex-col rounded-[1.6rem] border border-line p-7 shadow-card transition-transform hover:-translate-y-1 ${index === 0 ? "bg-signal" : index === 1 ? "bg-pine text-white" : "bg-card"}`}>
                <AppIcon name={index === 2 || index === 3 ? "people" : index === 5 ? "download" : "source"} className="h-6 w-6" />
                <p className={`mt-16 text-[10px] font-bold uppercase tracking-[.17em] ${index === 1 ? "text-signal" : "text-teal-deep"}`}>{solution.eyebrow}</p>
                <h2 className="display mt-3 text-3xl leading-none">{solution.title}</h2>
                <span className={`mt-auto pt-7 text-sm font-bold ${index === 1 ? "text-signal" : "text-teal-deep"}`}>See how it works →</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

