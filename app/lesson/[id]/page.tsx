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
import {
  COURSE_ACCENT_HEX,
  DEFAULT_COURSE_APPEARANCE,
  type CourseAppearance,
} from "@/lib/course-appearance";

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
    if (card.type === "quiz_mcq" || card.type === "quiz_truefalse" || card.type === "quiz_fillblank") return card.concept ? [card.concept] : [];
    return [];
  });
  return [...new Set(titles)];
}

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
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

  const quizIndexes = useMemo(() => lesson ? lesson.cards.map((card, cardIndex) => card.type.startsWith("quiz_") ? cardIndex : -1).filter((cardIndex) => cardIndex >= 0) : [], [lesson]);

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
    if (!lesson) return;
    if (index + 1 >= lesson.cards.length) void finish();
    else {
      setIndex((current) => current + 1);
      window.scrollTo({ top: 0 });
    }
  }

  if (loadError) return <div className="min-h-dvh bg-paper px-6 py-20 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-no-soft text-no"><AppIcon name="compass" className="h-5 w-5" /></span><h1 className="display mt-5 text-4xl">This lesson could not be opened.</h1><Link href="/" className="btn-primary mt-6">Return home</Link></div>;
  if (!lesson) return <Loading label="Opening this lesson…" />;

  if (finished) {
    const score = quizIndexes.filter((quizIndex) => results[quizIndex]?.correct).length;
    return <CompletionMoment course={lesson.course} appearance={lesson.course.appearance} lessonId={lesson.id} lessonTitle={lesson.title} nextLessonId={lesson.nextLessonId} score={score} total={quizIndexes.length} xp={finished.xp} streak={finished.streak} certificateId={finished.certificateId} concepts={discoveredConcepts(lesson.cards)} />;
  }

  if (lesson.cards.length === 0) return <div className="min-h-dvh bg-paper px-6 py-20 text-center"><h1 className="display text-4xl">This lesson is still being shaped.</h1><Link href={`/course/${lesson.course.id}`} className="btn-primary mt-6">Return to the journey</Link></div>;

  const card = lesson.cards[index];
  const appearance = lesson.course.appearance ?? DEFAULT_COURSE_APPEARANCE;
  const progress = Math.round(((index + 1) / lesson.cards.length) * 100);
  const quizUnanswered = card.type.startsWith("quiz_") && results[index] === undefined;

  return (
    <CourseAppearanceFrame appearance={appearance} className="course-page-bg min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[var(--course-line)] bg-[color-mix(in_srgb,var(--course-page)_92%,transparent)] px-3 py-3 backdrop-blur-xl sm:px-6" aria-label="Lesson progress">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link href={`/course/${lesson.course.id}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-ink-soft hover:bg-card" aria-label={`Exit lesson and return to ${lesson.course.title}`}><span aria-hidden="true">×</span></Link>
          <div className="min-w-0 flex-1"><div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold text-ink-soft"><span className="truncate">{lesson.moduleTitle}</span><span>{index + 1}/{lesson.cards.length}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`Progress through ${lesson.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-[var(--course-accent)] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div></div>
        </div>
      </header>

      {index === 0 ? <section className="course-world-hero relative min-h-[19rem] overflow-hidden bg-pine text-white sm:min-h-[23rem]" aria-labelledby="lesson-title"><CourseWorld seed={`${lesson.course.id}:${lesson.id}`} title={lesson.title} theme={appearance.worldTheme} accent={COURSE_ACCENT_HEX[appearance.accent]} progress={0} mood={appearance.atmosphere === "full" ? "bright" : "calm"} className="absolute inset-0" /><div className="course-world-hero-shade absolute inset-0 bg-gradient-to-t from-pine via-pine/40 to-transparent" aria-hidden="true" /><div className="relative mx-auto flex min-h-[19rem] max-w-5xl flex-col justify-end px-5 py-8 sm:min-h-[23rem] sm:px-8 sm:py-10"><p className="course-accent-text text-[10px] font-bold uppercase tracking-[0.17em]">{lesson.course.title} · Lesson {lesson.position} of {lesson.totalLessons}</p><h1 id="lesson-title" className="display mt-3 max-w-3xl text-[clamp(3rem,11vw,5.8rem)] leading-[0.88]">{lesson.title}</h1><p className="mt-4 text-sm text-white/70">{lesson.moduleTitle}</p></div></section> : <div className="mx-auto max-w-3xl px-5 pt-8 sm:px-8"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">{lesson.title} · {lesson.moduleTitle}</p></div>}

      <div className="reading-measure px-4 pb-28 pt-8 sm:px-6 sm:py-11">
        <div key={index} className="slide-up"><LessonBlock card={card} onAnswered={(result) => {
          setResults((current) => ({ ...current, [index]: result }));
          void submitAnswer({ source: "lesson", sessionId: lesson.answerSessionId, lessonId: lesson.id, cardIndex: index, eventId: result.eventId, answer: result.answer, responseTimeMs: result.responseTimeMs, occurredAt: result.occurredAt, attemptNumber: result.attemptNumber, hintCount: result.hintCount });
        }} /></div>

        <nav className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-40 flex gap-2 rounded-[1.2rem] border border-white/10 bg-sidebar/95 p-2 text-white shadow-pop backdrop-blur-xl sm:static sm:mt-6 sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:p-0 sm:text-ink sm:shadow-none" aria-label="Lesson navigation">
          {index > 0 ? <button type="button" onClick={() => { setIndex((current) => Math.max(0, current - 1)); window.scrollTo({ top: 0 }); }} className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-deep px-5 py-3 text-sm font-semibold sm:w-auto">Back</button> : <Link href={`/course/${lesson.course.id}`} className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-deep px-5 py-3 text-sm font-semibold sm:w-auto">Journey map</Link>}
          <button type="button" onClick={advance} disabled={saving || quizUnanswered} className="btn-primary min-h-12 flex-1">{index + 1 >= lesson.cards.length ? saving ? "Saving your progress…" : "Complete this lesson" : "Continue"}<AppIcon name="arrow" className="h-4 w-4" /></button>
        </nav>
        {quizUnanswered && <p className="mt-3 text-center text-xs text-ink-soft">Choose an answer before continuing.</p>}
        {finishError && <p role="alert" className="mt-3 rounded-xl bg-no-soft px-4 py-3 text-center text-sm font-semibold text-no">{finishError}</p>}
      </div>
    </CourseAppearanceFrame>
  );
}
