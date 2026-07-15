import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import CourseWorld from "@/components/CourseWorld";
import { COURSE_ACCENT_HEX, type CourseAppearance } from "@/lib/course-appearance";
import { resolveCourseThemeDefinition } from "@/lib/course-themes";
import styles from "./CourseOverviewHero.module.css";

export default function CourseOverviewHero({
  courseId,
  title,
  description,
  appearance,
  progress,
  completedLessons,
  totalLessons,
  moduleCount,
  nextLessonId,
  sourceHref,
}: {
  courseId: string | number;
  title: string;
  description: string;
  appearance: CourseAppearance;
  progress: number;
  completedLessons: number;
  totalLessons: number;
  moduleCount: number;
  nextLessonId?: number;
  sourceHref?: string | null;
}) {
  const theme = resolveCourseThemeDefinition(appearance);
  return (
    <header className={styles.hero}>
      <CourseWorld seed={courseId} title={title} theme={appearance.worldTheme} accent={COURSE_ACCENT_HEX[appearance.accent]} progress={progress} mood={appearance.atmosphere === "full" ? "bright" : "calm"} className={styles.world} />
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.topline}>
        <Link href="/" className={styles.backLink}><span aria-hidden="true">←</span> Your worlds</Link>
        <span className={styles.themePill}><i aria-hidden="true" />{theme.name}</span>
      </div>
      <div className={styles.content}>
        <div className={styles.copy}>
          <p>Living story world · {moduleCount} regions</p>
          <h1 className="display">{title}</h1>
          <span>{description}</span>
          <div className={styles.actions}>
            {nextLessonId ? <Link href={`/lesson/${nextLessonId}`} className="course-accent-button">Continue journey <AppIcon name="arrow" className="h-4 w-4" /></Link> : totalLessons > 0 ? <Link href="#course-journey" className="course-accent-button">Review the map <AppIcon name="trail" className="h-4 w-4" /></Link> : null}
            {sourceHref !== null && <Link href={sourceHref ?? `/course/${courseId}/read`} className={styles.sourceLink}>Read source</Link>}
          </div>
        </div>
        <aside className={styles.progressCard} aria-label="Course progress">
          <div className={styles.progressTop}><span>Course progress</span><strong>{progress}<small>%</small></strong></div>
          <div className={styles.track} role="progressbar" aria-label={`Progress through ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
          <div className={styles.metrics}><span><strong>{completedLessons}</strong> lessons complete</span><span><strong>{Math.max(0, totalLessons - completedLessons)}</strong> remaining</span><span><strong>{totalLessons}</strong> total lessons</span></div>
        </aside>
      </div>
    </header>
  );
}
