"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface LessonNode {
  id: number;
  title: string;
  cardCount: number;
  completed: boolean;
}
interface ModuleData {
  id: number;
  title: string;
  summary: string;
  status: string;
  lessons: LessonNode[];
}
interface CourseData {
  course: {
    id: number;
    title: string;
    description: string;
    status: string;
    error: string | null;
    isOwner: boolean;
    published: number;
    category: string;
  };
  modules: ModuleData[];
}

import { CATEGORIES } from "@/lib/categories";

export default function CoursePathPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<CourseData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [category, setCategory] = useState<string>("General");
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/courses/${id}`);
    if (res.status === 401) {
      router.push("/login");
      return null;
    }
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    const d = (await res.json()) as CourseData;
    setData(d);
    setCategory(d.course.category ?? "General");
    return d;
  }, [id, router]);

  async function togglePublish(next: boolean) {
    if (!data) return;
    setPublishing(true);
    await fetch(`/api/courses/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: next, category }),
    });
    setPublishing(false);
    load();
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const busy = ["extracting", "outlining", "generating"].includes(
      data.course.status
    );
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data, load]);

  async function remove() {
    if (!confirm("Delete this course and all progress?")) return;
    await fetch(`/api/courses/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (notFound)
    return <p className="p-8 text-center text-ink-soft">Course not found.</p>;
  if (!data)
    return <p className="p-8 text-center text-ink-soft">Loading…</p>;

  // First not-completed lesson across the whole course is the "current" node
  let currentFound = false;

  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <Link href="/" className="text-sm font-semibold text-ink-soft">
          ← Courses
        </Link>
        <div className="flex items-start justify-between gap-2 mt-2">
          <div>
            <h1 className="text-xl font-extrabold leading-tight">
              {data.course.title}
            </h1>
            <p className="text-sm text-ink-soft">{data.course.description}</p>
          </div>
          {data.course.isOwner && (
            <button
              onClick={remove}
              className="shrink-0 text-xs text-ink-soft border border-line rounded-lg px-2 py-1"
              aria-label="Delete course"
            >
              🗑
            </button>
          )}
        </div>
        {["extracting", "outlining", "generating"].includes(
          data.course.status
        ) && (
          <div className="mt-3 rounded-xl bg-primary/10 text-primary-deep text-sm font-semibold px-3 py-2 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            Still writing lessons — new ones appear below as they finish.
          </div>
        )}

        {/* Owner publish controls */}
        {data.course.isOwner && data.course.status === "ready" && (
          <div className="mt-3 rounded-xl bg-card border border-line px-4 py-3">
            {data.course.published ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-teal">
                  🌍 Published — anyone can learn from this course
                </span>
                <button
                  onClick={() => togglePublish(false)}
                  disabled={publishing}
                  className="shrink-0 text-xs font-bold text-ink-soft border border-line rounded-lg px-3 py-1.5"
                >
                  Unpublish
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border border-line bg-paper px-2 py-2 text-sm font-semibold"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  onClick={() => togglePublish(true)}
                  disabled={publishing}
                  className="shrink-0 text-xs font-bold text-white bg-teal rounded-lg px-3 py-2 active:scale-95 transition"
                >
                  {publishing ? "…" : "🌍 Publish"}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="space-y-8 pb-8">
        {data.modules.map((m, mi) => (
          <section key={m.id}>
            <div className="rounded-xl bg-teal/10 border border-teal/20 px-4 py-3 mb-5">
              <h2 className="font-bold text-teal">
                Unit {mi + 1}: {m.title}
              </h2>
              <p className="text-xs text-ink-soft">{m.summary}</p>
              {(m.status === "pending" || m.status === "generating") && (
                <p className="text-xs font-semibold text-primary-deep mt-1">
                  ✍️ Writing…
                </p>
              )}
              {m.status === "error" && (
                <p className="text-xs font-semibold text-no mt-1">
                  Couldn&apos;t generate this unit.
                </p>
              )}
            </div>

            <div className="flex flex-col items-center gap-4">
              {m.lessons.map((l, li) => {
                const isCurrent = !l.completed && !currentFound;
                if (isCurrent) currentFound = true;
                const locked = !l.completed && !isCurrent;
                // zig-zag path offsets
                const offset = [0, 36, 0, -36][li % 4];
                const node = (
                  <div
                    className="flex flex-col items-center"
                    style={{ transform: `translateX(${offset}px)` }}
                  >
                    <div
                      className={`h-16 w-16 rounded-full flex items-center justify-center text-2xl shadow-md border-b-4 transition ${
                        l.completed
                          ? "bg-go text-white border-green-800"
                          : isCurrent
                            ? "bg-primary text-white border-amber-700 pop-in"
                            : "bg-line text-ink-soft border-stone-300"
                      }`}
                    >
                      {l.completed ? "✓" : isCurrent ? "★" : "🔒"}
                    </div>
                    <span
                      className={`mt-1 text-xs font-semibold max-w-32 text-center leading-tight ${
                        locked ? "text-ink-soft/60" : "text-ink"
                      }`}
                    >
                      {l.title}
                    </span>
                  </div>
                );
                return locked ? (
                  <div key={l.id}>{node}</div>
                ) : (
                  <Link key={l.id} href={`/lesson/${l.id}`} className="active:scale-95 transition">
                    {node}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
