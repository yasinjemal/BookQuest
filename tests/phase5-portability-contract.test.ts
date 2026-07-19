import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Phase 5 course portability surface", () => {
  it("keeps export private, rate limited, versioned and download-only", () => {
    const route = source("app/api/studio/courses/[id]/portable/route.ts");
    expect(route).toContain("requireUser");
    expect(route).toContain("privacyExportUser");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).toContain("application/vnd.bookquest.course+json");
    expect(route).toContain("JSON.stringify(coursePackage)");
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
  });

  it("makes inspection explicit before a private-draft restore", () => {
    const create = source("app/create/page.tsx");
    const route = source("app/api/studio/imports/course/route.ts");
    expect(create).toContain('mode: "dry_run"');
    expect(create).toContain("Dry-run passed");
    expect(create).toContain("Archive needs attention");
    expect(create).toContain("!portableReport.canImport");
    expect(create).toContain("Restore as private draft");
    expect(create).toContain("Learners, answers, credentials, members, and secrets are never imported");
    expect(route).toContain("analyzeCourseArchive");
    expect(route).toContain("importCourseArchive");
    expect(route).toContain("MAX_COURSE_IMPORT_REQUEST_BYTES");
  });

  it("publishes one canonical format and preserves the unfinished full-install gate", () => {
    const implementation = source("lib/portability.ts");
    const tracker = source("docs/PLATFORM_PHASE_TRACKER.md");
    expect(implementation).toContain('COURSE_ARCHIVE_FORMAT = "bookquest.course"');
    expect(implementation).toContain("COURSE_ARCHIVE_SCHEMA_VERSION = 2");
    expect(implementation).toContain("CourseArchiveSchemaV1");
    expect(implementation).toContain("validateStoredCoverImage");
    expect(implementation).toContain("portable_course_imports");
    expect(implementation).toContain("content.create");
    expect(tracker).toContain("**Engineering status:** Tested (15 July 2026 UTC; bounded sovereign core)");
    expect(tracker).toContain("Full Space restore is deferred");
    expect(tracker).toContain("- [ ] A full export restores into a clean compatible installation.");
  });

  it("publishes a separate recipe archive with dry-run and private restore controls", () => {
    const implementation = source("lib/portability.ts");
    const exportRoute = source("app/api/studio/recipes/[id]/portable/route.ts");
    const importRoute = source("app/api/studio/imports/recipe/route.ts");
    const create = source("app/create/page.tsx");
    expect(implementation).toContain('RECIPE_ARCHIVE_FORMAT = "bookquest.recipe"');
    expect(implementation).toContain("portable_recipe_imports");
    expect(exportRoute).toContain("application/vnd.bookquest.recipe+json");
    expect(importRoute).toContain("analyzeRecipeArchive");
    expect(importRoute).toContain("importRecipeArchive");
    expect(create).toContain("Restore a portable recipe");
    expect(create).toContain("Recipe needs attention");
    expect(create).toContain("Restore private recipe");
  });
});
