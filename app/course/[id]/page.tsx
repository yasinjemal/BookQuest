"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceEditor from "@/components/CourseAppearanceEditor";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseLearningPulse, { type CourseLearningPulseData } from "@/components/CourseLearningPulse";
import CourseOverviewHero from "@/components/CourseOverviewHero";
import JourneyMap from "@/components/JourneyMap";
import Loading from "@/components/Loading";
import ShareCourseButton from "@/components/ShareCourseButton";
import { DEFAULT_COURSE_APPEARANCE, type CourseAppearance } from "@/lib/course-appearance";
import { CATEGORIES } from "@/lib/categories";
import styles from "./CoursePage.module.css";

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
  learning: CourseLearningPulseData;
}

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
    const next = (await res.json()) as CourseData;
    setData(next);
    setCategory(next.course.category ?? "General");
    return next;
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
    void load();
  }

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!data) return;
    const busy = ["extracting", "outlining", "generating"].includes(data.course.status);
    if (!busy) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [data, load]);

  async function remove() {
    if (!confirm("Delete this course and all progress?")) return;
    await fetch(`/api/courses/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (notFound) return <p className="p-8 text-center text-ink-soft">Course not found.</p>;
  if (!data) return <Loading />;

  const allLessons = data.modules.flatMap((module) => module.lessons);
  const completedLessons = allLessons.filter((lesson) => lesson.completed).length;
  const courseProgress = allLessons.length > 0 ? Math.round((completedLessons / allLessons.length) * 100) : 0;
  const firstIncomplete = allLessons.find((lesson) => !lesson.completed);
  const appearance = data.course.appearance ?? DEFAULT_COURSE_APPEARANCE;
  const busy = ["extracting", "outlining", "generating"].includes(data.course.status);

  return (
    <CourseAppearanceFrame appearance={appearance} className="course-page-bg min-h-dvh">
      <div className={styles.page}>
        <CourseOverviewHero
          courseId={data.course.id}
          title={data.course.title}
          description={data.course.description}
          appearance={appearance}
          progress={courseProgress}
          completedLessons={completedLessons}
          totalLessons={allLessons.length}
          moduleCount={data.modules.length}
          nextLessonId={firstIncomplete?.id}
        />

        {busy && <div className={styles.generationNotice}><span />Still shaping this world — new lessons appear as they finish.</div>}

        {data.course.isOwner && data.course.status === "ready" && (
          <section className={styles.creatorDock} aria-label="Course publishing controls">
            <div className={styles.creatorCopy}><span><AppIcon name="create" className="h-4 w-4" /></span><div><p>Creator dock</p><strong>Shape, preview, and release this world.</strong></div></div>
            <div className={styles.creatorActions}>
              <Link href={`/studio/${id}`} className={styles.studioButton}>Edit in Studio <AppIcon name="arrow" className="h-4 w-4" /></Link>
              {data.course.published ? (
                <>
                  <Link href={`/c/${data.course.public_slug}`} className={styles.quietButton}>Public page</Link>
                  <ShareCourseButton compact slug={data.course.public_slug} title={data.course.title} />
                  <button onClick={() => void togglePublish(false)} disabled={publishing} className={styles.quietButton}>Unpublish</button>
                </>
              ) : (
                <div className={styles.publishGroup}>
                  <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Course category">{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
                  <button onClick={() => void togglePublish(true)} disabled={publishing} className="course-accent-button">{publishing ? "Publishing…" : "Publish"}</button>
                </div>
              )}
            </div>
          </section>
        )}

        {data.course.isOwner && data.course.status === "ready" && (
          <CourseAppearanceEditor courseId={data.course.id} courseTitle={data.course.title} value={appearance} onSaved={(nextAppearance) => setData((current) => current ? { ...current, course: { ...current.course, appearance: nextAppearance } } : current)} />
        )}

        {data.course.status === "ready" && <CourseLearningPulse courseId={data.course.id} learning={data.learning} />}

        <section id="course-journey" className={styles.journeySection} aria-labelledby="journey-heading">
          <header className={styles.journeyHeading}>
            <div><p>Course atlas</p><h2 id="journey-heading" className="display">Choose your next region.</h2><span>Continue where you left off, revisit a completed lesson, or see what unlocks next.</span></div>
            <div><span>{data.modules.length} regions</span><span>{allLessons.length} lessons</span><Link href={`/course/${id}/read`}>Source document <AppIcon name="source" className="h-4 w-4" /></Link></div>
          </header>
          <JourneyMap modules={data.modules} courseId={data.course.id} courseTitle={data.course.title} appearance={appearance} />
        </section>

        {data.course.isOwner && (
          <details className={styles.dangerZone}>
            <summary>Course settings</summary>
            <div><p>Deleting removes the course and its learner progress.</p><button onClick={() => void remove()} aria-label={`Delete ${data.course.title}`}><span aria-hidden="true">×</span> Delete course</button></div>
          </details>
        )}
      </div>
    </CourseAppearanceFrame>
  );
}
