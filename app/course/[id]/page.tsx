"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceEditor from "@/components/CourseAppearanceEditor";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import JourneyMap from "@/components/JourneyMap";
import Loading from "@/components/Loading";
import ShareCourseButton from "@/components/ShareCourseButton";
import {
  COURSE_ACCENT_HEX,
  DEFAULT_COURSE_APPEARANCE,
  type CourseAppearance,
} from "@/lib/course-appearance";

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
    appearance: CourseAppearance;
    public_slug: string;
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
  if (!data) return <Loading />;

  const allLessons = data.modules.flatMap((module) => module.lessons);
  const completedLessons = allLessons.filter((lesson) => lesson.completed).length;
  const courseProgress = allLessons.length > 0
    ? Math.round((completedLessons / allLessons.length) * 100)
    : 0;

  const appearance = data.course.appearance ?? DEFAULT_COURSE_APPEARANCE;

  return (
    <CourseAppearanceFrame appearance={appearance} className="course-page-bg min-h-dvh">
    <div className="page-wrap mx-auto max-w-6xl">
      <header className="course-world-hero mb-6 grid overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:grid-cols-[1.05fr_.95fr]">
        <CourseWorld seed={data.course.id} title={data.course.title} theme={appearance.worldTheme} accent={COURSE_ACCENT_HEX[appearance.accent]} progress={courseProgress} mood={appearance.atmosphere === "full" ? "bright" : "calm"} className="min-h-64 sm:min-h-80 lg:min-h-[27rem]" />
        <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
          <Link href="/" className="inline-flex w-fit items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/65 hover:text-white"><span aria-hidden="true">←</span> Your worlds</Link>
          <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Learning journey</p>
          <h1 className="display mt-3 text-[clamp(2.8rem,9vw,5.2rem)] leading-[0.9]">{data.course.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">{data.course.description}</p>
          <div className="mt-7">
            <div className="mb-2 flex items-center justify-between gap-4 text-xs font-semibold text-white/65"><span>{completedLessons} of {allLessons.length} lessons discovered</span><span>{courseProgress}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={`Progress through ${data.course.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={courseProgress}><div className="course-accent-bg h-full rounded-full" style={{ width: `${courseProgress}%` }} /></div>
          </div>
        </div>
        {["extracting", "outlining", "generating"].includes(
          data.course.status
        ) && (
          <div className="col-span-full flex items-center gap-2 border-t border-white/10 bg-white/5 px-6 py-4 text-sm font-semibold text-white/80">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            Still writing lessons — new ones appear below as they finish.
          </div>
        )}
      </header>

      {data.course.isOwner && data.course.status === "ready" && (
          <section className="mb-8 rounded-[1.35rem] border border-line bg-card p-4 shadow-card sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-5" aria-label="Course publishing controls">
            <div className="mb-4 sm:mb-0"><p className="section-label">Creator controls</p><p className="mt-1 text-sm text-ink-soft">Edit the source-linked draft or manage who can enter this world.</p></div>
            <div className="flex flex-col gap-2 sm:min-w-72 sm:flex-row">
            <Link href={`/studio/${id}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5">
              Edit in Studio <AppIcon name="arrow" className="h-4 w-4" />
            </Link>
            {data.course.published ? (
              <>
                <Link href={`/c/${data.course.public_slug}`} className="min-h-11 shrink-0 rounded-full border border-line-deep px-4 py-3 text-center text-xs font-bold text-ink-soft">Public page</Link>
                <ShareCourseButton compact slug={data.course.public_slug} title={data.course.title} />
                <button
                  onClick={() => togglePublish(false)}
                  disabled={publishing}
                  className="min-h-11 shrink-0 rounded-full border border-line-deep px-4 py-2.5 text-xs font-bold text-ink-soft"
                >
                  Unpublish
                </button>
              </>
            ) : (
              <div className="flex min-w-0 flex-1 gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Course category"
                  className="min-w-0 flex-1 rounded-full border border-line-deep bg-paper px-3 py-2 text-sm font-semibold"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  onClick={() => togglePublish(true)}
                  disabled={publishing}
                  className="min-h-11 shrink-0 rounded-full bg-teal px-4 py-2 text-xs font-bold text-white transition active:scale-95"
                >
                  {publishing ? "Publishing…" : "Publish"}
                </button>
              </div>
            )}
            </div>
          </section>
        )}

      {data.course.isOwner && data.course.status === "ready" && (
        <CourseAppearanceEditor
          courseId={data.course.id}
          courseTitle={data.course.title}
          value={appearance}
          onSaved={(nextAppearance) => setData((current) => current ? {
            ...current,
            course: { ...current.course, appearance: nextAppearance },
          } : current)}
        />
      )}

      <div className="mb-8 flex flex-wrap gap-3">
        <Link href={`/course/${id}/read`} className="inline-flex min-h-11 items-center rounded-full border border-line-deep bg-card px-5 text-sm font-semibold">Read source document</Link>
      </div>

      {data.course.isOwner && <div className="mb-6 flex justify-end"><button onClick={remove} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-no hover:bg-no-soft" aria-label={`Delete ${data.course.title}`}><span aria-hidden="true">×</span> Delete course</button></div>}

      <JourneyMap modules={data.modules} courseId={data.course.id} courseTitle={data.course.title} appearance={appearance} />
    </div>
    </CourseAppearanceFrame>
  );
}
