import type { Metadata } from "next";

const configuredUrl =
  process.env.APP_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const SITE_URL = new URL(configuredUrl);
export const SITE_NAME = "BookQuest";
export const SITE_DESCRIPTION =
  "Turn PDFs, manuals, policies, books, and presentations into editable, source-backed interactive courses with lessons, quizzes, progress tracking, and offline access.";

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function publicMetadata({
  title,
  description,
  path,
  image = "/opengraph-image",
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_ZA",
      images: [{ url: image, width: 1200, height: 630, alt: `${title} — BookQuest` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

