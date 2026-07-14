import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import CourseWorld, { resolveWorldTheme } from "@/components/CourseWorld";
import styles from "./JourneyMap.module.css";
import { COURSE_ACCENT_HEX, DEFAULT_COURSE_APPEARANCE, courseWorldLockCopy, type CourseWorldLockCopy, type CourseAppearance } from "@/lib/course-appearance";

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

function LessonStop({ lesson, current, lockCopy }: { lesson: JourneyLesson; current: boolean; lockCopy: CourseWorldLockCopy }) {
  const future = !lesson.completed && !current;
  const state = lesson.completed ? "complete" : current ? "current" : "future";
  const content = <>
    <div className={styles.landmark}><AppIcon name={lesson.completed ? "check" : current ? "compass" : "lock"} className="h-4 w-4" /></div>
    <div className={styles.lessonCard}>
      <p className={styles.stateLabel}>{lesson.completed ? "Discovered" : current ? "Current lesson" : lockCopy.eyebrow}</p>
      <h3 className={styles.lessonTitle}>{lesson.title}</h3>
      {future ? <p className={styles.lockHint}>{lockCopy.hint}</p> : <p className={styles.cardCount}>{lesson.cardCount} learning block{lesson.cardCount === 1 ? "" : "s"}</p>}
    </div>
  </>;

  return (
    <li className={`${styles.stop} ${styles[state]}`}>
      {future ? <div className={styles.lessonLink} aria-label={`${lesson.title}, further along the path`} aria-disabled="true">{content}</div> : <Link href={`/lesson/${lesson.id}`} className={styles.lessonLink} aria-label={`${lesson.completed ? "Revisit" : "Continue"} ${lesson.title}`}>{content}</Link>}
    </li>
  );
}

export default function JourneyMap({ modules, courseId, courseTitle, appearance = DEFAULT_COURSE_APPEARANCE }: { modules: JourneyModule[]; courseId: string | number; courseTitle: string; appearance?: CourseAppearance }) {
  const firstIncomplete = modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed)?.id;
  const courseTheme = appearance.worldTheme ?? resolveWorldTheme(`${courseId}:${courseTitle}`);
  const accent = COURSE_ACCENT_HEX[appearance.accent];
  const lockCopy = courseWorldLockCopy(courseTheme);
  const activeModuleId = modules.find((module) => module.lessons.some((lesson) => lesson.id === firstIncomplete))?.id;

  if (modules.length === 0) return <div className="border border-line bg-card px-6 py-12 text-center shadow-card" style={{ borderRadius: "var(--course-card-radius)" }}><p className="section-label">The map is being drawn</p><h2 className="display mt-3 text-3xl">Your first region will appear here.</h2></div>;

  return (
    <div className={styles.atlas} aria-label={`Journey map for ${courseTitle}`}>
      {modules.map((module, moduleIndex) => {
        const completed = module.lessons.filter((lesson) => lesson.completed).length;
        const progress = module.lessons.length > 0 ? Math.round((completed / module.lessons.length) * 100) : 0;
        return (
          <section key={module.id} className={styles.region} data-active={module.id === activeModuleId ? "true" : "false"} aria-labelledby={`region-${module.id}`}>
            <div className={styles.regionHeader}>
              <CourseWorld seed={`${courseId}:${module.id}`} title={module.title} theme={courseTheme} accent={accent} progress={progress} mood={appearance.atmosphere === "quiet" ? "calm" : moduleIndex % 3 === 1 ? "dusk" : "calm"} className={styles.regionWorld} />
              <div className={styles.regionCopy}>
                <p>Region {String(moduleIndex + 1).padStart(2, "0")} · {completed}/{module.lessons.length}</p>
                <h2 id={`region-${module.id}`} className="display">{module.title}</h2>
                {module.summary && <span>{module.summary}</span>}
                {(module.status === "pending" || module.status === "generating") && <small><i />Still taking shape.</small>}
                {module.status === "error" && <small>This region could not be generated.</small>}
              </div>
            </div>
            <ol className={styles.route}>{module.lessons.map((lesson) => <LessonStop key={lesson.id} lesson={lesson} current={lesson.id === firstIncomplete} lockCopy={lockCopy} />)}</ol>
          </section>
        );
      })}
    </div>
  );
}
