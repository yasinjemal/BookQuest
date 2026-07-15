import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import {
  COURSE_ACCENT_HEX,
  DEFAULT_COURSE_APPEARANCE,
  type CourseAppearance,
} from "@/lib/course-appearance";

export default function CompletionMoment({
  course,
  lessonId,
  lessonTitle,
  nextLessonId,
  score,
  total,
  xp,
  streak,
  certificateId,
  concepts,
  appearance = DEFAULT_COURSE_APPEARANCE,
}: {
  course: { id: number; title: string };
  lessonId: number;
  lessonTitle: string;
  nextLessonId: number | null;
  score: number;
  total: number;
  xp: number;
  streak: number;
  certificateId?: string;
  concepts: string[];
  appearance?: CourseAppearance;
}) {
  return (
    <CourseAppearanceFrame appearance={appearance}>
    <div className="min-h-dvh bg-pine px-3 py-3 text-white sm:px-6 sm:py-6">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-forest shadow-pop sm:min-h-[calc(100dvh-3rem)] lg:grid-cols-[1.05fr_.95fr]">
        <CourseWorld seed={`${course.id}:${lessonId}:complete`} title={course.title} theme={appearance.worldTheme} accent={COURSE_ACCENT_HEX[appearance.accent]} progress={100} mood={appearance.atmosphere === "full" ? "bright" : "calm"} className="min-h-72 lg:min-h-full" />
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--course-highlight-on-primary)]">You have reached the next chapter</p>
          <h1 className="display mt-3 text-[clamp(3rem,10vw,5.5rem)] leading-[0.88]">Lesson complete.</h1>
          <p className="mt-4 text-lg font-semibold text-white">{lessonTitle}</p>
          {concepts.length > 0 && <section className="mt-7" aria-labelledby="concepts-discovered"><h2 id="concepts-discovered" className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">Ideas discovered</h2><ul className="mt-3 space-y-2">{concepts.slice(0, 3).map((concept) => <li key={concept} className="flex items-start gap-2 text-sm text-white/75"><AppIcon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-signal" />{concept}</li>)}</ul></section>}
          <dl className="mt-7 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-center min-[360px]:grid-cols-3">
            <div className="bg-pine/55 p-3"><dt className="text-xs uppercase tracking-wider text-white/70">Knowledge checks</dt><dd className="display mt-1 text-2xl">{score}/{total}</dd></div>
            <div className="bg-pine/55 p-3"><dt className="text-xs uppercase tracking-wider text-white/70">Progress added</dt><dd className="display mt-1 text-2xl">+{xp}</dd></div>
            <div className="bg-pine/55 p-3"><dt className="text-xs uppercase tracking-wider text-white/70">Days returning</dt><dd className="display mt-1 text-2xl">{streak}</dd></div>
          </dl>
          {certificateId && <Link href={`/cert/${certificateId}`} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-current/35 bg-white/5 px-5 py-3 text-sm font-semibold text-[var(--course-highlight-on-primary)]"><AppIcon name="shield" className="h-4 w-4" />View course credential</Link>}
          <Link href={nextLessonId ? `/lesson/${nextLessonId}` : `/course/${course.id}`} className="course-accent-button mt-3 inline-flex min-h-12 items-center justify-center gap-3 rounded-full px-6 py-3 text-sm font-bold">{nextLessonId ? "Travel to the next lesson" : "Return to the completed world"}<AppIcon name="arrow" className="h-4 w-4" /></Link>
          <Link href={`/course/${course.id}`} className="mt-3 inline-flex min-h-11 items-center justify-center text-sm font-semibold text-white/65 hover:text-white">View the journey map</Link>
        </div>
      </div>
    </div>
    </CourseAppearanceFrame>
  );
}
