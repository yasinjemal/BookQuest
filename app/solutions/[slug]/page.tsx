import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AppIcon from "@/components/AppIcon";
import JsonLd from "@/components/JsonLd";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { SOLUTION_BY_SLUG, SOLUTIONS } from "@/lib/marketing-content";
import { absoluteUrl, publicMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return SOLUTIONS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const solution = SOLUTION_BY_SLUG.get((await params).slug);
  if (!solution) return {};
  return publicMetadata({ title: solution.title, description: solution.description, path: `/solutions/${solution.slug}` });
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const solution = SOLUTION_BY_SLUG.get((await params).slug);
  if (!solution) notFound();
  const path = `/solutions/${solution.slug}`;
  const related = SOLUTIONS.filter((item) => item.slug !== solution.slug).slice(0, 3);
  return (
    <div className="min-h-dvh bg-paper">
      <JsonLd data={[
        { "@context": "https://schema.org", "@type": "WebPage", name: solution.title, description: solution.description, url: absoluteUrl(path), isPartOf: { "@type": "WebSite", name: "BookQuest", url: absoluteUrl("/") } },
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Solutions", item: absoluteUrl("/solutions") },
          { "@type": "ListItem", position: 3, name: solution.eyebrow, item: absoluteUrl(path) },
        ] },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: solution.faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) },
      ]} />
      <PublicHeader />
      <main>
        <section className="mx-auto max-w-7xl px-5 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-14">
          <nav className="text-xs font-semibold text-ink-soft" aria-label="Breadcrumb"><Link href="/solutions" className="hover:text-teal-deep">Solutions</Link><span aria-hidden="true"> / </span><span>{solution.eyebrow}</span></nav>
          <div className="mt-7 grid overflow-hidden rounded-[2rem] bg-pine text-white shadow-pop lg:grid-cols-[1.15fr_.85fr]">
            <div className="p-7 sm:p-12 lg:p-16">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-signal">{solution.eyebrow}</p>
              <h1 className="display mt-5 text-[clamp(3.5rem,10vw,6.8rem)] leading-[.87]">{solution.title}</h1>
              <p className="mt-7 max-w-3xl text-base leading-8 text-white/72 sm:text-lg">{solution.lead}</p>
              <div className="mt-9 flex flex-wrap gap-3"><Link href="/register" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-signal px-6 py-3 text-sm font-bold text-ink">Start free <AppIcon name="arrow" className="h-4 w-4" /></Link><Link href="/demo" className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold">See the demo</Link></div>
            </div>
            <div className="relative flex min-h-72 items-end overflow-hidden bg-teal/20 p-7 sm:p-10">
              <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-teal/40 blur-3xl" />
              <div className="relative rounded-[1.5rem] border border-white/15 bg-white/8 p-6 backdrop-blur">
                <AppIcon name="source" className="h-7 w-7 text-signal" />
                <p className="display mt-8 text-3xl">Source → draft → review → evidence</p>
                <p className="mt-3 text-sm leading-6 text-white/65">The document stays connected to the learning workflow.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:gap-16 lg:py-20">
          <div><p className="section-label">The problem</p><h2 className="display mt-4 text-5xl leading-[.95]">Information sent is not the same as learning completed.</h2></div>
          <p className="text-lg leading-8 text-ink-soft">{solution.problem}</p>
        </section>

        <section className="bg-card/75 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8"><p className="section-label">What changes</p><div className="mt-7 grid gap-5 md:grid-cols-3">{solution.benefits.map((benefit, index) => <article key={benefit.title} className="rounded-[1.5rem] border border-line bg-paper p-7"><span className="display text-4xl text-teal/45">0{index + 1}</span><h2 className="display mt-10 text-3xl">{benefit.title}</h2><p className="mt-3 text-sm leading-6 text-ink-soft">{benefit.body}</p></article>)}</div></div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
            <div><p className="section-label">The workflow</p><h2 className="display mt-4 text-5xl">A responsible path from source to learner.</h2><ol className="mt-8 space-y-5">{solution.steps.map((step, index) => <li key={step.title} className="flex gap-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{index + 1}</span><div><h3 className="font-bold">{step.title}</h3><p className="mt-1 text-sm leading-6 text-ink-soft">{step.body}</p></div></li>)}</ol></div>
            <div className="rounded-[1.75rem] bg-sky/75 p-7 sm:p-10"><p className="section-label">Built into BookQuest</p><ul className="mt-7 space-y-4">{solution.proof.map((item) => <li key={item} className="flex gap-3 text-sm font-semibold"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal text-white"><AppIcon name="check" className="h-3.5 w-3.5" /></span>{item}</li>)}</ul><p className="mt-8 border-t border-line-deep/60 pt-6 text-xs leading-5 text-ink-soft">Capabilities depend on deployment configuration and permissions. BookQuest does not replace professional, legal, or regulatory judgment.</p></div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 pb-20 sm:px-8 sm:pb-24"><p className="section-label">Questions</p><h2 className="display mt-3 text-5xl">Clear answers before you begin.</h2><div className="mt-8 divide-y divide-line border-y border-line">{solution.faq.map((item) => <details key={item.question} className="py-5"><summary className="min-h-11 text-base font-bold">{item.question}</summary><p className="max-w-3xl pb-2 pr-6 text-sm leading-7 text-ink-soft">{item.answer}</p></details>)}</div></section>

        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8"><div className="rounded-[1.8rem] bg-signal p-8 sm:p-12"><p className="section-label text-ink">Related solutions</p><div className="mt-6 grid gap-3 md:grid-cols-3">{related.map((item) => <Link key={item.slug} href={`/solutions/${item.slug}`} className="rounded-xl border border-ink/10 bg-white/40 p-5 font-bold hover:bg-white/65">{item.eyebrow}<span className="mt-2 block text-xs font-normal text-ink-soft">{item.description}</span></Link>)}</div></div></section>
      </main>
      <PublicFooter />
    </div>
  );
}

