import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "Accessibility Statement",
  description: "Read BookQuest's WCAG 2.2 Level AA target, built-in accessibility support, known open audit work, and remediation process.",
  path: "/accessibility",
});

export default function AccessibilityStatementPage() {
  return <div className="min-h-dvh bg-paper">
    <PublicHeader />
    <article className="mx-auto max-w-4xl space-y-8 px-5 pb-20 pt-10 sm:px-8 sm:pt-16">
      <header><p className="section-label">Accessibility</p><h1 className="display mt-4 text-[clamp(3.5rem,10vw,6rem)] leading-[.9]">Accessibility statement</h1><p className="mt-5 text-sm text-ink-soft">Last updated 13 July 2026</p></header>
      <section className="space-y-3"><h2 className="display text-4xl">Our target</h2><p className="text-sm leading-7 text-ink-soft">BookQuest is being built toward WCAG 2.2 Level AA across course creation, learning, assignment evidence, credential verification, and audit reporting. We do not yet claim full conformance: the complete institutional journey has not received its independent manual audit.</p></section>
      <section className="space-y-3"><h2 className="display text-4xl">Built-in support</h2><ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-ink-soft"><li>Keyboard-accessible native controls and visible labels for security and institutional workflows.</li><li>Responsive text-first layouts with status conveyed in words, not color alone.</li><li>Course block validation records accessibility metadata before publication.</li><li>Practical tasks can provide a text submission alternative.</li><li>Audit packs use high-contrast text, repeated headings, and readable page structure.</li></ul></section>
      <section className="space-y-3"><h2 className="display text-4xl">Known open work</h2><p className="text-sm leading-7 text-ink-soft">Screen-reader and keyboard testing of the full partner journey, zoom and reflow checks, reduced-motion review, captions and transcripts for future media, and remediation of audit findings remain release gates.</p></section>
      <section className="space-y-3"><h2 className="display text-4xl">Remediation process</h2><ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-ink-soft"><li>Report the page, task, assistive technology, and expected outcome to the organization administrator running the pilot.</li><li>The administrator records impact and provides an accessible alternative for time-sensitive work.</li><li>BookQuest triages blockers first, records the fix or transparent limitation, and retests with the affected user.</li><li>Unresolved gaps remain in the release record with an owner and target date; they are not represented as conformant.</li></ol></section>
    </article>
    <PublicFooter />
  </div>;
}

