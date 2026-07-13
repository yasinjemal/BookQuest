"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/categories";

interface ExploreCourse {
  id: number;
  title: string;
  description: string;
  category: string;
  owner_name: string;
  enroll_count: number;
  mine: boolean;
  enrolled: boolean;
}

export default function ExplorePage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const [courses, setCourses] = useState<ExploreCourse[] | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category !== "All") params.set("category", category);
    const res = await fetch(`/api/explore?${params}`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setCourses(data.courses);
  }, [q, category, router]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function enrollIn(id: number) {
    await fetch(`/api/courses/${id}/enroll`, { method: "POST" });
    router.push(`/course/${id}`);
  }

  return (
    <div className="page-wrap max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-4">Explore courses</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search courses…"
        className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 font-medium outline-none focus:border-primary"
      />

      <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4">
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold border transition ${
              category === c
                ? "bg-ink text-white border-ink"
                : "bg-card border-line text-ink-soft"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3 pb-6">
        {courses === null && (
          <p className="text-center text-ink-soft text-sm py-8">Loading…</p>
        )}
        {courses?.length === 0 && (
          <p className="text-center text-ink-soft text-sm py-8">
            No published courses here yet. Turn one of your documents into a
            course and publish it — be the first! 🚀
          </p>
        )}
        {courses?.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl bg-card border border-line p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-bold leading-snug">{c.title}</h2>
                <p className="text-xs text-ink-soft mt-0.5 line-clamp-2">
                  {c.description}
                </p>
              </div>
              <span className="shrink-0 text-[10px] font-bold text-teal bg-teal/10 rounded-full px-2 py-1">
                {c.category}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-ink-soft">
                by {c.owner_name} · 👥 {c.enroll_count}
              </span>
              {c.mine ? (
                <Link
                  href={`/course/${c.id}`}
                  className="text-xs font-bold text-ink-soft border border-line rounded-lg px-3 py-1.5"
                >
                  Your course
                </Link>
              ) : c.enrolled ? (
                <Link
                  href={`/course/${c.id}`}
                  className="text-xs font-bold text-white bg-go rounded-lg px-3 py-1.5 active:scale-95 transition"
                >
                  Continue →
                </Link>
              ) : (
                <button
                  onClick={() => enrollIn(c.id)}
                  className="text-xs font-bold text-white bg-primary rounded-lg px-3 py-1.5 border-b-2 border-primary-deep active:scale-95 transition"
                >
                  Start free
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
