"use client";

import { useEffect, useState } from "react";
import type { Card } from "@/lib/schemas";
import QuizCard from "@/components/QuizCard";

type QuizCardType = Extract<
  Card,
  { type: "quiz_mcq" | "quiz_truefalse" | "quiz_fillblank" }
>;

interface ReviewItem {
  reviewId: number;
  lessonTitle: string;
  card: QuizCardType;
}

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/review")
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return { items: [] };
        }
        return r.json();
      })
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, []);

  async function onAnswered(correct: boolean) {
    if (!items) return;
    setAnswered(true);
    if (correct) setCorrectCount((n) => n + 1);
    try {
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: items[index].reviewId, correct }),
      });
    } catch {
      /* offline — the item stays due, that's fine */
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

  if (items === null)
    return <p className="p-8 text-center text-ink-soft">Loading…</p>;

  if (items.length === 0)
    return (
      <div className="min-h-[70dvh] flex flex-col items-center justify-center px-8 text-center">
        <div className="text-5xl">🌴</div>
        <h1 className="text-xl font-extrabold mt-4">Nothing to review</h1>
        <p className="text-ink-soft text-sm mt-1">
          Questions you get wrong in lessons come back here at the right time
          to lock them into memory.
        </p>
      </div>
    );

  if (done)
    return (
      <div className="min-h-[70dvh] flex flex-col items-center justify-center px-8 text-center">
        <div className="text-5xl pop-in">💪</div>
        <h1 className="text-xl font-extrabold mt-4">Review done!</h1>
        <p className="text-ink-soft mt-1">
          {correctCount}/{items.length} correct. Missed ones will come back
          sooner.
        </p>
      </div>
    );

  const item = items[index];
  return (
    <div className="px-4 pt-6 flex flex-col min-h-[calc(100dvh-5rem)]">
      <header className="mb-4">
        <h1 className="text-xl font-extrabold">Review</h1>
        <p className="text-xs text-ink-soft">
          {index + 1} of {items.length} · from “{item.lessonTitle}”
        </p>
      </header>
      <div key={item.reviewId} className="flex-1 slide-up">
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
