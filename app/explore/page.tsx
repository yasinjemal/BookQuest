"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseGalleryCard from "@/components/CourseGalleryCard";
import CourseWorld from "@/components/CourseWorld";
import { CATEGORIES } from "@/lib/categories";
import type { CourseAppearance } from "@/lib/course-appearance";

interface ExploreCourse {
  id: number;
  title: string;
  description: string;
  category: string;
  owner_name: string;
  enroll_count: number;
  mine: boolean;
  enrolled: boolean;
  public_slug: string;
  appearance: CourseAppearance;
}

export default function ExplorePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [courses, setCourses] = useState<ExploreCourse[] | null>(null);
  const [error, setError] = useState("");
  const [enrolling, setEnrolling] = useState<number | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category !== "All") params.set("category", category);
    setError("");
    try {
      const response = await fetch(`/api/explore?${params}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setCourses(data.courses);
    } catch {
      setError("The library could not be opened. Try again in a moment.");
      setCourses([]);
    }
  }, [query, category, router]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function enrollIn(id: number) {
    setEnrolling(id);
    try {
      const response = await fetch(`/api/courses/${id}/enroll`, { method: "POST" });
      if (response.status === 401) { router.push(`/login?next=/course/${id}`); return; }
      if (!response.ok) throw new Error();
      router.push(`/course/${id}`);
    } catch {
      setError("This course could not be added to your worlds.");
      setEnrolling(null);
    }
  }

  const featured = courses?.[0];
  const gallery = courses?.slice(featured ? 1 : 0) ?? [];

  return (
    <div className="page-wrap">
      <div className="content-measure">
        <header className="grid gap-7 overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:grid-cols-[.88fr_1.12fr]">
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Library</p>
            <h1 className="display mt-3 text-[clamp(3.2rem,11vw,6rem)] leading-[0.88]">Find a world worth entering.</h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/70">Browse reviewed journeys, practical missions, and focused study built by the BookQuest community.</p>
          </div>
          <CourseWorld seed="bookquest-library" theme="archive" progress={36} className="min-h-64 lg:min-h-[25rem]" />
        </header>

        <section className="relative z-10 mx-auto -mt-5 max-w-4xl rounded-[1.35rem] border border-line bg-card p-3 shadow-pop sm:-mt-7 sm:p-4" aria-label="Search and filter the library">
          <label htmlFor="course-search" className="screen-reader-text">Search courses</label>
          <div className="flex min-h-12 items-center gap-3 rounded-xl border border-line-deep bg-ivory px-4 focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10">
            <AppIcon name="compass" className="h-5 w-5 shrink-0 text-ink-soft" />
            <input id="course-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or subject" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-ink-soft/70 sm:text-sm" />
            {query && <button type="button" onClick={() => setQuery("")} className="grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-paper" aria-label="Clear course search">×</button>}
          </div>
          <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1" aria-label="Course categories">
            {["All", ...CATEGORIES].map((item) => <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className={`min-h-10 shrink-0 snap-start rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${category === item ? "border-ink bg-ink text-white" : "border-line bg-paper/60 text-ink-soft hover:border-line-deep hover:text-ink"}`}>{item}</button>)}
          </div>
        </section>

        <div className="mt-12">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="section-label">Curated worlds</p><h2 className="display mt-2 text-4xl">{query ? `Results for “${query}”` : category === "All" ? "Open the next cover" : category}</h2></div>
            {courses && <p className="text-xs font-semibold text-ink-soft" aria-live="polite">{courses.length} course{courses.length === 1 ? "" : "s"}</p>}
          </div>

          {courses === null && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading courses">{[0, 1, 2].map((item) => <div key={item} className="h-[28rem] rounded-[1.4rem] skeleton" />)}</div>}
          {error && <p role="alert" className="mb-5 rounded-xl bg-no-soft px-4 py-3 text-sm font-semibold text-no">{error}</p>}
          {courses?.length === 0 && !error && <div className="rounded-[1.5rem] border border-line bg-card px-6 py-14 text-center shadow-card"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="compass" className="h-5 w-5" /></span><h3 className="display mt-5 text-3xl">No world matches that path yet.</h3><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">Try a broader search or begin a course from a source you trust.</p><Link href="/create" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">Create a course <AppIcon name="arrow" className="h-4 w-4" /></Link></div>}

          {featured && <section className="mb-8" aria-labelledby="featured-world-heading"><p className="section-label mb-4">Featured journey</p><article className="grid overflow-hidden rounded-[1.65rem] border border-line bg-card shadow-card lg:grid-cols-[1.15fr_.85fr]"><CourseWorld seed={featured.id} title={featured.title} theme={featured.appearance.worldTheme} progress={0} className="min-h-72 lg:min-h-[24rem]" /><div className="flex flex-col justify-center p-6 sm:p-9"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal">{featured.category}</p><h3 id="featured-world-heading" className="display mt-3 text-[clamp(2.7rem,8vw,4.5rem)] leading-[0.92]">{featured.title}</h3><p className="mt-4 line-clamp-3 text-sm leading-6 text-ink-soft">{featured.description}</p><p className="mt-4 text-xs text-ink-soft">Created by {featured.owner_name}{featured.enroll_count > 0 ? ` · ${featured.enroll_count} learner${featured.enroll_count === 1 ? "" : "s"}` : ""}</p>{featured.mine || featured.enrolled ? <Link href={`/course/${featured.id}`} className="mt-7 inline-flex min-h-12 w-fit items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white">{featured.mine ? "Open your course" : "Continue journey"}<AppIcon name="arrow" className="h-4 w-4" /></Link> : <button type="button" onClick={() => void enrollIn(featured.id)} disabled={enrolling === featured.id} className="btn-primary mt-7 w-fit">{enrolling === featured.id ? "Adding to your worlds…" : "Begin this journey"}<AppIcon name="arrow" className="h-4 w-4" /></button>}</div></article></section>}

          {gallery.length > 0 && <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{gallery.map((course) => <CourseGalleryCard key={course.id} id={course.id} title={course.title} description={course.description} category={course.category} creator={course.owner_name} learnerCount={course.enroll_count} appearance={course.appearance} action={course.mine || course.enrolled ? <Link href={`/course/${course.id}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white">{course.mine ? "Open your course" : "Continue journey"}<AppIcon name="arrow" className="h-4 w-4" /></Link> : <button type="button" onClick={() => void enrollIn(course.id)} disabled={enrolling === course.id} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{enrolling === course.id ? "Adding…" : "Begin this journey"}<AppIcon name="arrow" className="h-4 w-4" /></button>} />)}</div>}
        </div>
      </div>
    </div>
  );
}
