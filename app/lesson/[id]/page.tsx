"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CompletionMoment from "@/components/CompletionMoment";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import LessonBlock from "@/components/LessonBlock";
import Loading from "@/components/Loading";
import type { Card } from "@/lib/schemas";
import type { QuizAnswerResult } from "@/lib/learning-types";
import { flushAnswerOutbox, setAnswerOutboxAccount, startAnswerOutboxSync, submitAnswer, submitLessonCompletion } from "@/lib/answer-outbox";
import { COURSE_ACCENT_HEX, DEFAULT_COURSE_APPEARANCE, courseWorldLockCopy, type CourseAppearance } from "@/lib/course-appearance";
import { buildLessonMoments, isLessonQuiz, lessonBlockMeta } from "@/lib/lesson-layout";
import styles from "./LessonPage.module.css";

interface LessonData {
  id: number;
  module_id: number;
  title: string;
  cards: Card[];
  answerSessionId: string;
  viewerId: number;
  course: { id: number; title: string; appearance: CourseAppearance };
  moduleTitle: string;
  position: number;
  totalLessons: number;
  nextLessonId: number | null;
}

function discoveredConcepts(cards: Card[]) {
  const titles = cards.flatMap((card) => {
    if (card.type === "concept" || card.type === "example" || card.type === "story") return [card.title];
    if (isLessonQuiz(card)) return card.concept ? [card.concept] : [];
    return [];
  });
  return [...new Set(titles)];
}

