import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import { readingAppearance, READING_VIBES } from "@/lib/reading-vibe";
import type { ReadingEditionListItem } from "@/lib/reading-types";

export default function ReadingEditionCard({ book }: { book: ReadingEditionListItem }) {
  const progress = Math.round(book.progress?.overallProgress ?? 0);
  const remaining = Math.max(1, Math.ceil(book.estimatedMinutes * (1 - progress / 100)));
  const vibe = READING_VIBES[book.vibeId];
  return <CourseAppearanceFrame appearance={readingAppearance(book.vibeId, "auto")} className="h-full rounded-[1.4rem]">
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[1.4rem] border border-line bg-card shadow-card transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-line-deep hover:shadow-pop">
      <Link href={`/book/${book.id}`} aria-label={`Open the full book ${book.title}`} className="relative block min-h-64 overflow-hidden bg-pine text-white">
        <CourseWorld seed={`${book.id}:${book.title}`} theme={vibe.appearance.worldTheme} title={book.title} progress={progress} className="absolute inset-0 min-h-full rounded-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/10" aria-hidden="true" />
        <div className="relative z-10 flex min-h-64 flex-col p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[.15em] backdrop-blur">Full book</span>
            <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[10px] font-bold backdrop-blur">{vibe.name}</span>
          </div>
          <div className="mt-auto max-w-[20rem]">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/70">A BookQuest Reading Edition</p>
            <h2 className="display mt-3 line-clamp-3 text-[clamp(2.35rem,7vw,3.6rem)] leading-[.88] text-white">{book.title}</h2>
          </div>
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs leading-5 text-ink-soft">{vibe.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><AppIcon name="clock" className="h-3.5 w-3.5" />{progress > 0 ? `About ${remaining} min left` : `About ${book.estimatedMinutes} min`}</span>
          <span className="inline-flex items-center gap-1.5"><AppIcon name="bookmark" className="h-3.5 w-3.5" />{book.sourceChapterCount} {book.unitKind === "page" ? "pages" : book.unitKind === "chapter" ? "chapters" : "sections"}</span>
        </div>
        <div className="mt-auto pt-5">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink-soft"><span>{progress >= 99 ? "Finished" : progress > 0 ? "Reading progress" : "Ready to begin"}</span><span>{progress}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`Reading progress through ${book.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-teal transition-[width]" style={{ width: `${progress}%` }} /></div>
          <Link href={`/book/${book.id}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white">{progress > 0 && progress < 99 ? "Continue reading" : progress >= 99 ? "Read again" : "Open full book"}<AppIcon name="arrow" className="h-4 w-4" /></Link>
          <p className="mt-3 truncate text-[10px] text-ink-soft" title={book.sourceFilename}>{book.sourceFilename}</p>
        </div>
      </div>
    </article>
  </CourseAppearanceFrame>;
}
