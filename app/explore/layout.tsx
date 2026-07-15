import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import { listPublishedCourses } from "@/lib/db";
import { absoluteUrl, publicMetadata } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = publicMetadata({
  title: "Explore Interactive Courses",
  description: "Browse published BookQuest courses built from trusted source material. Preview lessons, meet creators, and begin a guided learning journey.",
  path: "/explore",
});

export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  let courses: Awaited<ReturnType<typeof listPublishedCourses>> = [];
  try {
    courses = await listPublishedCourses();
  } catch {
    // The interactive page already exposes a recoverable loading state.
  }
  const publicCourses = courses.filter((course) => Boolean(course.public_slug));
  return <div className="min-h-dvh bg-paper">
    {publicCourses.length >= 3 && <JsonLd data={{
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Published BookQuest courses",
      numberOfItems: publicCourses.length,
      itemListElement: publicCourses.map((course, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Course",
          name: course.title,
          description: course.description,
          url: absoluteUrl(`/c/${course.public_slug}`),
          provider: { "@type": "Person", name: course.owner_name },
        },
      })),
    }} />}
    <PublicHeader />
    {children}
    {publicCourses.length > 0 && <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8" aria-labelledby="public-course-directory">
      <div className="border-t border-line pt-14"><p className="section-label">Direct previews</p><h2 id="public-course-directory" className="display mt-3 text-4xl sm:text-5xl">Open a public course page.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-ink-soft">Preview course structure, creator information, and the learner journey before enrolling.</p></div>
      <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{publicCourses.map((course) => <li key={course.id}><Link href={`/c/${course.public_slug}`} className="flex h-full flex-col rounded-[1.25rem] border border-line bg-card p-5 shadow-card transition-transform hover:-translate-y-1"><span className="text-[10px] font-bold uppercase tracking-[.16em] text-teal">{course.category}</span><strong className="display mt-3 text-2xl font-normal">{course.title}</strong><span className="mt-3 line-clamp-2 text-sm leading-6 text-ink-soft">{course.description}</span><span className="mt-auto pt-5 text-xs font-bold text-teal-deep">Preview course →</span></Link></li>)}</ul>
    </section>}
    <PublicFooter />
  </div>;
}

