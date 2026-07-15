import type { MetadataRoute } from "next";
import { listPublicSeoEntries } from "@/lib/public-product";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const staticPages = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/solutions", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/solutions/long-document-summarizer", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/solutions/pdf-to-course", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/solutions/ai-course-generator", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/solutions/employee-training", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/solutions/compliance-training", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/solutions/course-creators", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/solutions/offline-learning", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/explore", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/pricing", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/resources", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/security", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/accessibility", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/verify-credential", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/demo", priority: 0.6, changeFrequency: "monthly" as const },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticPages.map((page) => ({
    url: absoluteUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  try {
    const entries = await listPublicSeoEntries();
    return [
      ...staticEntries,
      ...entries.courses.map((course) => ({
        url: absoluteUrl(`/c/${course.slug}`),
        lastModified: new Date(course.createdAt),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
      ...entries.creators.map((creator) => ({
        url: absoluteUrl(`/creator/${creator.slug}`),
        lastModified: new Date(creator.createdAt),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
