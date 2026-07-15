import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { SOLUTIONS } from "@/lib/marketing-content";
import { absoluteUrl, publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "Course Creation Guides and Resources",
  description: "Practical guidance for turning PDFs, policies, procedures, and expert material into reviewed courses, team training, and offline learning.",
  path: "/resources",
});

const guides = [
  { title: "How to turn a PDF into an interactive course", description: "A four-stage workflow for moving from source extraction to a reviewed public or assigned course.", href: "/solutions/pdf-to-course", tag: "Course creation" },
  { title: "How to review an AI-generated course", description: "Use source support, editing, preview, accessibility checks, and version approval before publishing.", href: "/solutions/ai-course-generator", tag: "Responsible AI" },
  { title: "How to create employee training from an SOP", description: "Organize approved procedures into assigned learning with teams, completion rules, and delivery evidence.", href: "/solutions/employee-training", tag: "Team training" },
  { title: "What policy-training evidence should preserve", description: "Understand the relationship between the source, course release, completion rule, assignment, and credential.", href: "/solutions/compliance-training", tag: "Evidence" },
  { title: "Planning learning for unreliable connectivity", description: "Distinguish what learners can prepare offline from the creation and administration work that still needs a connection.", href: "/solutions/offline-learning", tag: "Access" },
  { title: "Publishing a trustworthy creator library", description: "Build public course previews and a creator profile without hiding the review process behind generic AI claims.", href: "/solutions/course-creators", tag: "Creators" },
];

export default function ResourcesPage() {
  return <div className="min-h-dvh bg-paper">
    <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "BookQuest course creation resources", description: metadata.description as string, url: absoluteUrl("/resources"), hasPart: guides.map((guide) => ({ "@type": "WebPage", name: guide.title, url: absoluteUrl(guide.href) })) }} />
    <PublicHeader />
    <main className="mx-auto max-w-7xl px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
      <p className="section-label">Resources</p><h1 className="display mt-4 max-w-5xl text-[clamp(3.6rem,11vw,7rem)] leading-[.88]">Better courses begin with better questions.</h1><p className="mt-7 max-w-3xl text-lg leading-8 text-ink-soft">Explore practical paths for turning existing knowledge into learning that remains editable, reviewable, and useful.</p>
      <section className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-label="Practical guides">{guides.map((guide, index) => <Link key={guide.title} href={guide.href} className={`group flex min-h-80 flex-col rounded-[1.5rem] border border-line p-7 shadow-card transition-transform hover:-translate-y-1 ${index === 0 ? "bg-signal" : "bg-card"}`}><p className="text-[10px] font-bold uppercase tracking-[.17em] text-teal-deep">{guide.tag}</p><h2 className="display mt-12 text-3xl leading-none">{guide.title}</h2><p className="mt-4 text-sm leading-6 text-ink-soft">{guide.description}</p><span className="mt-auto pt-7 text-sm font-bold text-teal-deep">Read the guide →</span></Link>)}</section>
      <section className="mt-20 rounded-[1.8rem] bg-sky/75 p-8 sm:p-12"><p className="section-label">Browse by problem</p><div className="mt-6 flex flex-wrap gap-3">{SOLUTIONS.map((solution) => <Link key={solution.slug} href={`/solutions/${solution.slug}`} className="rounded-full border border-line-deep bg-card px-5 py-3 text-sm font-semibold hover:border-teal">{solution.eyebrow}</Link>)}</div></section>
    </main>
    <PublicFooter />
  </div>;
}

