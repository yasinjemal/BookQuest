import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import type { SummaryListItem, SummaryStatus } from "@/lib/summary-types";

function normalizedStatus(status: SummaryStatus | string) {
  return String(status).trim().toLowerCase().replaceAll("_", " ");
}

export function summaryStatusLabel(status: SummaryStatus | string) {
  const value = normalizedStatus(status);
  if (value === "ready") return "Ready";
  if (value === "error" || value === "failed") return "Needs attention";
  if (value.includes("extract")) return "Opening source";
  if (value.includes("map") || value.includes("outline")) return "Mapping the book";
  if (value.includes("check") || value.includes("review")) return "Checking coverage";
  if (value.includes("generat") || value.includes("summar") || value.includes("writ")) return "Writing sections";
  return value || "Preparing";
}

export function isSummaryReady(status: SummaryStatus | string) {
  return normalizedStatus(status) === "ready";
}

export function isSummaryFailed(status: SummaryStatus | string) {
  const value = normalizedStatus(status);
  return value === "error" || value === "failed";
}

export default function SummaryGalleryCard({
  summary,
  readingProgress = 0,
}: {
  summary: SummaryListItem;
  readingProgress?: number;
}) {
  const ready = isSummaryReady(summary.status);
  const failed = isSummaryFailed(summary.status);
  const safeReadingProgress = Math.min(100, Math.max(0, Math.round(readingProgress)));
  const totalSections = Math.max(0, Number(summary.section_count) || 0);
  const readySections = Math.min(totalSections, Math.max(0, Number(summary.ready_section_count) || 0));
  const buildProgress = totalSections > 0 ? Math.round((readySections / totalSections) * 100) : 0;
  const progress = ready ? safeReadingProgress : buildProgress;
  const statusTone = failed
    ? "bg-no-soft text-no-deep"
    : ready
      ? "bg-go-soft text-go-deep"
      : "bg-sky text-ink";

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[1.4rem] border border-line bg-card shadow-card transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-line-deep hover:shadow-pop">
      <Link
        href={`/summary/${summary.id}`}
        aria-label={`Open the Deep Read for ${summary.title}`}
        className="relative block min-h-56 overflow-hidden bg-pine p-5 text-white"
      >
        <div className="absolute inset-0 opacity-35" aria-hidden="true" style={{ backgroundImage: "radial-gradient(circle at 82% 12%, rgba(216,255,99,.36), transparent 13rem), repeating-linear-gradient(115deg, transparent 0 28px, rgba(255,255,255,.05) 29px 30px)" }} />
        <div className="absolute inset-y-4 left-4 w-2 rounded-full bg-signal/75 shadow-[0_0_24px_rgba(216,255,99,.24)]" aria-hidden="true" />
        <div className="absolute -bottom-8 right-5 h-40 w-[72%] rotate-[-3deg] rounded-[1rem] border border-white/10 bg-white/[.07]" aria-hidden="true" />
        <div className="absolute -bottom-12 right-1 h-40 w-[72%] rotate-[3deg] rounded-[1rem] border border-white/10 bg-white/[.05]" aria-hidden="true" />

        <div className="relative z-10 flex h-full min-h-46 flex-col pl-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-sm">Deep Read</span>
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTone}`}>{summaryStatusLabel(summary.status)}</span>
          </div>
          <div className="mt-auto max-w-[19rem] pb-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-signal">Distilled from {Number(summary.source_chapter_count) || 0} source section{Number(summary.source_chapter_count) === 1 ? "" : "s"}</p>
            <h2 className="display mt-3 line-clamp-3 text-[clamp(2rem,6vw,3rem)] leading-[0.9] text-white">{summary.title}</h2>
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        {summary.description && <p className="line-clamp-2 text-sm leading-6 text-ink-soft">{summary.description}</p>}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-soft">
          {Number(summary.estimated_minutes) > 0 && <span className="inline-flex items-center gap-1.5"><AppIcon name="clock" className="h-3.5 w-3.5" />About {Number(summary.estimated_minutes)} min</span>}
          {totalSections > 0 && <span className="inline-flex items-center gap-1.5"><AppIcon name="bookmark" className="h-3.5 w-3.5" />{totalSections} section{totalSections === 1 ? "" : "s"}</span>}
          {summary.course_id && <span className="inline-flex items-center gap-1.5"><AppIcon name="trail" className="h-3.5 w-3.5" />Course available</span>}
        </div>

        <div className="mt-auto pt-5">
          <div className="mb-2 flex items-center justify-between gap-4 text-xs font-semibold text-ink-soft">
            <span>{failed ? "Generation stopped" : ready ? (progress >= 99 ? "Finished" : progress > 0 ? "Reading progress" : "Ready to begin") : `${readySections} of ${totalSections || "?"} sections ready`}</span>
            {!failed && <span>{progress}%</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={ready ? `Reading progress through ${summary.title}` : `Generation progress for ${summary.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className={`h-full rounded-full transition-[width] ${failed ? "bg-no" : ready ? "bg-teal" : "bg-dusk"}`} style={{ width: `${failed ? 100 : progress}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <Link href={`/summary/${summary.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white">
              {failed ? "View details" : ready ? (progress > 0 ? "Continue reading" : "Open Deep Read") : readySections > 0 ? "Read available sections" : "View progress"}
              <AppIcon name="arrow" className="h-4 w-4" />
            </Link>
            {summary.course_id && <Link href={`/course/${summary.course_id}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-deep px-4 py-2.5 text-sm font-semibold" aria-label={`Open the separate course for ${summary.title}`}>Course</Link>}
          </div>
          <p className="mt-3 truncate text-[10px] text-ink-soft" title={summary.source_filename}>{summary.source_filename}</p>
        </div>
      </div>
    </article>
  );
}
