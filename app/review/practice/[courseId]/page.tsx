"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Card } from "@/lib/schemas";
import QuizCard from "@/components/QuizCard";

type QuizCardType = Extract<
  Card,
  { type: "quiz_mcq" | "quiz_truefalse" | "quiz_fillblank" }
>;

interface PracticeItem {
  concept: string;
  card: QuizCardType;
}

export default function PracticeSessionPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const [items, setItems] = useState<PracticeItem[] | null>(null);
  const [isFresh, setIsFresh] = useState(false);
  const [loadingFresh, setLoadingFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  const loadSession = useCallback(
    async (fresh: boolean) => {
      setError(null);
      if (fresh) setLoadingFresh(true);
      try {
        const res = await fetch("/api/practice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: Number(courseId), fresh }),
        });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not start practice.");
          return;
        }
        setItems(data.cards);
        setIsFresh(!!data.fresh);
        setIndex(0);
        setCorrectCount(0);
        setAnswered(false);
        setDone(false);
      } catch {
        setError("Network error — are you online?");
      } finally {
        setLoadingFresh(false);
      }
    },
    [courseId, router]
  );

  useEffect(() => {
    loadSession(false);
  }, [loadSession]);

  async function onAnswered(correct: boolean) {
    if (!items) return;
    setAnswered(true);
    if (correct) setCorrectCount((n) => n + 1);
    try {
      await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: Number(courseId),
          concept: items[index].concept,
          correct,
        }),
      });
    } catch {
      /* offline: mastery update lost, not critical */
    }
  }

  function next() {
    if (!items) return;
    if (index + 1 >= items.length) setDone(true);
    else {
      setIndex(index + 1);
      setAnswered(false);
    }
  }

  if (error)
    return (
      <div className="p-8 text-center">
        <p className="text-ink-soft">{error}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-sm font-bold text-primary-deep"
        >
          ← Back
        </button>
      </div>
    );
  if (!items)
    return <p className="p-8 text-center text-ink-soft">Building your session…</p>;

  if (done)
    return (
      <div className="min-h-[80dvh] flex flex-col items-center justify-center px-8 text-center">
        <div className="text-5xl pop-in">🎯</div>
        <h1 className="text-xl font-extrabold mt-4">Practice complete!</h1>
        <p className="text-ink-soft mt-1">
          {correctCount}/{items.length} correct · +{correctCount * 2} XP · your
          mastery map has been updated.
        </p>
        <button
          onClick={() => loadSession(true)}
          disabled={loadingFresh}
          className="mt-6 w-full max-w-xs rounded-2xl bg-teal text-white font-bold py-3.5 border-b-4 border-teal-800 active:scale-[0.98] transition disabled:opacity-50"
        >
          {loadingFresh
            ? "✨ Writing new questions…"
            : "👑 Fresh AI questions on your weak spots"}
        </button>
        <button
          onClick={() => router.push("/review")}
          className="mt-3 w-full max-w-xs rounded-2xl bg-card border-2 border-line font-bold py-3.5 active:scale-[0.98] transition"
        >
          Done
        </button>
        {error && <p className="mt-3 text-sm text-no">{error}</p>}
      </div>
    );

  const item = items[index];
  return (
    <div className="px-4 pt-6 flex flex-col min-h-[calc(100dvh-5rem)]">
      <header className="mb-4">
        <h1 className="text-xl font-extrabold">
          {isFresh ? "✨ Fresh practice" : "🎯 Smart practice"}
        </h1>
        <p className="text-xs text-ink-soft">
          {index + 1} of {items.length} · concept:{" "}
          <span className="capitalize font-semibold">{item.concept}</span>
        </p>
      </header>
      <div key={index} className="flex-1 slide-up">
        <QuizCard card={item.card} onAnswered={onAnswered} />
      </div>
      <button
        onClick={next}
        disabled={!answered}
        className="mt-6 mb-4 rounded-2xl bg-primary text-white font-bold py-3.5 border-b-4 border-amber-700 active:scale-[0.98] transition disabled:opacity-40 disabled:border-b-0"
      >
        {index + 1 >= items.length ? "Finish" : "Next"}
      </button>
    </div>
  );
}
