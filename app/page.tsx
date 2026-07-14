"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseGalleryCard from "@/components/CourseGalleryCard";
import CourseWorld from "@/components/CourseWorld";
import Loading from "@/components/Loading";
import {
  COURSE_ACCENT_HEX,
  DEFAULT_COURSE_APPEARANCE,
  type CourseAppearance,
} from "@/lib/course-appearance";

interface CourseSummary {
  id: number;
  title: string;
  description: string;
  source_filename: string;
  status: string;
  error: string | null;
  published: number;
  category: string;
  totalLessons: number;
  doneLessons: number;
  moduleCount?: number;
  appearance?: CourseAppearance;
}

interface Me {
  id: number;
  name: string;
  role: string;
  credits: number;
  premium_until: string | null;
}

function progressFor(course: CourseSummary) {
  return course.totalLessons > 0
    ? Math.round((course.doneLessons / course.totalLessons) * 100)
    : 0;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function PublicHome() {
  return (
    <div className="min-h-dvh bg-paper pb-20">
      <header className="mx-auto flex min-h-20 max-w-[92rem] items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3 font-semibold tracking-[-0.02em]"><span className="brand-mark text-ink" aria-hidden="true" /><span>BookQuest</span></Link>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3"><Link href="/verify-credential" className="hidden text-sm font-semibold text-ink-soft transition-colors hover:text-ink sm:block">Verify credential</Link><Link href="/login" className="quiet-button">Sign in</Link></div>
      </header>

      <div className="px-3 sm:px-6">
        <section className="relative mx-auto grid max-w-[92rem] overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:min-h-[44rem] lg:grid-cols-[1.04fr_.96fr]">
          <div className="relative z-10 flex flex-col justify-center px-6 py-14 sm:px-10 sm:py-20 lg:px-16">
            <span className="eyebrow w-fit text-signal">Document to interactive course</span>
            <h1 className="display mt-7 max-w-[12ch] text-[clamp(3.2rem,15vw,6.9rem)] leading-[0.87] text-white">Your material, made <em className="text-signal">teachable.</em></h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8">Upload a book, PDF, notes, or training document. Turn it into an interactive course you can edit, study, and share.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/register" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-signal px-6 py-3 text-sm font-bold text-ink transition-transform hover:-translate-y-0.5">Create your first course <AppIcon name="arrow" className="h-4 w-4" /></Link>
              <Link href="/demo" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10">See the demo</Link>
              <Link href="/verify-credential" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10">Verify learning evidence</Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/55"><span>Human reviewed</span><span>Source traceable</span><span>Offline ready</span></div>
          </div>
          <div className="relative min-h-80 lg:min-h-full">
            <CourseWorld seed="bookquest-living-world" theme="forest" mood="bright" progress={68} className="absolute inset-0" />
            <div className="absolute inset-x-5 bottom-5 z-10 rounded-[1.35rem] border border-white/15 bg-pine/70 p-5 backdrop-blur-md sm:inset-x-10 sm:bottom-10 sm:p-6 lg:left-8 lg:right-12">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-signal">Current destination</p>
              <h2 className="display mt-2 text-3xl leading-none sm:text-4xl">A world built from what you trust.</h2>
              <p className="mt-3 text-sm leading-6 text-white/68">Sources remain visible. Drafts remain editable. Progress remains safe.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[92rem] gap-10 px-3 py-20 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-20 lg:py-28">
          <div><p className="section-label">One idea at a time</p><h2 className="display mt-4 text-[clamp(2.8rem,8vw,5.2rem)] leading-[0.92]">Reading should feel like going somewhere.</h2><p className="mt-6 max-w-md text-sm leading-7 text-ink-soft">BookQuest gives each subject its own atmosphere while keeping creation, review, permissions, versions, and evidence precise.</p></div>
          <div className="grid gap-px overflow-hidden rounded-[1.6rem] border border-line bg-line sm:grid-cols-2">
            {[
              { icon: "source" as const, title: "Begin with truth", body: "Bring a policy, handbook, guide, transcript, or your own carefully written notes." },
              { icon: "layers" as const, title: "Shape the journey", body: "Edit every lesson, link it to its source, and preview the learner world before release." },
              { icon: "trail" as const, title: "Learn in places", body: "Move through readable chapters, purposeful practice, and a path that remembers progress." },
              { icon: "shield" as const, title: "Carry the proof", body: "Keep completion evidence tied to the exact reviewed course version." },
            ].map((item, index) => <article key={item.title} className={`min-h-64 p-7 sm:p-8 ${index === 0 ? "bg-signal" : index === 1 ? "bg-sky" : "bg-card"}`}><AppIcon name={item.icon} className="h-6 w-6" /><h3 className="display mt-14 text-3xl">{item.title}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-ink-soft">{item.body}</p></article>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function ContinueJourney({ course }: { course: CourseSummary }) {
  const progress = progressFor(course);
  const appearance = course.appearance ?? DEFAULT_COURSE_APPEARANCE;
  return (
    <CourseAppearanceFrame appearance={appearance} className="rounded-[1.75rem]">
    <section aria-labelledby="continue-journey-heading" className="grid overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:grid-cols-[1.1fr_.9fr]">
      <CourseWorld seed={course.id} title={course.title} theme={appearance.worldTheme} accent={COURSE_ACCENT_HEX[appearance.accent]} progress={progress} mood={appearance.atmosphere === "full" ? "bright" : "calm"} className="min-h-64 sm:min-h-80 lg:min-h-[25rem]" />
      <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
        <p className="course-accent-text text-[10px] font-bold uppercase tracking-[0.18em]">Continue your journey</p>
        <h2 id="continue-journey-heading" className="display mt-3 text-[clamp(2.35rem,8vw,4.4rem)] leading-[0.92]">{course.title}</h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">{course.description || "Return to where you paused. Your progress is safe."}</p>
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between gap-4 text-xs font-semibold text-white/65"><span>{course.doneLessons} of {course.totalLessons} chapters discovered</span><span>{progress}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={`Progress through ${course.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-[var(--course-accent)]" style={{ width: `${progress}%` }} /></div>
        </div>
        <Link href={`/course/${course.id}`} className="course-accent-button mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full px-6 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 sm:w-fit">Return to where you paused <AppIcon name="arrow" className="h-4 w-4" /></Link>
      </div>
    </section>
    </CourseAppearanceFrame>
  );
}

export default function HomePage() {
  const [me, setMe] = useState<Me | null | "anon">(null);
  const [owned, setOwned] = useState<CourseSummary[]>([]);
  const [enrolled, setEnrolled] = useState<CourseSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generateWithAi, setGenerateWithAi] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const meRes = await fetch("/api/me");
      if (meRes.status === 401) {
        setMe("anon");
        return;
      }
      if (!meRes.ok) {
        setFailed(true);
        return;
      }
      const meData = await meRes.json();
      setMe(meData.user);
      const res = await fetch("/api/courses");
      if (res.ok) {
        const data = await res.json();
        setOwned(data.owned);
        setEnrolled(data.enrolled);
      }
    } catch {
      if (!hasLoadedRef.current) setFailed(true);
    } finally {
      hasLoadedRef.current = true;
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!owned.some((course) => ["extracting", "outlining", "generating"].includes(course.status))) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [owned, load]);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("generate", String(generateWithAi));
    try {
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) setUploadError(data.error ?? "Upload failed");
      else if (data.studioUrl) window.location.href = data.studioUrl;
      await load();
    } catch {
      setUploadError("Upload failed — are you online?");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (me === "anon") return <PublicHome />;
  if (failed) return <div className="page-wrap mx-auto max-w-xl pt-20 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-no-soft text-no"><AppIcon name="compass" className="h-6 w-6" /></span><h1 className="display mt-5 text-4xl">We lost the trail for a moment.</h1><p className="mt-3 text-sm leading-6 text-ink-soft">BookQuest could not reach the server. Your saved progress has not moved.</p><button onClick={() => void load()} className="btn-primary mt-6">Try again</button></div>;
  if (!loaded || me === null) return <Loading />;

  const current = enrolled.find((course) => course.status === "ready" && course.doneLessons < course.totalLessons) ?? enrolled.find((course) => course.status === "ready");
  const discovered = enrolled.reduce((total, course) => total + course.doneLessons, 0);
  const firstName = me.name.split(" ")[0];

  return (
    <div className="page-wrap">
      <div className="content-measure">
        <header className="mb-9 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="section-label mb-3">{greeting()}</p><h1 className="page-heading">Welcome back, {firstName}.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-ink-soft">Every chapter you finish leaves the path a little clearer.</p></div>
          <div className="flex items-center gap-3 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-semibold text-ink-soft shadow-card"><AppIcon name="bookmark" className="h-4 w-4 text-teal" />{discovered > 0 ? `${discovered} chapter${discovered === 1 ? "" : "s"} discovered` : "Your progress is safe"}</div>
        </header>

        {current ? <ContinueJourney course={current} /> : <section className="grid overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop sm:grid-cols-[.9fr_1.1fr]"><CourseWorld seed={`${me.id}:first-world`} theme="sunrise-plains" progress={0} className="min-h-60 sm:min-h-80" /><div className="flex flex-col justify-center p-7 sm:p-10"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Your first destination</p><h2 className="display mt-3 text-4xl leading-none sm:text-5xl">A new world is waiting quietly.</h2><p className="mt-4 text-sm leading-6 text-white/70">Choose a course from the library when you are ready.</p><Link href="/explore" className="mt-7 inline-flex min-h-12 w-fit items-center gap-3 rounded-full bg-signal px-6 py-3 text-sm font-bold text-ink">Explore the library <AppIcon name="arrow" className="h-4 w-4" /></Link></div></section>}

        {enrolled.length > 0 && <section className="mt-14" aria-labelledby="your-worlds-heading"><div className="mb-5 flex items-end justify-between gap-5"><div><p className="section-label">Your worlds</p><h2 id="your-worlds-heading" className="display mt-2 text-4xl">Places you can return to</h2></div><Link href="/explore" className="hidden text-sm font-semibold text-teal sm:inline-flex sm:items-center sm:gap-2">Open library <AppIcon name="arrow" className="h-4 w-4" /></Link></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{enrolled.map((course) => <CourseGalleryCard key={course.id} id={course.id} title={course.title} description={course.description} category={course.category} totalLessons={course.totalLessons} progress={progressFor(course)} appearance={course.appearance} action={<Link href={`/course/${course.id}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white">{progressFor(course) > 0 ? "Continue journey" : "Enter this world"}<AppIcon name="arrow" className="h-4 w-4" /></Link>} />)}</div></section>}

        <section className="mt-14 grid gap-5 lg:grid-cols-[1.15fr_.85fr]" aria-labelledby="quiet-step-heading">
          <div className="rounded-[1.5rem] border border-line bg-card p-6 shadow-card sm:p-8"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-go-soft text-go"><AppIcon name="practice" className="h-5 w-5" /></span><div><p className="section-label">A quiet next step</p><h2 id="quiet-step-heading" className="display mt-2 text-3xl">Keep one idea close.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">A short review can strengthen what you have already discovered without starting something new.</p><Link href="/review" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-deep px-5 py-2.5 text-sm font-semibold hover:bg-paper">Open practice <AppIcon name="arrow" className="h-4 w-4" /></Link></div></div></div>
          <div className="rounded-[1.5rem] bg-sky/75 p-6 sm:p-8"><p className="section-label">Make something worth exploring</p><h2 className="display mt-2 text-3xl">A new world begins with a source.</h2><p className="mt-3 text-sm leading-6 text-ink-soft">Create manually, work from saved sources, or use AI for a draft you review.</p><Link href="/create" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">Open Create <AppIcon name="arrow" className="h-4 w-4" /></Link></div>
        </section>

        <section className="mt-14" aria-labelledby="creator-shelf-heading"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="section-label">Creator shelf</p><h2 id="creator-shelf-heading" className="display mt-2 text-4xl">Courses you are shaping</h2></div><span className="text-xs font-semibold text-ink-soft">{me.role === "admin" ? "Creator access" : `${me.credits} creation credit${me.credits === 1 ? "" : "s"}`}</span></div>
          <label className={`group relative flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-line-deep bg-card/60 p-6 text-center transition-colors hover:border-teal hover:bg-card focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/15 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.md,.txt,.markdown" className="absolute inset-0 cursor-pointer opacity-0" aria-label="Upload a document to create a course" onChange={onFile} />
            <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-white"><AppIcon name="source" className="h-5 w-5" /></span><span className="display mt-4 text-2xl">{uploading ? "Opening your source…" : "Quick start from a document"}</span><span className="mt-1 text-xs text-ink-soft">PDF, DOCX, PPTX, Markdown, or text</span>
          </label>
          <label className="mt-3 flex items-start gap-3 rounded-xl px-2 py-2 text-sm"><input type="checkbox" checked={generateWithAi} onChange={(event) => setGenerateWithAi(event.target.checked)} className="mt-1 h-4 w-4" /><span><span className="block font-semibold">Create an AI-assisted draft</span><span className="block text-xs leading-5 text-ink-soft">Uses one credit. Turn this off for an editable source-only draft. You remain the author.</span></span></label>
          {uploadError && <p role="alert" className="mt-2 rounded-xl bg-no-soft px-4 py-3 text-sm font-semibold text-no">{uploadError} {uploadError.includes("credit") && <Link href="/profile" className="underline">View plan</Link>}</p>}
          {owned.length === 0 ? <p className="py-8 text-center text-sm text-ink-soft">Nothing on the shelf yet. Your first draft will appear here.</p> : <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{owned.map((course) => <CourseGalleryCard key={course.id} id={course.id} title={course.title} description={course.description || course.source_filename} category={course.category} totalLessons={course.totalLessons} progress={progressFor(course)} status={course.status === "ready" ? (course.published ? "Published" : "Draft") : course.status} appearance={course.appearance} action={<div className="flex flex-wrap gap-2">{course.status === "ready" && <Link href={`/studio/${course.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Edit in Studio</Link>}{course.status === "error" && <button onClick={async () => { await fetch(`/api/courses/${course.id}/retry`, { method: "POST" }); await load(); }} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-no/40 px-4 py-2 text-sm font-semibold text-no">Try generation again</button>}<Link href={`/course/${course.id}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-deep px-4 py-2 text-sm font-semibold">Open</Link></div>} />)}</div>}
        </section>
      </div>
    </div>
  );
}
