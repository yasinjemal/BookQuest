"use client";

import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import LessonBlock from "@/components/LessonBlock";
import { BLOCK_CHANNELS, type BlockType } from "@/lib/block-registry";
import { BlockPresentationSchema } from "@/lib/block-presentation";
import type { CourseAppearance } from "@/lib/course-appearance";
import type { Card } from "@/lib/schemas";

interface PreviewBlock { id: string; blockType: BlockType; content: Record<string, unknown> }

function learnerCard(block: PreviewBlock): Card {
  const content = block.content;
  const parsedPresentation = BlockPresentationSchema.safeParse(content);
  const presentation = parsedPresentation.success ? parsedPresentation.data : {};
  if (block.blockType === "explanation") return { ...presentation, type: "concept", title: String(content.heading ?? content.title ?? "Key idea"), body: String(content.body ?? "") };
  if (block.blockType === "worked_example") return { ...presentation, type: "example", title: String(content.title ?? "Worked example"), body: [content.problem, ...(Array.isArray(content.steps) ? content.steps : []), content.result].filter(Boolean).join("\n\n") };
  if (block.blockType === "recap") return { ...presentation, type: "recap", title: String(content.heading ?? content.title ?? "Recap"), points: (content.points as string[]) ?? [] };
  if (block.blockType === "multiple_choice") return { ...presentation, type: "quiz_mcq", question: String(content.question ?? ""), options: (content.options as string[]) ?? [], correct_index: Number(content.correctIndex ?? content.correct_index ?? 0), explanation: String(content.explanation ?? ""), concept: String(content.concept ?? "") };
  if (block.blockType === "true_false") return { ...presentation, type: "quiz_truefalse", statement: String(content.statement ?? ""), answer: Boolean(content.answer), explanation: String(content.explanation ?? ""), concept: String(content.concept ?? "") };
  if (block.blockType === "fill_in") return { ...presentation, type: "quiz_fillblank", sentence: String(content.prompt ?? content.sentence ?? ""), answer: String(content.answer ?? ""), accepted_answers: (content.acceptedAnswers as string[]) ?? (content.accepted_answers as string[]) ?? [], explanation: String(content.explanation ?? ""), concept: String(content.concept ?? "") };
  return content as Card;
}

export default function StudioLessonPreview({ blocks, appearance, mode }: { blocks: PreviewBlock[]; appearance: CourseAppearance; mode: "mobile" | "desktop" | "offline" }) {
  return <CourseAppearanceFrame appearance={appearance} className={`course-page-bg mx-auto overflow-hidden rounded-[1.6rem] border border-line shadow-pop transition-all ${mode === "mobile" ? "max-w-[25rem]" : "max-w-4xl"}`}>
    <div className="border-b border-line bg-card/85 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">Learner preview · {mode}</div>
    <div className="space-y-6 p-4 sm:p-8">{blocks.map((block) => {
      const channel = BLOCK_CHANNELS[block.blockType];
      if (mode === "offline" && !channel.offline) return <article key={block.id} className="rounded-2xl border border-amber/40 bg-ivory p-6"><p className="text-xs font-bold uppercase tracking-wide text-rose">Offline alternative</p><p className="mt-2 text-sm leading-6">This media needs a connection. {channel.fallback ? "A text alternative will be shown to the learner." : "Ask the learner to reconnect."}</p></article>;
      return <LessonBlock key={block.id} card={learnerCard(block)} onAnswered={() => undefined} />;
    })}{blocks.length === 0 && <div className="rounded-2xl border border-dashed border-line-deep p-10 text-center text-sm text-ink-soft">Add the first block to see the learner experience.</div>}</div>
  </CourseAppearanceFrame>;
}
