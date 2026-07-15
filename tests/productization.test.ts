import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("public-launch productization contract", () => {
  it("states the document-to-course promise and sends verified creators to first-course onboarding", () => {
    const home = source("app/page.tsx");
    const verification = source("components/VerifyEmailClient.tsx");

    expect(home).toContain(
      "Upload a PDF, manual, policy, book, notes, or presentation. Create an editable course with lessons, quizzes, source references, progress tracking, credentials, and supported offline access.",
    );
    expect(home).toContain("Turn trusted documents into");
    expect(home).toContain('(!loaded && me === null)');
    expect(home).toContain("Create your first course");
    expect(verification).toContain('href={nextPath}');
    expect(verification).toContain("bookquest.after-verification");
  });

  it("ships crawlable SEO discovery routes and structured public entities", () => {
    const layout = source("app/layout.tsx");
    const sitemap = source("app/sitemap.ts");
    const robots = source("app/robots.ts");
    const publicCourse = source("app/c/[slug]/page.tsx");
    const creator = source("app/creator/[slug]/page.tsx");
    const explore = source("app/explore/layout.tsx");

    expect(layout).toContain("metadataBase: SITE_URL");
    expect(layout).toContain('"@type": "SoftwareApplication"');
    expect(sitemap).toContain("listPublicSeoEntries");
    expect(sitemap).toContain("/solutions/pdf-to-course");
    expect(sitemap).toContain("/solutions/long-document-summarizer");
    expect(robots).toContain('disallow: ["/api/", "/admin/", "/studio/", "/lti/"]');
    expect(publicCourse).toContain('"@type": "Course"');
    expect(creator).toContain('"@type": "ProfilePage"');
    expect(explore).toContain("Preview course →");
  });

  it("keeps document upload primary while offering separate output destinations", () => {
    const create = source("app/create/page.tsx");

    expect(create).toContain("What should this document become?");
    expect(create).toContain('title: "Deep summary"');
    expect(create).toContain('title: "Interactive course"');
    expect(create).toContain('title: "Summary + course"');
    expect(create).toContain("More ways to create");
    expect(create).toContain('creationMethods.filter((method) => method.id !== "ai")');
    expect(create).toContain("Private by default");
    expect(create).toContain("Nothing publishes automatically");
  });

  it("places interoperability controls behind advanced disclosure", () => {
    const studio = source("app/studio/[id]/page.tsx");
    const space = source("app/spaces/[id]/page.tsx");

    expect(studio).toContain("Advanced assessment exchange");
    expect(space).toContain("Advanced &amp; developer settings");
    expect(space).toContain("Normal course creation, teaching, and sharing do not need them.");
  });

  it("ships the complete public launch surface with privacy-safe defaults", () => {
    const publicCourse = source("app/c/[slug]/page.tsx");
    const sharing = source("components/ShareCourseButton.tsx");
    const pricing = source("app/pricing/page.tsx");
    const reader = source("components/DocumentReader.tsx");
    const analytics = source("components/CreatorDashboard.tsx");
    const creator = source("app/creator/[slug]/page.tsx");
    const demo = source("app/demo/page.tsx");
    const migration = source("lib/migrations.ts");

    expect(publicCourse).toContain("Inside the course");
    expect(sharing).toContain("navigator.share");
    expect(sharing).toContain("navigator.clipboard.writeText");
    expect(pricing).toContain("30 days · renew manually");
    expect(pricing).toContain("not an automatically recurring subscription");
    expect(reader).toContain("Find in document");
    expect(reader).toContain("Increase text size");
    expect(analytics).toContain("Make my creator page public");
    expect(creator).toContain("Published courses");
    expect(demo).toContain("The Blacksteel Shop Playbook");
    expect(migration).toContain("public_course_events");
    expect(migration).not.toContain("visitor_id");
  });

  it("keeps source reading authenticated and public course lookup published-only", () => {
    const readerRoute = source("app/api/courses/[id]/reader/route.ts");
    const publicProduct = source("lib/public-product.ts");
    expect(readerRoute).toContain("requireUser");
    expect(publicProduct).toContain("c.published = 1 AND c.status = 'ready'");
    expect(publicProduct).toContain("creator_public = TRUE");
    expect(publicProduct).toContain("await canAccessCourse(userId, courseId)");
  });
});
