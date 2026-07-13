"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Card } from "@/lib/schemas";
import type { QuizAnswerResult } from "@/lib/learning-types";
import {
  flushAnswerOutbox,
  setAnswerOutboxAccount,
  startAnswerOutboxSync,
  submitAnswer,
  submitLessonCompletion,
} from "@/lib/answer-outbox";
import QuizCard from "@/components/QuizCard";
import Loading from "@/components/Loading";
import RichBlockCard, { type RichCard } from "@/components/RichBlockCard";
import type { QuizCard as QuizCardType } from "@/lib/learning-types";

function isQuizCard(card: Card): card is QuizCardType {
  return card.type === "quiz_mcq" || card.type === "quiz_truefalse" || card.type === "quiz_fillblank";
}

interface LessonData {
  id: number;
  module_id: number;
  title: string;
  cards: Card[];
  answerSessionId: string;
  viewerId: number;
}

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<number, QuizAnswerResult>>({});
  const [finished, setFinished] = useState<{
    xp: number;
    streak: number;
    certificateId?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lessons/${id}`)
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.viewerId) setAnswerOutboxAccount(data.viewerId);
        setLesson(data);
      })
      .catch(() => setLesson(null));
  }, [id]);

  useEffect(() => startAnswerOutboxSync(), []);

  const quizIndexes = useMemo(
    () =>
      lesson
        ? lesson.cards
            .map((c, i) => (c.type.startsWith("quiz_") ? i : -1))
            .filter((i) => i >= 0)
        : [],
    [lesson]
  );

  async function finish() {
    if (!lesson || saving) return;
    setSaving(true);
    setFinishError(null);
    // Drain answers first so the completion's server-side evidence check can pass.
    await flushAnswerOutbox();
    const { delivered, data } = await submitLessonCompletion({
      lessonId: lesson.id,
      answerSessionId: lesson.answerSessionId,
    });
    if (delivered && data) {
      setFinished({
        xp: data.xp ?? 0,
        streak: data.stats?.streak ?? 0,
        certificateId: data.certificate?.id,
      });
    } else {
      // Queued durably: it reconciles automatically once answers finish syncing
      // or the app reconnects, so the credit is never lost.
      setFinishError(
        "Saved offline — this lesson will finish automatically once you're back online."
      );
    }
    setSaving(false);
  }

  function advance() {
    if (!lesson) return;
    if (index + 1 >= lesson.cards.length) {
      finish();
    } else {
      setIndex(index + 1);
    }
  }

  if (!lesson) return <Loading label="Loading lesson…" />;

  // ----- Celebration screen -----
  if (finished) {
    const score = quizIndexes.filter((i) => results[i]?.correct).length;
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl pop-in">🎉</div>
        <h1 className="text-2xl font-extrabold mt-4">Lesson complete!</h1>
        <p className="text-ink-soft mt-1">{lesson.title}</p>
        <div className="flex gap-3 mt-6">
          <div className="rounded-2xl bg-primary/10 border border-primary/30 px-5 py-3">
            <div className="text-xl font-extrabold text-primary-deep">
              +{finished.xp} XP
            </div>
            <div className="text-xs text-ink-soft">earned</div>
          </div>
          <div className="rounded-2xl bg-go-soft border border-go/30 px-5 py-3">
            <div className="text-xl font-extrabold text-go">
              {score}/{quizIndexes.length}
            </div>
            <div className="text-xs text-ink-soft">correct</div>
          </div>
          <div className="rounded-2xl bg-teal/10 border border-teal/30 px-5 py-3">
            <div className="text-xl font-extrabold text-teal">
              🔥 {finished.streak}
            </div>
            <div className="text-xs text-ink-soft">day streak</div>
          </div>
        </div>
        {finished.certificateId && (
          <a
            href={`/cert/${finished.certificateId}`}
            className="btn-teal mt-6 w-full max-w-xs"
          >
            🎓 Course complete — view your certificate
          </a>
        )}
        <button
          onClick={() => router.back()}
          className="btn-primary mt-4 w-full max-w-xs"
        >
          Continue
        </button>
      </div>
    );
  }

  const card = lesson.cards[index];
  const progress = (index / lesson.cards.length) * 100;

  return (
    <div className="min-h-dvh flex flex-col px-4 pt-4 pb-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="text-ink-soft text-xl leading-none"
          aria-label="Exit lesson"
        >
          ✕
        </button>
        <div className="flex-1 h-3 rounded-full bg-line overflow-hidden">
          <div
            className="h-full rounded-full bg-go transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-bold text-ink-soft">
          {index + 1}/{lesson.cards.length}
        </span>
      </div>

      {/* Card body */}
      <div key={index} className="flex-1 slide-up">
        {card.type === "concept" || card.type === "example" ? (
          <div>
            <span
              className={`inline-block text-xs font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ${
                card.type === "concept"
                  ? "bg-teal/10 text-teal"
                  : "bg-primary/10 text-primary-deep"
              }`}
            >
              {card.type === "concept" ? "Learn" : "Example"}
            </span>
            <h2 className="text-xl font-extrabold mt-3">{card.title}</h2>
            <p className="reading text-[17px] leading-relaxed mt-3 whitespace-pre-wrap">
              {card.body}
            </p>
          </div>
        ) : card.type === "recap" ? (
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-wide rounded-full px-2.5 py-1 bg-go-soft text-go">
              Recap
            </span>
            <h2 className="text-xl font-extrabold mt-3">{card.title}</h2>
            <ul className="mt-4 space-y-3">
              {card.points.map((p, i) => (
                <li key={i} className="reading flex gap-2.5 text-[16px] leading-relaxed">
                  <span className="text-go font-bold">✓</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ) : isQuizCard(card) ? (
          <QuizCard
            card={card}
            onAnswered={(result) => {
              setResults((current) => ({ ...current, [index]: result }));
              void submitAnswer({
                source: "lesson",
                sessionId: lesson.answerSessionId,
                lessonId: lesson.id,
                cardIndex: index,
                eventId: result.eventId,
                answer: result.answer,
                responseTimeMs: result.responseTimeMs,
                occurredAt: result.occurredAt,
                attemptNumber: result.attemptNumber,
                hintCount: result.hintCount,
              });
            }}
          />
        ) : (
          <RichBlockCard card={card as RichCard} />
        )}
      </div>

      {/* Continue button */}
      <button
        onClick={advance}
        disabled={
          saving || (card.type.startsWith("quiz_") && results[index] === undefined)
        }
        className="btn-primary mt-6"
      >
        {index + 1 >= lesson.cards.length
          ? saving
            ? "Saving…"
            : "Finish lesson"
          : "Continue"}
      </button>
      {finishError && (
        <p className="mt-2 text-center text-sm font-semibold text-no">
          {finishError}
        </p>
      )}
    </div>
  );
}
