import type { Metadata } from "next";
import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import JsonLd from "@/components/JsonLd";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { absoluteUrl, publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "How BookQuest Turns Documents Into Courses",
  description: "See how BookQuest moves from a trusted PDF or document to an editable draft, human review, publication, learner progress, and verifiable evidence.",
  path: "/how-it-works",
});

const steps = [
  { icon: "source" as const, title: "Bring a trusted source", body: "Upload a PDF, DOCX, PPTX, Markdown file, or text document. The source becomes part of the course workspace, not a disposable prompt." },
  { icon: "spark" as const, title: "Create the first draft", body: "Build manually or use optional AI assistance to propose a course structure, lessons, and learning activities." },
  { icon: "create" as const, title: "Review in Studio", body: "Edit each block, read the source beside your work, connect supporting sections, check quality signals, and preview the learner experience." },
  { icon: "layers" as const, title: "Publish a reviewed version", body: "Keep drafts separate from published material. Release the version you approve publicly or inside a controlled organization space." },
  { icon: "trail" as const, title: "Guide the learner", body: "Learners move through lessons, activities, practice, progress, and supported offline experiences without losing the course context." },
  { icon: "shield" as const, title: "Keep useful evidence", body: "Tie completion, credentials, and institutional records to the applicable course and rule versions so the result can be reviewed later." },
];

export default function HowItWorksPage() {
  return <div className="min-h-dvh bg-paper">
    <JsonLd data={{ "@context": "https://schema.org", "@type": "HowTo", name: "How to turn a trusted document into a course with BookQuest", description: metadata.description as string, url: absoluteUrl("/how-it-works"), step: steps.map((step, index) => ({ "@type": "HowToStep", position: index + 1, name: step.title, text: step.body })) }} />
    <PublicHeader />
    <main>
      <section className="mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-16"><p className="section-label">How it works</p><h1 className="display mt-4 max-w-5xl text-[clamp(3.6rem,11vw,7rem)] leading-[.87]">From trusted source to learning you can stand behind.</h1><p className="mt-7 max-w-3xl text-lg leading-8 text-ink-soft">BookQuest separates fast drafting from responsible publishing. The source, human review, learner journey, and evidence each have a clear place.</p></section>
      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 sm:pb-28"><ol className="grid gap-px overflow-hidden rounded-[1.8rem] border border-line bg-line md:grid-cols-2">{steps.map((step, index) => <li key={step.title} className={`min-h-80 p-7 sm:p-9 ${index === 0 ? "bg-signal" : index === 3 ? "bg-sky" : "bg-card"}`}><div className="flex items-center justify-between"><AppIcon name={step.icon} className="h-6 w-6" /><span className="display text-4xl text-ink/25">0{index + 1}</span></div><h2 className="display mt-16 text-4xl">{step.title}</h2><p className="mt-4 max-w-xl text-sm leading-7 text-ink-soft">{step.body}</p></li>)}</ol></section>
      <section className="bg-pine text-white"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.2fr_.8fr]"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-signal">Two paths to begin</p><h2 className="display mt-4 text-5xl sm:text-6xl">Use AI when it helps. Work manually when it should not.</h2><p className="mt-6 max-w-2xl text-base leading-8 text-white/68">Generation capability is explicit. When it is unavailable or inappropriate, BookQuest still opens an editable source-backed draft instead of blocking the creation workflow.</p></div><div className="flex flex-col justify-center gap-3"><Link href="/register" className="inline-flex min-h-12 items-center justify-center rounded-full bg-signal px-6 py-3 text-sm font-bold text-ink">Create your first course</Link><Link href="/solutions/ai-course-generator" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold">Read about responsible AI drafting</Link></div></div></section>
    </main>
    <PublicFooter />
  </div>;
}

