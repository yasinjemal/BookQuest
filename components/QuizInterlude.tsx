"use client";

import Link from "next/link";
import AppIcon from "@/components/AppIcon";
import CourseWorld from "@/components/CourseWorld";
import QuizCard from "@/components/QuizCard";
import { COURSE_ACCENT_HEX, type CourseAppearance } from "@/lib/course-appearance";
import type { QuizAnswerResult, QuizCard as QuizCardType } from "@/lib/learning-types";
import styles from "./QuizInterlude.module.css";

export default function QuizInterlude({
  card,
  result,
  appearance,
  seed,
  lessonTitle,
  questionNumber,
  totalQuestions,
  momentNumber,
  totalMoments,
  progress,
  backHref,
  onBack,
  onAnswered,
  onContinue,
  isLastMoment,
  saving,
  error,
}: {
  card: QuizCardType;
  result?: QuizAnswerResult;
  appearance: CourseAppearance;
  seed: string;
  lessonTitle: string;
  questionNumber: number;
  totalQuestions: number;
  momentNumber: number;
  totalMoments: number;
  progress: number;
  backHref: string;
  onBack?: () => void;
  onAnswered: (result: QuizAnswerResult) => void;
  onContinue: () => void;
  isLastMoment: boolean;
  saving: boolean;
  error?: string | null;
}) {
  const outcome = result?.correct ? "correct" : result ? "incorrect" : "unanswered";
  const headline = result?.correct
    ? "That idea is yours to carry."
    : result
      ? "A correction is still progress."
      : "Close the loop from memory.";

  return <main id="lesson-moment" className={styles.stage} data-outcome={outcome}>
    <CourseWorld seed={`${seed}:quiz:${questionNumber}`} title={lessonTitle} theme={appearance.worldTheme} accent={COURSE_ACCENT_HEX[appearance.accent]} progress={progress} mood="calm" className={styles.world} />
    <div className={styles.veil} aria-hidden="true" />
    <div className={styles.orbitOne} aria-hidden="true" />
    <div className={styles.orbitTwo} aria-hidden="true" />

    <div className={styles.inner}>
      <div className={styles.stageTop}>
        {onBack
          ? <button type="button" onClick={onBack} className={styles.backAction}><AppIcon name="arrow" className={styles.backIcon} />Back to the lesson</button>
          : <Link href={backHref} className={styles.backAction}><AppIcon name="arrow" className={styles.backIcon} />Journey map</Link>}
        <div className={styles.questionProgress} aria-label={`Question ${questionNumber} of ${totalQuestions}`}>
          <span>Checkpoint {questionNumber} of {totalQuestions}</span>
          <div aria-hidden="true">{Array.from({ length: totalQuestions }, (_, index) => <i key={index} data-state={index + 1 < questionNumber ? "complete" : index + 1 === questionNumber ? "current" : "future"} />)}</div>
        </div>
      </div>

      <header className={styles.intro}>
        <p><AppIcon name="compass" className="h-4 w-4" />Recall gate · Moment {momentNumber} of {totalMoments}</p>
        <h1 className="display">{headline}</h1>
        <span>{result
          ? result.correct ? "You found the signal without the source beside you." : "Read the connection, then carry it into the next moment."
          : "The reading has stepped out of sight on purpose. Choose what stayed with you."}</span>
      </header>

      <div className={styles.quizFrame}>
        <QuizCard card={card} variant="interlude" answerResult={result} onAnswered={onAnswered} />
      </div>

      <footer className={styles.stageFooter}>
        {result ? <div className={styles.outcome}><span data-correct={result.correct}><AppIcon name={result.correct ? "check" : "spark"} className="h-4 w-4" /></span><p><strong>{result.correct ? "Checkpoint cleared" : "Connection restored"}</strong><small>{result.correct ? "Ready for the next part of the path." : "The explanation is now part of the journey."}</small></p></div> : <p className={styles.waiting}><span />Select an answer, then lock it in. Keyboard shortcuts work too.</p>}
        <button type="button" onClick={onContinue} disabled={!result || saving} className={`${styles.continueAction} course-accent-button`}>{saving ? "Saving your progress…" : isLastMoment ? "Complete lesson" : result?.correct ? "Continue the journey" : "Carry the correction forward"}<AppIcon name="arrow" className="h-4 w-4" /></button>
      </footer>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  </main>;
}
