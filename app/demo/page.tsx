import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import CourseWorld from "@/components/CourseWorld";
import { publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "Interactive Document-to-Course Demo",
  description: "Try BookQuest's interactive course demo and Lumen, a passage-aware full-book experience that uses no AI credits while you read.",
  path: "/demo",
});

export default function DemoPage() {
  return <div className="min-h-dvh bg-paper">
    <PublicHeader />
    <main className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <section className="mt-8 grid overflow-hidden rounded-[2rem] bg-pine text-white shadow-pop lg:grid-cols-2">
        <CourseWorld seed="blacksteel-demo" title="The Blacksteel Shop Playbook" theme="workshop" progress={38} className="min-h-[25rem] lg:min-h-[38rem]" />
        <div className="flex flex-col justify-center p-8 sm:p-14">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-signal">Interactive demo</p>
          <h1 className="display mt-4 text-[clamp(3.5rem,10vw,6.5rem)] leading-[.86]">From shop manual to a course people finish.</h1>
          <p className="mt-6 text-base leading-7 text-white/72">See how a clothing retailer can turn onboarding and shop procedures into a clear journey with practical checks and proof of completion.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><Link href="/register" className="inline-flex min-h-12 w-fit items-center rounded-full bg-signal px-6 text-sm font-bold text-ink">Build yours free →</Link><Link href="/demo/reading-room" className="inline-flex min-h-12 w-fit items-center rounded-full border border-white/20 px-6 text-sm font-bold text-white hover:bg-white/10">Experience the Lumen reader</Link></div>
        </div>
      </section>
      <section className="mt-8 grid overflow-hidden rounded-[2rem] border border-line bg-card shadow-card lg:grid-cols-[.9fr_1.1fr]">
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-teal-deep">Lumen living reader</p>
          <h2 className="display mt-4 max-w-[11ch] text-[clamp(3.2rem,8vw,5.4rem)] leading-[.88]">The page notices where you are.</h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-ink-soft">A passage-aware focus light, cinematic chapter thresholds, and a visual Book Atlas turn the original full text into a room that quietly keeps pace. No rewritten words. No AI credits while reading.</p>
          <div className="mt-6 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-ink-soft"><span className="rounded-full border border-line px-3 py-2">Local passage resume</span><span className="rounded-full border border-line px-3 py-2">Reduced-motion safe</span><span className="rounded-full border border-line px-3 py-2">No AI reading credits</span></div>
          <Link href="/demo/reading-room" className="mt-7 inline-flex min-h-12 w-fit items-center rounded-full bg-forest px-6 text-sm font-bold text-white">Enter Lumen →</Link>
        </div>
        <div className="relative min-h-[25rem] border-t border-line lg:min-h-[34rem] lg:border-l lg:border-t-0">
          <CourseWorld seed="lumen-reader-demo" title="The Cartographer's Lantern" theme="forest" progress={42} className="!absolute !inset-0 !min-h-full rounded-none" />
          <div className="absolute inset-x-6 bottom-6 rounded-[1.4rem] border border-white/20 bg-pine/75 p-5 text-white shadow-pop backdrop-blur-xl sm:inset-x-auto sm:right-8 sm:w-[22rem]"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-signal">Passage 02 · Lumen active</p><p className="mt-3 font-[var(--font-longform)] text-xl leading-8">“The route was changing the quality of her attention.”</p></div>
        </div>
      </section>
      <section className="mx-auto mt-16 max-w-4xl">
        <p className="section-label">What BookQuest creates</p><h2 className="display mt-3 text-5xl">A useful first draft—not a black box.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">{[
          ["01", "Readable source", "Keep the original document beside the learning experience."],
          ["02", "Editable lessons", "Review concepts, examples, checks, and evidence before publishing."],
          ["03", "Easy sharing", "Share one polished page; learners start without a manual."],
        ].map(([number, title, copy]) => <article key={number} className="rounded-[1.4rem] border border-line bg-card p-6 shadow-card"><p className="display text-3xl text-teal/50">{number}</p><h3 className="mt-6 font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-ink-soft">{copy}</p></article>)}</div>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
