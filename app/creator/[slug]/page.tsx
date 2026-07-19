import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import ArtifactCoverImage from "@/components/ArtifactCoverImage";
import PublicFooter from "@/components/PublicFooter";
import PublicHeader from "@/components/PublicHeader";
import CourseWorld from "@/components/CourseWorld";
import { getPublicCreator } from "@/lib/public-product";
import { absoluteUrl, publicMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const creator = await getPublicCreator(slug);
  if (!creator) return { title: "Creator not found", robots: { index: false, follow: false } };
  const description = String(creator.creator_bio || creator.creator_headline || `Explore source-backed courses created by ${creator.name} on BookQuest.`);
  return publicMetadata({ title: `${String(creator.name)} — Course Creator`, description, path: `/creator/${slug}` });
}
export default async function CreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const creator = await getPublicCreator(slug);
  if (!creator) notFound();
  const courses = creator.courses;
  const creatorUrl = absoluteUrl(`/creator/${slug}`);

  return <div className="min-h-dvh bg-paper">
    <JsonLd data={[
      {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        name: `${String(creator.name)} on BookQuest`,
        url: creatorUrl,
        mainEntity: {
          "@type": "Person",
          name: String(creator.name),
          description: String(creator.creator_bio || creator.creator_headline),
          url: creatorUrl,
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Courses by ${String(creator.name)}`,
        numberOfItems: courses.length,
        itemListElement: courses.map((course, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Course",
            name: String(course.title),
            description: String(course.description),
            url: absoluteUrl(`/c/${String(course.public_slug)}`),
            provider: { "@type": "Person", name: String(creator.name), url: creatorUrl },
          },
        })),
      },
    ]} />
    <PublicHeader />
    <main className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <nav className="pb-1 pt-4 text-xs font-semibold text-ink-soft" aria-label="Breadcrumb"><Link href="/explore" className="hover:text-teal-deep">Courses</Link><span aria-hidden="true"> / </span><span>Creator</span></nav>
      <header className="mt-8 overflow-hidden rounded-[2rem] bg-pine p-8 text-white shadow-pop sm:p-14">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-signal text-3xl font-bold text-ink">{String(creator.name).slice(0, 1).toUpperCase()}</div>
        <p className="section-label mt-8 text-signal">Creator library</p>
        <h1 className="display mt-3 text-[clamp(3.5rem,11vw,6.5rem)] leading-[.88]">{String(creator.name)}</h1>
        <p className="mt-5 max-w-2xl text-lg text-white/75">{String(creator.creator_headline || "Thoughtful courses built from trusted sources.")}</p>
        {creator.creator_bio ? <p className="mt-5 max-w-2xl text-sm leading-6 text-white/60">{String(creator.creator_bio)}</p> : null}
      </header>
      <section className="mt-14">
        <p className="section-label">Published courses</p><h2 className="display mt-3 text-5xl">Open the library.</h2>
        {courses.length ? <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{courses.map((course) => <Link key={String(course.id)} href={`/c/${String(course.public_slug)}`} className="group overflow-hidden rounded-[1.5rem] border border-line bg-card shadow-card transition-transform hover:-translate-y-1"><div className="relative min-h-60 overflow-hidden"><CourseWorld seed={Number(course.id)} title={String(course.title)} theme={course.appearance.worldTheme} progress={0} className="absolute inset-0 min-h-full" /><ArtifactCoverImage kind="course" artifactId={Number(course.id)} contentHash={course.coverHash} variant="course" rendition="thumbnail" /></div><div className="p-6"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-teal">{String(course.category)}</p><h3 className="display mt-2 text-3xl">{String(course.title)}</h3><p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-soft">{String(course.description)}</p><p className="mt-4 text-xs font-semibold text-ink-soft">{Number(course.learner_count)} learner{Number(course.learner_count) === 1 ? "" : "s"}</p></div></Link>)}</div> : <div className="mt-8 rounded-[1.5rem] border border-dashed border-line-deep p-12 text-center text-ink-soft">The next course is being prepared.</div>}
      </section>
    </main>
    <PublicFooter />
  </div>;
}
