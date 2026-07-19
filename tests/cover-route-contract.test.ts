import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("artifact cover contract", () => {
  it("ships authenticated, rate-limited mutations and private book delivery", () => {
    const book = source("app/api/books/[id]/cover/route.ts");
    const course = source("app/api/courses/[id]/cover/route.ts");
    for (const route of [book, course]) {
      expect(route).toContain("requireUser");
      expect(route).toContain("RATE_LIMITS.coverUploadUser");
      expect(route).toContain("coverUploadFromRequest");
      expect(route).toContain("export async function PUT");
      expect(route).toContain("export async function DELETE");
    }
    expect(book).toContain('coverImageResponse(req, cover, "private")');
    expect(book).toContain("getOwnedReadingEditionCoverImage");
    expect(course).toContain('authorizeCourseAction(userId, id, "content.update")');
    expect(course).toContain("setCourseDraftCover");
    expect(course).toContain("clearCourseDraftCover");
    expect(course).toContain('authorizeStoredMembership(user.id, course.owning_space_id, "content.review", pool)');
  });

  it("normalizes covers without AI and bounds public cache revocation", () => {
    const images = source("lib/cover-processing.ts");
    const http = source("lib/cover-http.ts");
    expect(images).toContain('new Set(["jpeg", "png", "webp"])');
    expect(images).toContain("limitInputPixels");
    expect(images).toContain("MAX_CONCURRENT_COVER_TRANSFORMS = 2");
    expect(images).toContain(".rotate()");
    expect(images).toContain(".webp(");
    expect(images).not.toContain("anthropic");
    expect(http).toContain('"private, no-store"');
    expect(http).toContain("max-age=300");
    expect(http).not.toContain("stale-while-revalidate");
    expect(http).toContain('req.headers.get("content-length")');
    expect(http).toContain('"X-Content-Type-Options": "nosniff"');
  });

  it("keeps generated worlds behind uploaded covers on every primary surface", () => {
    for (const path of [
      "components/CourseGalleryCard.tsx",
      "components/CourseOverviewHero.tsx",
      "components/CourseAppearanceEditor.tsx",
      "components/ReadingEditionCard.tsx",
      "components/ReadingEditionReader.tsx",
      "app/page.tsx",
      "app/explore/page.tsx",
      "app/c/[slug]/page.tsx",
      "app/creator/[slug]/page.tsx",
    ]) {
      const component = source(path);
      expect(component).toContain("CourseWorld");
      expect(component).toContain("ArtifactCoverImage");
    }
  });

  it("copies draft covers through branching, diffs and publishing", () => {
    const studio = source("lib/studio.ts");
    expect(studio).toContain("parent.cover_image_hash");
    expect(studio).toContain("coverChanged:");
    expect(studio).toContain("appearance_json = $7, cover_image_hash = $8");
    expect(studio).toContain("changeCourseDraftCover");
    expect(studio).toContain("lockCourseMutation");
    expect(source("lib/course-mutation-lock.ts")).toContain("pg_advisory_xact_lock");
    expect(studio).toContain("course.cover_updated");
    expect(source("lib/migrations.ts")).toContain("Published course versions are immutable");
  });
});
