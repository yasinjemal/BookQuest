"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface CoursePractice {
  courseId: number;
  title: string;
  conceptCount: number;
  avgMastery: number | null;
  weakest: { concept: string; mastery: number }[];
}

function masteryColor(m: number) {
  if (m < 0.4) return "bg-no";
  if (m < 0.7) return "bg-primary";
  return "bg-go";
}

export default function PracticeHubPage() {
  const [dueReviews, setDueReviews] = useState<number>(0);
  const [courses, setCourses] = useState<CoursePractice[] | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return r.json();
      })
      .then((d) => d && setDueReviews(d.dueReviews))
      .catch(() => null);
    fetch("/api/practice")
      .then((r) => (r.ok ? r.json() : { courses: [] }))
      .then((d) => setCourses(d.courses))
      .catch(() => setCourses([]));
  }, []);

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-extrabold mb-1">Practice</h1>
      <p className="text-sm text-ink-soft mb-5">
        BookQuest tracks every concept you answer and targets your weak spots.
      </p>

      {/* Spaced repetition */}
      <Link
        href="/review/session"
        className={`block rounded-2xl border p-4 shadow-card active:scale-[0.99] transition ${
          dueReviews > 0
            ? "bg-teal/10 border-teal/30"
            : "bg-card border-line opacity-70"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔁</span>
          <div className="flex-1">
            <div className="font-bold">
              {dueReviews > 0
                ? `${dueReviews} question${dueReviews === 1 ? "" : "s"} due for review`
                : "No reviews due"}
            </div>
            <div className="text-xs text-ink-soft">
              Spaced repetition — questions return right before you&apos;d forget
              them.
            </div>
          </div>
          {dueReviews > 0 && <span className="font-extrabold text-teal">→</span>}
        </div>
      </Link>

      {/* Smart practice per course */}
      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Smart practice
      </h2>
      <div className="space-y-3">
        {courses === null && (
          <p className="text-center text-ink-soft text-sm py-6">Loading…</p>
        )}
        {courses?.length === 0 && (
          <p className="text-center text-ink-soft text-sm py-6">
            Complete a lesson first — then practice sessions built from your
            weakest concepts appear here.
          </p>
        )}
        {courses?.map((c) => (
          <div
            key={c.courseId}
            className="rounded-2xl bg-card border border-line p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold leading-snug">{c.title}</h3>
              {c.avgMastery !== null && (
                <span className="shrink-0 text-xs font-bold text-ink-soft">
                  {Math.round(c.avgMastery * 100)}% mastered
                </span>
              )}
            </div>
            {c.weakest.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {c.weakest.map((w) => (
                  <div key={w.concept} className="flex items-center gap-2">
                    <span className="flex-1 text-xs font-semibold truncate capitalize">
                      {w.concept}
                    </span>
                    <div className="w-24 h-1.5 rounded-full bg-line overflow-hidden">
                      <div
                        className={`h-full rounded-full ${masteryColor(w.mastery)}`}
                        style={{ width: `${Math.round(w.mastery * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-soft">
                Answer some quizzes to build your mastery map.
              </p>
            )}
            <Link
              href={`/review/practice/${c.courseId}`}
              className="mt-3 block rounded-xl bg-primary text-white text-center font-bold py-2.5 border-b-2 border-primary-deep active:scale-[0.98] transition text-sm"
            >
              🎯 Practice weak spots
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
