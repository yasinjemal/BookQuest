"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ClassData {
  classroom: { id: number; name: string; code: string; isOwner: boolean };
  assignments: { id: number; title: string; status: string }[];
  members: {
    user_id: number;
    name: string;
    doneLessons: number;
    totalLessons: number;
    streak: number;
    total_xp: number;
  }[];
  weakConcepts: { concept: string; avg_mastery: number; learners: number }[];
  myCourses: { id: number; title: string }[];
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ClassData | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/classes/${id}`);
    if (res.status === 401) return router.push("/login");
    if (res.status === 404) return router.push("/classes");
    setData(await res.json());
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(courseId: number, action: "assign" | "unassign") {
    await fetch(`/api/classes/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, action }),
    });
    setPick("");
    load();
  }

  if (!data) return <p className="p-8 text-center text-ink-soft">Loading…</p>;

  const { classroom, assignments, members, weakConcepts, myCourses } = data;
  const unassigned = myCourses.filter(
    (c) => !assignments.some((a) => a.id === c.id)
  );

  return (
    <div className="px-4 pt-6 pb-8">
      <Link href="/classes" className="text-sm font-semibold text-ink-soft">
        ← Classes
      </Link>
      <h1 className="text-xl font-extrabold mt-2">{classroom.name}</h1>

      {classroom.isOwner && (
        <div className="mt-3 rounded-2xl bg-teal/10 border border-teal/30 p-4 text-center">
          <div className="text-xs font-bold text-teal uppercase tracking-wide">
            Class code — share with your learners
          </div>
          <div className="text-3xl font-extrabold tracking-[0.3em] mt-1">
            {classroom.code}
          </div>
        </div>
      )}

      {/* Assigned courses */}
      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Assigned courses
      </h2>
      <div className="space-y-2">
        {assignments.length === 0 && (
          <p className="text-sm text-ink-soft">
            {classroom.isOwner
              ? "Assign a course below to get your class learning."
              : "Your teacher hasn't assigned courses yet."}
          </p>
        )}
        {assignments.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 rounded-xl bg-card border border-line p-3"
          >
            <Link href={`/course/${a.id}`} className="flex-1 font-semibold truncate">
              {a.title}
            </Link>
            {classroom.isOwner && (
              <button
                onClick={() => act(a.id, "unassign")}
                className="text-xs font-bold text-ink-soft border border-line rounded-lg px-2 py-1"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {classroom.isOwner && unassigned.length > 0 && (
          <div className="flex gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="flex-1 min-w-0 rounded-xl border-2 border-line bg-card px-3 py-2.5 text-sm font-semibold"
            >
              <option value="">Choose a course to assign…</option>
              {unassigned.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              onClick={() => pick && act(Number(pick), "assign")}
              disabled={!pick}
              className="rounded-xl bg-teal text-white font-bold px-4 disabled:opacity-40"
            >
              Assign
            </button>
          </div>
        )}
      </div>

      {/* Teacher: class weak spots */}
      {classroom.isOwner && weakConcepts.length > 0 && (
        <>
          <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
            📉 Where your class struggles
          </h2>
          <div className="rounded-2xl bg-card border border-line shadow-sm divide-y divide-line">
            {weakConcepts.map((w) => (
              <div key={w.concept} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 font-semibold capitalize truncate">
                  {w.concept}
                </span>
                <span className="text-xs text-ink-soft">
                  {w.learners} learner{w.learners === 1 ? "" : "s"}
                </span>
                <span
                  className={`font-bold ${
                    w.avg_mastery < 0.4 ? "text-no" : "text-primary-deep"
                  }`}
                >
                  {Math.round(w.avg_mastery * 100)}%
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-ink-soft mt-1">
            Average mastery across the class — re-teach the red ones.
          </p>
        </>
      )}

      {/* Members */}
      <h2 className="font-bold text-sm text-ink-soft uppercase tracking-wide mt-6 mb-2">
        Learners ({members.length})
      </h2>
      <div className="rounded-2xl bg-card border border-line shadow-sm divide-y divide-line">
        {members.length === 0 && (
          <p className="p-4 text-sm text-ink-soft text-center">
            Nobody has joined yet
            {classroom.isOwner ? ` — share code ${classroom.code}.` : "."}
          </p>
        )}
        {members.map((m) => (
          <div key={m.user_id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{m.name}</div>
              <div className="text-xs text-ink-soft">
                🔥 {m.streak} · ⚡ {m.total_xp} XP
              </div>
            </div>
            {m.totalLessons > 0 && (
              <div className="text-right">
                <div className="text-sm font-bold">
                  {m.doneLessons}/{m.totalLessons}
                </div>
                <div className="w-20 h-1.5 rounded-full bg-line overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full bg-go"
                    style={{
                      width: `${Math.round((m.doneLessons / m.totalLessons) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
