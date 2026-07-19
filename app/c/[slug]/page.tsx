import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import ArtifactCoverImage from "@/components/ArtifactCoverImage";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import CourseWorld from "@/components/CourseWorld";
import PublicCourseActions from "@/components/PublicCourseActions";
import ShareCourseButton from "@/components/ShareCourseButton";
import PublicCourseViewTracker from "@/components/PublicCourseViewTracker";
import { getPublicCourseBySlug } from "@/lib/public-product";
import { absoluteUrl, publicMetadata } from "@/lib/seo";
import { coverImageUrl } from "@/lib/cover-contract";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const course = await getPublicCourseBySlug(slug);
  if (!course) return { title: "Course not found", robots: { index: false, follow: false } };
  const description = String(course.description || `Preview ${course.title}, an interactive course on BookQuest.`);
  return publicMetadata({
    title: String(course.title),
    description,
    path: `/c/${slug}`,
    image: coverImageUrl("course", Number(course.id), course.coverHash) ?? "/opengraph-image",
  });
}
export default async function PublicCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const course = await getPublicCourseBySlug(slug);
  if (!course) notFound();
  const courseUrl = absoluteUrl(`/c/${slug}`);
  const creatorUrl = course.creator_slug ? absoluteUrl(`/creator/${String(course.creator_slug)}`) : undefined;
  const provider = creatorUrl
    ? { "@type": "Person", name: String(course.creator_name), url: creatorUrl }
    : { "@type": "Organization", name: "BookQuest", url: absoluteUrl("/") };

  return <div className="min-h-dvh bg-paper">
    <JsonLd data={[
      {
        "@context": "https://schema.org",
        "@type": "Course",
        name: String(course.title),
        description: String(course.description),
        url: courseUrl,
        provider,
        hasPart: course.modules.map((module) => ({
          "@type": "LearningResource",
          name: module.title,
          description: module.summary,
          learningResourceType: "Module",
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Courses", item: absoluteUrl("/explore") },
          { "@type": "ListItem", position: 3, name: String(course.title), item: courseUrl },
        ],
      },
    ]} />
    <PublicCourseViewTracker slug={slug} />
    <PublicHeader />
    <main className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
      <nav className="pb-5 text-xs font-semibold text-ink-soft" aria-label="Breadcrumb">
        <Link href="/explore" className="hover:text-teal-deep">Courses</Link><span aria-hidden="true"> / </span><span>{String(course.title)}</span>
      </nav>
      <section className="grid overflow-hidden rounded-[2rem] bg-pine text-white shadow-pop lg:grid-cols-[1.05fr_.95fr]">
        <div className="relative min-h-[22rem] overflow-hidden lg:min-h-[36rem]">
          <CourseWorld seed={Number(course.id)} title={String(course.title)} theme={course.appearance.worldTheme} progress={0} className="absolute inset-0 min-h-full" />
          <ArtifactCoverImage kind="course" artifactId={Number(course.id)} contentHash={course.coverHash} variant="course" priority />
        </div>
        <div className="flex flex-col justify-center p-7 sm:p-12">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-signal">{String(course.category)}</p>
          <h1 className="display mt-4 text-[clamp(3.4rem,10vw,6.7rem)] leading-[.86]">{String(course.title)}</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/72">{String(course.description)}</p>
          <div className="mt-6 flex items-center gap-3 text-xs text-white/60"><span>{Number(course.lesson_count)} lessons</span><span>·</span><span>{Number(course.learner_count)} learners</span></div>
          <div className="mt-8 flex flex-wrap gap-3"><PublicCourseActions id={Number(course.id)} slug={slug} /><ShareCourseButton slug={slug} title={String(course.title)} /></div>
          <p className="mt-8 text-sm text-white/65">Created by {course.creator_slug ? <Link className="font-semibold text-white underline decoration-white/30 underline-offset-4" href={`/creator/${String(course.creator_slug)}`}>{String(course.creator_name)}</Link> : String(course.creator_name)}</p>
        </div>
      </section>
      <section className="mx-auto mt-14 max-w-4xl">
        <p className="section-label">Inside the course</p><h2 className="display mt-3 text-5xl">A clear path from source to understanding.</h2>
        <div className="mt-8 space-y-4">{course.modules.map((module, index) => <article key={module.id} className="rounded-[1.4rem] border border-line bg-card p-6 shadow-card sm:p-8"><div className="flex gap-5"><span className="display text-4xl text-teal/50">{String(index + 1).padStart(2, "0")}</span><div><h3 className="text-xl font-bold">{module.title}</h3><p className="mt-2 text-sm leading-6 text-ink-soft">{module.summary}</p><ul className="mt-5 grid gap-2 sm:grid-cols-2">{module.lessons.map((lesson) => <li key={lesson.id} className="rounded-xl bg-paper px-4 py-3 text-sm font-semibold">{lesson.title}<span className="ml-2 text-xs font-normal text-ink-soft">{lesson.card_count} steps</span></li>)}</ul></div></div></article>)}</div>
      </section>
    </main>
    <PublicFooter />
  </div>;
}
