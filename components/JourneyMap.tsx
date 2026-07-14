import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import CourseWorld, { resolveWorldTheme } from "@/components/CourseWorld";
import styles from "./JourneyMap.module.css";
import {
  COURSE_ACCENT_HEX,
  DEFAULT_COURSE_APPEARANCE,
  courseWorldLockCopy,
  type CourseWorldLockCopy,
  type CourseAppearance,
} from "@/lib/course-appearance";

export interface JourneyLesson {
  id: number;
  title: string;
  cardCount: number;
  completed: boolean;
}

export interface JourneyModule {
  id: number;
  title: string;
  summary: string;
  status: string;
  lessons: JourneyLesson[];
}

function LessonStop({ lesson, current, index, lockCopy }: { lesson: JourneyLesson; current: boolean; index: number; lockCopy: CourseWorldLockCopy }) {
  const future = !lesson.completed && !current;
  const state = lesson.completed ? "complete" : current ? "current" : "future";
  const content = <>
    <div className={styles.landmark} style={{ "--stop-offset": `${index % 2 === 0 ? -5 : 5}px` } as React.CSSProperties}>
      <AppIcon name={lesson.completed ? "check" : current ? "compass" : "lock"} className="h-4 w-4" />
    </div>
    <div className={styles.lessonCard}>
      <p className={`${styles.stateLabel} text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft`}>{lesson.completed ? "Discovered" : current ? "Your current location" : lockCopy.eyebrow}</p>
      <h3 className={`${styles.lessonTitle} mt-1 text-base font-semibold leading-snug text-ink sm:text-lg`}>{lesson.title}</h3>
      {future ? <p className={`${styles.lockHint} mt-2 text-xs text-ink-soft`}>{lockCopy.hint}</p> : <p className="mt-1 text-xs text-ink-soft">{lesson.cardCount} reading moment{lesson.cardCount === 1 ? "" : "s"}</p>}
    </div>
  </>;

  return (
    <li className={`${styles.stop} ${styles[state]}`}>
      {future ? <div className="contents" aria-label={`${lesson.title}, further along the path`} aria-disabled="true">{content}</div> : <Link href={`/lesson/${lesson.id}`} className="contents" aria-label={`${lesson.completed ? "Revisit" : "Continue"} ${lesson.title}`}>{content}</Link>}
    </li>
  );
}

export default function JourneyMap({ modules, courseId, courseTitle, appearance = DEFAULT_COURSE_APPEARANCE }: { modules: JourneyModule[]; courseId: string | number; courseTitle: string; appearance?: CourseAppearance }) {
  const firstIncomplete = modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed)?.id;
  const courseTheme = appearance.worldTheme ?? resolveWorldTheme(`${courseId}:${courseTitle}`);
  const accent = COURSE_ACCENT_HEX[appearance.accent];
  const lockCopy = courseWorldLockCopy(courseTheme);

  if (modules.length === 0) return <div className="rounded-[1.5rem] border border-line bg-card px-6 py-12 text-center shadow-card"><p className="section-label">The map is being drawn</p><h2 className="display mt-3 text-3xl">Your first region will appear here.</h2></div>;

  return (
    <div className="space-y-7" aria-label={`Journey map for ${courseTitle}`}>
      {modules.map((module, moduleIndex) => {
        const completed = module.lessons.filter((lesson) => lesson.completed).length;
        const progress = module.lessons.length > 0 ? Math.round((completed / module.lessons.length) * 100) : 0;
        return (
          <section key={module.id} className={styles.region} aria-labelledby={`region-${module.id}`}>
            <div className={`${styles.regionHeader} grid bg-pine text-white sm:grid-cols-[.8fr_1.2fr]`}>
              <CourseWorld seed={`${courseId}:${module.id}`} title={module.title} theme={courseTheme} accent={accent} progress={progress} mood={appearance.atmosphere === "quiet" ? "calm" : moduleIndex % 3 === 1 ? "dusk" : "calm"} className="min-h-36 sm:min-h-44" />
              <div className="flex flex-col justify-center p-5 sm:p-7">
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-signal">Region {moduleIndex + 1} · {completed}/{module.lessons.length} discovered</p>
                <h2 id={`region-${module.id}`} className="display mt-2 text-3xl leading-none sm:text-4xl">{module.title}</h2>
                {module.summary && <p className="mt-3 text-sm leading-6 text-white/70">{module.summary}</p>}
                {(module.status === "pending" || module.status === "generating") && <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-white/75"><span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />This region is still taking shape.</p>}
                {module.status === "error" && <p className="mt-3 text-xs font-semibold text-rose">This region could not be generated.</p>}
              </div>
            </div>
            <ol className={styles.route}>
              <svg className={styles.routeLine} viewBox="0 0 80 100" preserveAspectRatio="none" aria-hidden="true">
                <path className={styles.routeBase} pathLength="100" d="M40 0 C18 20 62 32 40 50 S18 78 40 100" />
                <path className={styles.routeDone} pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress} d="M40 0 C18 20 62 32 40 50 S18 78 40 100" />
              </svg>
              {module.lessons.map((lesson, index) => <LessonStop key={lesson.id} lesson={lesson} current={lesson.id === firstIncomplete} index={index} lockCopy={lockCopy} />)}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
