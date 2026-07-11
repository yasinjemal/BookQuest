"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface StatsData {
  stats: { total_xp: number; streak: number; last_active_date: string | null };
  dueReviews: number;
}

const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000];

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setData)
      .catch(() => null);
  }, []);

  if (!data) return <p className="p-8 text-center text-ink-soft">Loading…</p>;

  const xp = data.stats.total_xp;
  let level = 1;
  while (level < LEVELS.length && xp >= LEVELS[level]) level++;
  const prev = LEVELS[level - 1];
  const next = LEVELS[Math.min(level, LEVELS.length - 1)];
  const pct =
    next > prev ? Math.min(100, Math.round(((xp - prev) / (next - prev)) * 100)) : 100;

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-extrabold mb-5">Your progress</h1>

      <div className="rounded-2xl bg-card border border-line p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-extrabold text-lg">Level {level}</span>
          <span className="text-sm text-ink-soft">
            {xp} / {next} XP
          </span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-line overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-2xl bg-card border border-line p-5 text-center shadow-sm">
          <div className="text-3xl">🔥</div>
          <div className="text-2xl font-extrabold mt-1">{data.stats.streak}</div>
          <div className="text-xs text-ink-soft">day streak</div>
        </div>
        <div className="rounded-2xl bg-card border border-line p-5 text-center shadow-sm">
          <div className="text-3xl">⚡</div>
          <div className="text-2xl font-extrabold mt-1">{xp}</div>
          <div className="text-xs text-ink-soft">total XP</div>
        </div>
      </div>

      {data.dueReviews > 0 && (
        <Link
          href="/review"
          className="mt-4 block rounded-2xl bg-teal/10 border border-teal/30 p-4 text-center font-bold text-teal active:scale-[0.99] transition"
        >
          🔁 {data.dueReviews} question{data.dueReviews === 1 ? "" : "s"} ready
          to review
        </Link>
      )}
    </div>
  );
}
