import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let studio: typeof import("../lib/studio");
let ownerId: number;
let personalSpaceId: string;
let courseId: number;
let generationRunId: string;
let firstDraftId: string;

describe.skipIf(!TEST_DB)("Phase 2 Course Studio foundation", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    studio = await import("../lib/studio");
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("studio-owner@example.test", "Studio Owner", "hash")).id;
    personalSpaceId = String(
      (
        await pg.one<{ id: string }>(
          "SELECT id FROM spaces WHERE personal_owner_user_id = $1",
          [ownerId]
        )
      )!.id
    );
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("initializes an upload as a pending source and editable course draft", async () => {
    const course = await db.createCourse(ownerId, "studio-source.pdf");
    courseId = course.id;
    generationRunId = course.generationRunId;
    const row = (await pg.one(
      `SELECT c.current_draft_version_id, c.source_collection_id,
              c.authoring_status, source.current_version AS source_version,
              collection.current_version AS collection_version,
              version.lifecycle_status AS version_status
       FROM courses c
       JOIN course_source_assets link ON link.course_id = c.id AND link.position = 0
       JOIN source_assets source ON source.id = link.source_id
       JOIN source_collections collection ON collection.id = c.source_collection_id
       JOIN course_versions version ON version.id = c.current_draft_version_id
       WHERE c.id = $1`,
      [courseId]
    )) as Record<string, unknown>;
    firstDraftId = String(row.current_draft_version_id);
    expect(row).toMatchObject({
      current_draft_version_id: expect.any(String),
      source_collection_id: expect.any(String),
      authoring_status: "draft",
      source_version: 0,
      collection_version: 0,
      version_status: "draft",
    });
  });

  it("records extracted content as immutable source and collection versions", async () => {
    await db.setCourseSource(
      courseId,
      JSON.stringify([{ title: "Chapter One", text: "Source-grounded content" }])
    );
    const version = (await pg.one(
      `SELECT source_version.version, source_version.content_hash,
              collection_version.version AS collection_version,
              course_version.source_collection_version_id
       FROM courses course
       JOIN course_source_assets link ON link.course_id = course.id
       JOIN source_assets source ON source.id = link.source_id
       JOIN source_versions source_version
         ON source_version.source_id = source.id AND source_version.version = source.current_version
       JOIN source_collections collection ON collection.id = course.source_collection_id
       JOIN source_collection_versions collection_version
         ON collection_version.collection_id = collection.id
        AND collection_version.version = collection.current_version
       JOIN course_versions course_version ON course_version.id = course.current_draft_version_id
       WHERE course.id = $1`,
      [courseId]
    )) as Record<string, unknown>;
    expect(version).toMatchObject({
      version: 1,
      content_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      collection_version: 1,
      source_collection_version_id: expect.any(String),
    });
    await expect(
      pg.q("UPDATE source_versions SET content_hash = 'tampered' WHERE version = 1")
    ).rejects.toThrow(/append-only/);
  });

  it("snapshots generated lessons into stable block lineages exactly once", async () => {
    await db.setCourseMeta(courseId, "Studio Course", "Editable generated draft", generationRunId);
    const moduleId = await db.createModule(
      courseId,
      "Foundations",
      "Core ideas",
      0,
      [0],
      generationRunId
    );
    await db.createLesson(
      moduleId,
      "First lesson",
      0,
      JSON.stringify([
        { type: "concept", title: "Grounding", body: "Use the source." },
        {
          type: "quiz_truefalse",
          concept: "grounding",
          statement: "Sources matter.",
          answer: true,
          explanation: "They support the claim.",
        },
      ]),
      {
        generatorModel: "test-model",
        promptVersion: "studio-test-v1",
        generationRunId,
      }
    );
    expect(await studio.syncGeneratedCourseDraft(courseId, generationRunId)).toBe(firstDraftId);
    expect(await studio.syncGeneratedCourseDraft(courseId, generationRunId)).toBe(firstDraftId);
    const rows = await pg.many<{ block_type: string; revision: number }>(
      `SELECT block.block_type, revision.revision
       FROM course_blocks block
       JOIN course_block_revisions revision ON revision.block_id = block.id
       WHERE block.course_version_id = $1 ORDER BY block.position`,
      [firstDraftId]
    );
    expect(rows).toEqual([
      { block_type: "explanation", revision: 1 },
      { block_type: "true_false", revision: 1 },
    ]);
  });

  it("branches retries without overwriting the prior draft", async () => {
    await db.setCourseStatus(courseId, "error", "retry test");
    const retryRun = await db.prepareCourseRetry(courseId);
    expect(retryRun).toBeTruthy();
    const rows = await pg.many<{
      id: string;
      version_number: number;
      parent_version_id: string | null;
    }>(
      `SELECT id, version_number, parent_version_id
       FROM course_versions WHERE course_id = $1 ORDER BY version_number`,
      [courseId]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: firstDraftId, version_number: 1 });
    expect(rows[1]).toMatchObject({ version_number: 2, parent_version_id: firstDraftId });
    expect(
      await pg.one("SELECT COUNT(*)::int AS count FROM course_blocks WHERE course_version_id = $1", [
        firstDraftId,
      ])
    ).toEqual({ count: 2 });
  });

  it("creates a blank manual draft without AI or generation credits", async () => {
    const before = (await db.getUserById(ownerId))!.credits;
    const blank = await studio.createBlankCourseDraft(ownerId, personalSpaceId, "Manual Course");
    const result = (await pg.one(
      `SELECT c.status, c.authoring_status, source.kind,
              source.current_version, version.lifecycle_status
       FROM courses c
       JOIN course_source_assets link ON link.course_id = c.id
       JOIN source_assets source ON source.id = link.source_id
       JOIN course_versions version ON version.id = c.current_draft_version_id
       WHERE c.id = $1`,
      [blank.courseId]
    )) as Record<string, unknown>;
    expect(result).toEqual({
      status: "ready",
      authoring_status: "draft",
      kind: "manual",
      current_version: 1,
      lifecycle_status: "draft",
    });
    expect((await db.getUserById(ownerId))!.credits).toBe(before);
  });
});