function scrollToMoment() {
  requestAnimationFrame(() => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById("lesson-moment")?.scrollIntoView({ behavior, block: "start" });
  });
}

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [momentIndex, setMomentIndex] = useState(0);
  const [results, setResults] = useState<Record<number, QuizAnswerResult>>({});
  const [finished, setFinished] = useState<{ xp: number; streak: number; certificateId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(false);
    fetch(`/api/lessons/${id}`)
      .then((response) => {
        if (response.status === 401) {
          window.location.href = "/login";
          return null;
        }
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.viewerId) setAnswerOutboxAccount(data.viewerId);
        setLesson(data);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => startAnswerOutboxSync(), []);

  const moments = useMemo(() => buildLessonMoments(lesson?.cards ?? []), [lesson]);
  const quizIndexes = useMemo(() => lesson ? lesson.cards.map((card, cardIndex) => isLessonQuiz(card) ? cardIndex : -1).filter((cardIndex) => cardIndex >= 0) : [], [lesson]);

  async function finish() {
    if (!lesson || saving) return;
    setSaving(true);
    setFinishError(null);
    await flushAnswerOutbox();
    const { delivered, data } = await submitLessonCompletion({ lessonId: lesson.id, answerSessionId: lesson.answerSessionId });
    if (delivered && data) {
      setFinished({ xp: data.xp ?? 0, streak: data.stats?.streak ?? 0, certificateId: data.certificate?.id });
    } else {
      setFinishError("Saved offline — this lesson will finish automatically once you are back online.");
    }
    setSaving(false);
  }

  function advance() {
    if (!lesson || moments.length === 0) return;
    if (momentIndex + 1 >= moments.length) void finish();
    else {
      setMomentIndex((current) => current + 1);
      scrollToMoment();
    }
  }

  function goBack() {
    setMomentIndex((current) => Math.max(0, current - 1));
    scrollToMoment();
  }

  if (loadError) return <div className="min-h-dvh bg-paper px-6 py-20 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-no-soft text-no"><AppIcon name="compass" className="h-5 w-5" /></span><h1 className="display mt-5 text-4xl">This lesson could not be opened.</h1><Link href="/" className="btn-primary mt-6">Return home</Link></div>;
  if (!lesson) return <Loading label="Opening this lesson…" />;

  if (finished) {
    const score = quizIndexes.filter((quizIndex) => results[quizIndex]?.correct).length;
    return <CompletionMoment course={lesson.course} appearance={lesson.course.appearance} lessonId={lesson.id} lessonTitle={lesson.title} nextLessonId={lesson.nextLessonId} score={score} total={quizIndexes.length} xp={finished.xp} streak={finished.streak} certificateId={finished.certificateId} concepts={discoveredConcepts(lesson.cards)} />;
  }

  if (lesson.cards.length === 0 || moments.length === 0) return <div className="min-h-dvh bg-paper px-6 py-20 text-center"><h1 className="display text-4xl">This lesson is still being shaped.</h1><Link href={`/course/${lesson.course.id}`} className="btn-primary mt-6">Return to the journey</Link></div>;

  const appearance = lesson.course.appearance ?? DEFAULT_COURSE_APPEARANCE;
  const currentMoment = moments[momentIndex];
  const nextMoment = moments[momentIndex + 1];
  const lastVisibleCard = currentMoment.entries[currentMoment.entries.length - 1].cardIndex + 1;
  const progress = Math.round((lastVisibleCard / lesson.cards.length) * 100);
  const unansweredQuizIndexes = currentMoment.entries.filter((entry) => isLessonQuiz(entry.card) && results[entry.cardIndex] === undefined).map((entry) => entry.cardIndex);
  const lockCopy = courseWorldLockCopy(appearance.worldTheme);

  return (
    <CourseAppearanceFrame appearance={appearance} className="course-page-bg min-h-dvh">
      <header className={styles.progressHeader} aria-label="Lesson progress">
        <div className={styles.progressInner}>
          <Link href={`/course/${lesson.course.id}`} className={styles.exitButton} aria-label={`Exit lesson and return to ${lesson.course.title}`}><span aria-hidden="true">×</span></Link>
          <div className={styles.progressTitle}><span>{lesson.moduleTitle}</span><strong>{lesson.title}</strong></div>
          <div className={styles.progressMeta}><span>Moment {momentIndex + 1} / {moments.length}</span><span>{progress}%</span></div>
          <div className={styles.progressTrack} role="progressbar" aria-label={`Progress through ${lesson.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="lesson-title">
        <CourseWorld seed={`${lesson.course.id}:${lesson.id}`} title={lesson.title} theme={appearance.worldTheme} accent={COURSE_ACCENT_HEX[appearance.accent]} progress={progress} mood={appearance.atmosphere === "full" ? "bright" : "calm"} className={styles.heroWorld} />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p>{lesson.course.title} · Lesson {lesson.position} of {lesson.totalLessons}</p>
          <h1 id="lesson-title" className="display">{lesson.title}</h1>
          <div><span>{lesson.moduleTitle}</span><span>{moments.length} learning moments</span><span>{quizIndexes.length} checks</span></div>
        </div>
      </section>

      <div className={styles.lessonShell}>
        <aside className={styles.momentRail} aria-label="Lesson moments">
          <p className={styles.railLabel}>Lesson route</p>
          <ol>{moments.map((moment, index) => {
            const state = index < momentIndex ? "complete" : index === momentIndex ? "current" : "future";
            return <li key={moment.id} data-state={state} aria-current={state === "current" ? "step" : undefined}><span>{state === "complete" ? <AppIcon name="check" className="h-3.5 w-3.5" /> : String(index + 1).padStart(2, "0")}</span><div><strong>{index === momentIndex ? "Now" : index < momentIndex ? "Read" : "Ahead"}</strong><p>{moment.title}</p></div></li>;
          })}</ol>
        </aside>

        <main id="lesson-moment" className={styles.reader}>
          <header className={styles.momentHeading}>
            <div><p>Learning moment {String(momentIndex + 1).padStart(2, "0")}</p><h2 className="display">Read, connect, then test the idea.</h2></div>
            <span>{currentMoment.entries.length} block{currentMoment.entries.length === 1 ? "" : "s"}</span>
          </header>

          <div key={currentMoment.id} className="lesson-moment-grid slide-up">
            {currentMoment.entries.map((entry) => <LessonBlock key={entry.cardIndex} card={entry.card} cardIndex={entry.cardIndex} onAnswered={(result) => {
              setResults((current) => ({ ...current, [entry.cardIndex]: result }));
              void submitAnswer({ source: "lesson", sessionId: lesson.answerSessionId, lessonId: lesson.id, cardIndex: entry.cardIndex, eventId: result.eventId, answer: result.answer, responseTimeMs: result.responseTimeMs, occurredAt: result.occurredAt, attemptNumber: result.attemptNumber, hintCount: result.hintCount });
            }} />)}
          </div>

          {(nextMoment || lesson.nextLessonId) && <aside className={styles.nextPreview} aria-label={`${nextMoment?.title ?? "Next lesson"}, locked preview`}>
            <div className={styles.nextLock}><AppIcon name="lock" className="h-4 w-4" /></div>
            <div><p>{lockCopy.eyebrow} · {nextMoment ? `Moment ${momentIndex + 2}` : "Next lesson"}</p><h2 aria-hidden="true">{nextMoment?.title ?? "A new region waits"}</h2><span className="screen-reader-text">{nextMoment?.title ?? "A new region waits"}</span><small>{nextMoment ? "Complete this moment to reveal what comes next." : lockCopy.hint}</small></div>
          </aside>}

          <nav className={styles.lessonNav} aria-label="Lesson navigation">
            {momentIndex > 0 ? <button type="button" onClick={goBack} className={styles.backButton}>Previous</button> : <Link href={`/course/${lesson.course.id}`} className={styles.backButton}>Journey map</Link>}
            <button type="button" onClick={advance} disabled={saving || unansweredQuizIndexes.length > 0} className={`${styles.continueButton} course-accent-button`}>{momentIndex + 1 >= moments.length ? saving ? "Saving your progress…" : "Complete lesson" : "Continue to next moment"}<AppIcon name="arrow" className="h-4 w-4" /></button>
          </nav>
          {unansweredQuizIndexes.length > 0 && <p className={styles.answerHint}>Choose an answer before continuing.</p>}
          {finishError && <p role="alert" className={styles.finishError}>{finishError}</p>}
        </main>

        <aside className={styles.utilityRail} aria-label="Moment details">
          <p className={styles.railLabel}>In this moment</p>
          <ul>{currentMoment.entries.map((entry) => { const meta = lessonBlockMeta(entry.card, entry.cardIndex); return <li key={entry.cardIndex}><span data-kind={meta.kind}><AppIcon name={meta.kind === "quiz" ? "compass" : meta.kind === "challenge" ? "trail" : "bookmark"} className="h-3.5 w-3.5" /></span><div><strong>{meta.label}</strong><p>{meta.size} block</p></div></li>; })}</ul>
          <div className={styles.utilityNote}><AppIcon name="spark" className="h-4 w-4" /><p><strong>Reading rhythm</strong><span>Short blocks are grouped by idea, not forced into identical cards.</span></p></div>
        </aside>
      </div>
    </CourseAppearanceFrame>
  );
}
