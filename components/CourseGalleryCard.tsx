import Link from "next/link";
import type { ReactNode } from "react";
import AppIcon from "@/components/AppIcon";
import CourseWorld, { type WorldTheme } from "@/components/CourseWorld";

export default function CourseGalleryCard({
  id,
  title,
  description,
  category,
  creator,
  totalLessons,
  learnerCount,
  progress,
  status,
  theme,
  action,
  className = "",
}: {
  id: number | string;
  title: string;
  description?: string | null;
  category?: string | null;
  creator?: string | null;
  totalLessons?: number;
  learnerCount?: number;
  progress?: number;
  status?: string;
  theme?: WorldTheme | string;
  action?: ReactNode;
  className?: string;
}) {
  const safeProgress = progress === undefined ? undefined : Math.min(100, Math.max(0, progress));
  return (
    <article className={`group overflow-hidden rounded-[1.4rem] border border-line bg-card shadow-card transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-line-deep hover:shadow-pop ${className}`}>
      <Link href={`/course/${id}`} aria-label={`Open ${title}`} className="relative block min-h-44 overflow-hidden">
        <CourseWorld seed={id} title={title} theme={theme} progress={safeProgress ?? 0} className="absolute inset-0" />
        <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-4">
          {category && <span className="rounded-full border border-white/15 bg-pine/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-white backdrop-blur-sm">{category}</span>}
          {status && <span className="rounded-full bg-ivory/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink">{status.replaceAll("_", " ")}</span>}
        </div>
        <span className="absolute bottom-4 right-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-pine/55 text-white backdrop-blur-sm transition-transform group-hover:translate-x-0.5" aria-hidden="true"><AppIcon name="arrow" className="h-4 w-4" /></span>
      </Link>
      <div className="p-5">
        <h3 className="display text-[1.9rem] leading-[1.02]"><Link href={`/course/${id}`} className="decoration-teal/40 underline-offset-4 hover:underline">{title}</Link></h3>
        {description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-soft">{description}</p>}
        {(creator || totalLessons !== undefined || (learnerCount !== undefined && learnerCount > 0)) && <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-soft">
          {creator && <span>By {creator}</span>}
          {totalLessons !== undefined && <span className="inline-flex items-center gap-1.5"><AppIcon name="layers" className="h-3.5 w-3.5" />{totalLessons} lesson{totalLessons === 1 ? "" : "s"}</span>}
          {learnerCount !== undefined && learnerCount > 0 && <span className="inline-flex items-center gap-1.5"><AppIcon name="people" className="h-3.5 w-3.5" />{learnerCount} learner{learnerCount === 1 ? "" : "s"}</span>}
        </div>}
        {safeProgress !== undefined && <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-4 text-[11px] font-semibold text-ink-soft"><span>{safeProgress === 100 ? "Journey complete" : "Distance travelled"}</span><span>{safeProgress}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`Progress through ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeProgress}>
            <div className="h-full rounded-full bg-teal" style={{ width: `${safeProgress}%` }} />
          </div>
        </div>}
        {action && <div className="mt-5 border-t border-line pt-4">{action}</div>}
      </div>
    </article>
  );
}
