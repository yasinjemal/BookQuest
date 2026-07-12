import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let studio: typeof import("../lib/studio");
let ownerId: number;
let outsiderId: number;
let spaceId: string;
let firstSourceId: string;
let firstSourceVersionId: string;
let secondSourceVersionId: string;
let courseId: number;

describe.skipIf(!TEST_DB)("Phase 2 source library and editable blocks", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    studio = await import("../lib/studio");
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("author@example.test", "Author", "hash")).id;
    outsiderId = (await db.createUser("outsider-author@example.test", "Outsider", "hash")).id;
    spaceId = (await spaces.createSpace(ownerId, { name: "Authoring Space", type: "private" })).space.id;
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("creates, versions and governs Space-owned sources without overwriting history", async () => {
    const first = await studio.createTextSource(ownerId, spaceId, {
      title: "Policy Manual",
      kind: "manual",
      content: [{ title: "Policy", text: "Original policy" }],
    });
    firstSourceId = first.sourceId;
    firstSourceVersionId = first.sourceVersionId;
    const second = await studio.createTextSource(ownerId, spaceId, {
      title: "Interview Transcript",
      kind: "transcript",
      content: [{ speaker: "A", text: "Supporting evidence" }],
    });
    secondSourceVersionId = second.sourceVersionId;

    expect(await studio.listSourcesForSpace(ownerId, spaceId)).toHaveLength(2);
    await expect(studio.listSourcesForSpace(outsiderId, spaceId)).rejects.toMatchObject({
      reason: "membership_required",
    });

    const replacement = await studio.replaceSourceContent(ownerId, firstSourceId, {
      content: [{ title: "Policy", text: "Updated policy" }],
      provenance: { reason: "approved revision" },
    });
    expect(replacement.version).toBe(2);
    const history = await pg.many<{ version: number }>(
      "SELECT version FROM source_versions WHERE source_id = $1 ORDER BY version",
      [firstSourceId]
    );
    expect(history.map((row) => row.version)).toEqual([1, 2]);

    await studio.updateSourceGovernance(ownerId, firstSourceId, {
      lifecycleStatus: "archived",
      accessPolicy: "owner",
      retentionPolicy: { retainDays: 365 },
    });
    await expect(
      studio.replaceSourceContent(ownerId, firstSourceId, { content: "blocked" })
    ).rejects.toThrow(/restore/i);
    await studio.updateSourceGovernance(ownerId, firstSourceId, { lifecycleStatus: "active" });
  });

  it("creates one controlled course collection from multiple source versions", async () => {
    const firstCurrent = (await pg.one<{ id: string }>(
      "SELECT id FROM source_versions WHERE source_id = $1 ORDER BY version DESC LIMIT 1",
      [firstSourceId]
    ))!.id;
    const course = await studio.createCourseDraftFromSources(ownerId, spaceId, {
      title: "Multi-source Course",
      sourceVersionIds: [firstCurrent, secondSourceVersionId],
    });
    courseId = course.courseId;
    const items = await pg.many<{ position: number; usage_policy: string }>(
      `SELECT item.position, item.usage_policy
       FROM source_collection_version_items item
       JOIN course_versions version
         ON version.source_collection_version_id = item.collection_version_id
       WHERE version.id = $1 ORDER BY item.position`,
      [course.courseVersionId]
    );
    expect(items).toEqual([
      { position: 0, usage_policy: "primary" },
      { position: 1, usage_policy: "supporting" },
    ]);
    expect(firstSourceVersionId).not.toBe(firstCurrent);
  });

  it("adds, edits and reorders validated blocks with optimistic revisions", async () => {
    const studioData = await studio.getCourseStudio(ownerId, courseId);
    const sourceVersionId = String((studioData.sources[0] as { source_version_id: string }).source_version_id);
    const explanation = await studio.addCourseBlock(ownerId, courseId, {
      moduleKey: "module:intro",
      moduleTitle: "Introduction",
      lessonKey: "lesson:first",
      lessonTitle: "First lesson",
      modulePosition: 0,
      lessonPosition: 0,
      blockType: "explanation",
      content: { type: "explanation", heading: "Start", body: "Grounded content" },
      sourceRefs: [{ sourceVersionId, locator: { section: "Policy" } }],
    });
    const recap = await studio.addCourseBlock(ownerId, courseId, {
      moduleKey: "module:intro",
      moduleTitle: "Introduction",
      lessonKey: "lesson:first",
      lessonTitle: "First lesson",
      modulePosition: 0,
      lessonPosition: 0,
      blockType: "recap",
      content: { type: "recap", heading: "Remember", points: ["One point"] },
      sourceRefs: [{ sourceVersionId }],
    });
    await expect(
      studio.addCourseBlock(ownerId, courseId, {
        moduleKey: "module:intro",
        moduleTitle: "Introduction",
        lessonKey: "lesson:first",
        lessonTitle: "First lesson",
        modulePosition: 0,
        lessonPosition: 0,
        blockType: "image",
        content: { type: "image", url: "/chart.png", altText: "", decorative: false },
      })
    ).rejects.toThrow(/alt text/i);

    const edited = await studio.updateCourseBlock(ownerId, courseId, explanation.id, {
      expectedRevision: 1,
      content: { type: "explanation", heading: "Start", body: "A manual edit survives." },
      sourceRefs: [{ sourceVersionId }],
    });
    expect(edited).toMatchObject({ revision: 2, editOrigin: "manual" });
    await expect(
      studio.updateCourseBlock(ownerId, courseId, explanation.id, {
        expectedRevision: 1,
        content: { type: "explanation", heading: "Stale", body: "Must fail" },
      })
    ).rejects.toThrow(/changed since/i);

    await studio.reorderLessonBlocks(ownerId, courseId, "lesson:first", [recap.id, explanation.id]);
    const reordered = (await studio.getCourseStudio(ownerId, courseId)).blocks;
    expect(reordered.map((block) => block.id)).toEqual([recap.id, explanation.id]);
    await expect(studio.getCourseStudio(outsiderId, courseId)).rejects.toMatchObject({
      reason: "membership_required",
    });
  });

  it("reports source coverage, accessibility and channel fallbacks", async () => {
    const report = await studio.analyzeCourseVersion(ownerId, courseId);
    expect(report).toMatchObject({
      totalBlocks: 2,
      tracedBlocks: 2,
      unsupportedBlockIds: [],
      accessibilityIssueBlockIds: [],
    });
    expect(report.blocks.every((block) => block.offline)).toBe(true);
  });
});
