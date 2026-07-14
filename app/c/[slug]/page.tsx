import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicHeader from "@/components/PublicHeader";
import CourseWorld from "@/components/CourseWorld";
import PublicCourseActions from "@/components/PublicCourseActions";
import ShareCourseButton from "@/components/ShareCourseButton";
import PublicCourseViewTracker from "@/components/PublicCourseViewTracker";
import { getPublicCourseBySlug } from "@/lib/public-product";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const course = await getPublicCourseBySlug((await params).slug);
  return course ? { title: `${String(course.title)} · BookQuest`, description: String(course.description) } : {};
}
export default async function PublicCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug; const course = await getPublicCourseBySlug(slug); if (!course) notFound();
  return <div className="min-h-dvh bg-paper"><PublicCourseViewTracker slug={slug} /><PublicHeader />
    <main className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
      <section className="grid overflow-hidden rounded-[2rem] bg-pine text-white shadow-pop lg:grid-cols-[1.05fr_.95fr]">
        <CourseWorld seed={Number(course.id)} title={String(course.title)} theme={course.appearance.worldTheme} progress={0} className="min-h-[22rem] lg:min-h-[36rem]" />
        <div className="flex flex-col justify-center p-7 sm:p-12"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-signal">{String(course.category)}</p>
          <h1 className="display mt-4 text-[clamp(3.4rem,10vw,6.7rem)] leading-[.86]">{String(course.title)}</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/72">{String(course.description)}</p>
          <div className="mt-6 flex items-center gap-3 text-xs text-white/60"><span>{Number(course.lesson_count)} lessons</span><span>·</span><span>{Number(course.learner_count)} learners</span></div>
          <div className="mt-8 flex flex-wrap gap-3"><PublicCourseActions id={Number(course.id)} slug={slug} /><ShareCourseButton slug={slug} title={String(course.title)} /></div>
          <p className="mt-8 text-sm text-white/65">Created by {course.creator_slug ? <Link className="font-semibold text-white underline decoration-white/30 underline-offset-4" href={`/creator/${String(course.creator_slug)}`}>{String(course.creator_name)}</Link> : String(course.creator_name)}</p>
        </div>
      </section>
      <section className="mx-auto mt-14 max-w-4xl"><p className="section-label">Inside the course</p><h2 className="display mt-3 text-5xl">A clear path from source to understanding.</h2>
        <div className="mt-8 space-y-4">{course.modules.map((module, index) => <article key={module.id} className="rounded-[1.4rem] border border-line bg-card p-6 shadow-card sm:p-8"><div className="flex gap-5"><span className="display text-4xl text-teal/50">{String(index + 1).padStart(2, "0")}</span><div><h3 className="text-xl font-bold">{module.title}</h3><p className="mt-2 text-sm leading-6 text-ink-soft">{module.summary}</p><ul className="mt-5 grid gap-2 sm:grid-cols-2">{module.lessons.map((lesson) => <li key={lesson.id} className="rounded-xl bg-paper px-4 py-3 text-sm font-semibold">{lesson.title}<span className="ml-2 text-xs font-normal text-ink-soft">{lesson.card_count} steps</span></li>)}</ul></div></div></article>)}</div>
      </section>
    </main></div>;
}
