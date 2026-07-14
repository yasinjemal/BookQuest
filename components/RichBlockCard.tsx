import type { ReactNode } from "react";
import type { Card } from "@/lib/schemas";
import AppIcon from "@/components/AppIcon";

export type RichCard = Exclude<Card, { type: "concept" | "example" | "recap" | "quiz_mcq" | "quiz_truefalse" | "quiz_fillblank" }>;

function BlockLabel({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "light" | "muted" }) {
  return <p className="rich-block-label" data-tone={tone}>{children}</p>;
}

export default function RichBlockCard({ card }: { card: RichCard }) {
  if (card.type === "image") return (
    <figure className="rich-block rich-block-media overflow-hidden border border-line bg-card">
      <img src={card.url} alt={card.decorative ? "" : card.altText} loading="lazy" decoding="async" className="max-h-[62dvh] w-full object-contain" />
      {card.caption && <figcaption className="border-t border-line px-5 py-3 text-xs leading-5 text-ink-soft">{card.caption}</figcaption>}
    </figure>
  );

  if (card.type === "audio_video") return (
    <article className="rich-block rich-block-media-stage overflow-hidden bg-pine text-white">
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
        <span className="grid h-11 w-11 place-items-center rounded-full border border-signal/35 bg-signal/10 text-signal"><AppIcon name="compass" className="h-5 w-5" /></span>
        <div><BlockLabel tone="light">Media stage</BlockLabel><h2 className="display mt-1 text-2xl leading-tight sm:text-3xl">{card.title}</h2></div>
        <a href={card.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-signal px-5 py-2.5 text-sm font-bold text-ink">Open media <AppIcon name="arrow" className="h-4 w-4" /></a>
      </div>
      {(card.transcript || card.captions) && <details className="border-t border-white/10 bg-white/5 px-5 py-4"><summary className="text-sm font-semibold text-white">Read {card.transcript ? "transcript" : "captions"}</summary><p className="reading mt-3 whitespace-pre-wrap text-white/75">{card.transcript || card.captions}</p></details>}
    </article>
  );

  if (card.type === "story") return (
    <article className="rich-block rich-block-quote relative overflow-hidden border border-line bg-card p-5 sm:p-7">
      <span className="rich-quote-mark" aria-hidden="true">“</span>
      <BlockLabel>Story / quote</BlockLabel>
      <h2 className="display relative mt-3 max-w-3xl text-[clamp(2rem,5vw,3.25rem)] leading-[.96]">{card.title}</h2>
      <p className="reading relative mt-5 max-w-3xl whitespace-pre-wrap">{card.body}</p>
    </article>
  );

  if (card.type === "flashcard") return (
    <article className="rich-block rich-block-glossary overflow-hidden border border-line bg-card" aria-label="Glossary flashcard">
      <div className="grid min-h-36 gap-4 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
        <div><BlockLabel>{card.frontLabel || "Glossary"}</BlockLabel><h2 className="display mt-4 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight">{card.front}</h2></div>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="bookmark" className="h-4 w-4" /></span>
      </div>
      <details className="border-t border-line bg-[color-mix(in_srgb,var(--course-accent)_7%,var(--course-canvas))] px-5 py-4 sm:px-6">
        <summary className="flex min-h-9 items-center justify-between gap-4 text-sm font-semibold"><span>Reveal {card.backLabel}</span><span className="grid h-7 w-7 place-items-center rounded-full bg-teal text-white" aria-hidden="true">+</span></summary>
        <p className="reading mt-4 border-t border-line pt-4">{card.back}</p>
      </details>
    </article>
  );

  if (card.type === "scenario") return (
    <article className="rich-block rich-block-case overflow-hidden border border-dusk/25 bg-card">
      <div className="bg-dusk px-5 py-4 text-white sm:px-6"><BlockLabel tone="light">Case study</BlockLabel><p className="mt-3 text-sm leading-6 text-white/82">{card.context}</p></div>
      <div className="p-5 sm:p-6"><h2 className="display text-[clamp(1.9rem,5vw,2.8rem)] leading-none">{card.decisionPrompt}</h2>{card.options && <ol className="mt-5 grid gap-2 sm:grid-cols-2">{card.options.map((option, index) => <li key={option} className="flex gap-3 rounded-xl border border-line bg-paper/55 p-3 text-sm leading-5"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-dusk text-[10px] font-bold text-white">{index + 1}</span>{option}</li>)}</ol>}{card.guidance && <details className="mt-5 rounded-xl bg-sky/45 p-4"><summary className="text-sm font-semibold">Consider the guidance</summary><p className="mt-3 text-sm leading-6 text-ink-soft">{card.guidance}</p></details>}</div>
    </article>
  );

  if (card.type === "practical_task") return (
    <article className="rich-block rich-block-challenge border border-amber/40 bg-[color-mix(in_srgb,var(--course-accent)_7%,var(--course-canvas))] p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber text-ink"><AppIcon name="trail" className="h-4 w-4" /></span><div><BlockLabel tone="muted">Challenge</BlockLabel><h2 className="display mt-1 text-3xl leading-none">{card.title}</h2></div></div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">{card.instructions.map((step, index) => <li key={step} className="flex gap-3 border-t border-amber/25 pt-3 text-sm leading-5"><span className="font-mono text-xs text-rose">{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}</ol>
      <div className="mt-5 border-t border-amber/25 pt-4 text-sm leading-6"><strong className="block text-[9px] uppercase tracking-[0.15em] text-ink-soft">Accessible alternative</strong><span className="mt-1 block">{card.submissionAlternative}</span></div>
    </article>
  );

  if (card.type === "discussion") return (
    <article className="rich-block rich-block-reflection border border-moss/30 bg-forest p-5 text-white sm:p-6">
      <div className="flex items-center gap-2 text-signal"><AppIcon name="people" className="h-4 w-4" /><BlockLabel tone="light">Reflection</BlockLabel></div>
      <h2 className="display mt-3 text-[clamp(2rem,5vw,3rem)] leading-[.98]">{card.prompt}</h2>
      <p className="mt-5 border-l border-white/15 pl-4 text-sm leading-6 text-white/70"><strong className="block text-white">Prefer to reflect privately?</strong>{card.privateAlternative}</p>
    </article>
  );

  if (card.type === "survey") return (
    <form className="rich-block rich-block-survey border border-line bg-card p-5 sm:p-6"><BlockLabel>Reflection</BlockLabel><h2 className="display mt-2 text-3xl leading-none">{card.title}</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">{card.questions.map((question) => <label key={question.id} className="block text-sm font-semibold">{question.label}<input aria-label={question.label} className="field mt-2" /></label>)}</div></form>
  );

  return (
    <label className="rich-block rich-block-note flex items-start gap-4 border border-dusk/30 bg-ivory p-5 sm:p-6">
      <input type="checkbox" required={card.required} className="mt-1 h-5 w-5 shrink-0" />
      <span><span className="flex items-center gap-2"><AppIcon name="shield" className="h-4 w-4 text-dusk" /><BlockLabel tone="muted">Creator note</BlockLabel></span><strong className="display mt-3 block text-2xl font-normal leading-tight">{card.statement}</strong><span className="mt-3 block text-sm leading-6 text-ink-soft">{card.consentLabel}</span></span>
    </label>
  );
}
