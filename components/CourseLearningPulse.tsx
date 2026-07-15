import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import styles from "./CourseLearningPulse.module.css";

export interface CourseLearningPulseData {
  conceptCount: number;
  avgMastery: number | null;
  weakest: { concept: string; mastery: number }[];
  dueReviews: number;
}

export default function CourseLearningPulse({ courseId, learning }: { courseId: string | number; learning: CourseLearningPulseData }) {
  const masteryPercent = learning.avgMastery === null ? null : Math.round(learning.avgMastery * 100);
  const actionHref = learning.dueReviews > 0 ? "/review/session" : learning.conceptCount > 0 ? `/review/practice/${courseId}` : "#course-journey";
  const actionLabel = learning.dueReviews > 0
    ? `Review ${learning.dueReviews} due question${learning.dueReviews === 1 ? "" : "s"}`
    : learning.conceptCount > 0
      ? "Practice weaker concepts"
      : "Start a lesson";

  return (
    <section className={styles.pulse} aria-labelledby="learning-pulse-heading">
      <div className={styles.intro}>
        <span className={styles.icon}><AppIcon name="practice" className="h-5 w-5" /></span>
        <div>
          <p>Learning pulse</p>
          <h2 id="learning-pulse-heading" className="display">Keep what you learn active.</h2>
          <span>{learning.conceptCount > 0 ? "Short reviews return at useful intervals and adapt to the concepts that need more work." : "Complete a knowledge check to begin your personal review schedule."}</span>
        </div>
      </div>

      <div className={styles.status}>
        <div className={styles.mastery}>
          <span>Current mastery</span>
          <strong>{masteryPercent === null ? "Building" : `${masteryPercent}%`}</strong>
          <div role="progressbar" aria-label="Average concept mastery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={masteryPercent ?? 0}><span style={{ width: `${masteryPercent ?? 0}%` }} /></div>
        </div>

        {learning.weakest.length > 0 && <ul aria-label="Concepts to strengthen">
          {learning.weakest.map((item) => <li key={item.concept}><span>{item.concept}</span><strong>{Math.round(item.mastery * 100)}%</strong></li>)}
        </ul>}

        <Link href={actionHref} className="course-accent-button">{actionLabel}<AppIcon name="arrow" className="h-4 w-4" /></Link>
      </div>
    </section>
  );
}
