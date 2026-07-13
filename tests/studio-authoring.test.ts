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
let explanationBlockId: string;
let recapBlockId: string;

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

  it("versions appearance choices inside the authorized course draft", async () => {
    const appearance = {
      template: "modern-atlas" as const,
      worldTheme: "knowledge-city" as const,
      typography: "modern" as const,
      surface: "ivory" as const,
      accent: "teal" as const,
      atmosphere: "quiet" as const,
      readingWidth: "balanced" as const,
    };
    const updated = await studio.updateCourseAppearance(ownerId, courseId, appearance);
    expect(updated.appearance).toEqual(appearance);
    expect((await studio.getCourseStudio(ownerId, courseId)).version.appearance).toEqual(appearance);
    await expect(studio.updateCourseAppearance(outsiderId, courseId, appearance)).rejects.toMatchObject({
      reason: "membership_required",
    });
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
    explanationBlockId = explanation.id;
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
    recapBlockId = recap.id;
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

    const duplicate = await studio.duplicateCourseBlock(ownerId, courseId, explanation.id);
    expect(duplicate).toMatchObject({
      lessonKey: "lesson:first",
      blockType: "explanation",
      content: { body: "A manual edit survives." },
    });
    expect((await studio.getCourseStudio(ownerId, courseId)).blocks).toHaveLength(3);
    await studio.deleteCourseBlock(ownerId, courseId, duplicate.id);
    expect((await studio.getCourseStudio(ownerId, courseId)).blocks).toHaveLength(2);
    await expect(studio.deleteCourseBlock(outsiderId, courseId, explanation.id)).rejects.toMatchObject({
      reason: "membership_required",
    });
    await expect(studio.getCourseStudio(outsiderId, courseId)).rejects.toMatchObject({
      reason: "membership_required",
    });
  });

  it("opens the normalized source document only inside its authorized course", async () => {
    const studioData = await studio.getCourseStudio(ownerId, courseId);
    const sourceVersionId = String((studioData.sources[0] as { source_version_id: string }).source_version_id);
    const document = await studio.getCourseSourceDocument(ownerId, courseId, sourceVersionId);
    expect(document).toMatchObject({ sourceVersionId, version: 2 });
    expect(document.chapters[0]).toMatchObject({ title: "Policy", text: "Updated policy" });
    await expect(
      studio.getCourseSourceDocument(outsiderId, courseId, sourceVersionId)
    ).rejects.toMatchObject({ reason: "membership_required" });
  });

  it("edits the outline and regenerates only the selected scope", async () => {
    await studio.updateCourseOutline(ownerId, courseId, {
      moduleKey: "module:intro",
      moduleTitle: "Getting started",
      moduleSummary: "A revised outline summary",
      lessonKey: "lesson:first",
      lessonTitle: "Core ideas",
    });
    const outlined = await studio.getCourseStudio(ownerId, courseId);
    expect(outlined.blocks.every((block) =>
      block.moduleTitle === "Getting started" && block.lessonTitle === "Core ideas"
    )).toBe(true);

    const job = await studio.beginScopedRegeneration(ownerId, courseId, {
      type: "block",
      key: recapBlockId,
    });
    expect(job.targets).toHaveLength(1);
    const explanation = outlined.blocks.find((block) => block.id === explanationBlockId)!;
    await studio.updateCourseBlock(ownerId, courseId, explanationBlockId, {
      expectedRevision: explanation.revision,
      content: { type: "explanation", heading: "Start", body: "Manual work outside the scope survives." },
      sourceRefs: explanation.sourceRefs,
    });
    await studio.applyScopedRegeneration(ownerId, courseId, job.jobId, [{
      blockId: recapBlockId,
      expectedRevision: job.targets[0].expectedRevision,
      content: { type: "recap", heading: "Updated recap", points: ["Regenerated point"] },
    }]);
    const after = await studio.getCourseStudio(ownerId, courseId);
    expect(after.blocks.find((block) => block.id === explanationBlockId)).toMatchObject({
      revision: explanation.revision + 1,
      content: { body: "Manual work outside the scope survives." },
      editOrigin: "manual",
    });
    expect(after.blocks.find((block) => block.id === recapBlockId)).toMatchObject({
      revision: 2,
      content: { heading: "Updated recap" },
      editOrigin: "regenerated",
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
