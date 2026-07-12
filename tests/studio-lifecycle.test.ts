import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let studio: typeof import("../lib/studio");
let ownerId: number;
let spaceId: string;
let courseId: number;
let sourceVersionId: string;
let firstVersionId: string;
let blockLineageId: string;
let reviewCommentId: string;
let versionOnePracticeItem: import("../lib/learning-types").PracticeSessionItem;

describe.skipIf(!TEST_DB)("Phase 2 course review and publication lifecycle", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    studio = await import("../lib/studio");
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("publisher@example.test", "Publisher", "hash")).id;
    spaceId = (await spaces.createSpace(ownerId, { name: "Publishing Space", type: "private" })).space.id;
    const source = await studio.createTextSource(ownerId, spaceId, {
      title: "Approved Handbook",
      kind: "manual",
      content: [{ heading: "Safety", text: "Wear eye protection." }],
    });
    sourceVersionId = source.sourceVersionId;
    const course = await studio.createCourseDraftFromSources(ownerId, spaceId, {
      title: "Safe Workshop",
      sourceVersionIds: [sourceVersionId],
    });
    courseId = course.courseId;
    firstVersionId = course.courseVersionId;
    const block = await studio.addCourseBlock(ownerId, courseId, {
      moduleKey: "module:safety",
      moduleTitle: "Safety",
      lessonKey: "lesson:eyes",
      lessonTitle: "Protect your eyes",
      modulePosition: 0,
      lessonPosition: 0,
      blockType: "explanation",
      content: { type: "explanation", heading: "Eye protection", body: "Wear safety glasses." },
      sourceRefs: [{ sourceVersionId, locator: { heading: "Safety" } }],
    });
    blockLineageId = block.lineageId;
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("requires review and records append-only approval evidence", async () => {
    await expect(studio.publishApprovedCourseVersion(ownerId, courseId, "General"))
      .rejects.toThrow(/approved/i);
    expect(await studio.submitCourseVersionForReview(ownerId, courseId)).toMatchObject({
      versionId: firstVersionId,
      status: "review",
    });
    expect(await studio.reviewCourseVersion(ownerId, courseId, {
      decision: "commented",
      summary: "Source coverage checked",
    })).toMatchObject({ status: "review" });
    reviewCommentId = String((await studio.addCourseVersionComment(ownerId, courseId, {
      body: "Confirm the glasses standard before release",
      blockLineageId,
    })).id);
    expect(await studio.reviewCourseVersion(ownerId, courseId, {
      decision: "approved",
      summary: "Ready to publish",
      checklist: { accessibility: true, sources: true },
    })).toMatchObject({ status: "approved" });
    const reviews = await pg.many<{ decision: string }>(
      "SELECT decision FROM course_version_reviews WHERE course_version_id = $1 ORDER BY created_at",
      [firstVersionId]
    );
    expect(reviews.map((review) => review.decision)).toEqual(["commented", "approved"]);
    await expect(pg.q(
      "UPDATE course_version_reviews SET summary = 'rewritten' WHERE course_version_id = $1",
      [firstVersionId]
    )).rejects.toThrow(/append-only/i);
  });

  it("publishes an exact immutable version into the learner projection", async () => {
    await expect(studio.publishApprovedCourseVersion(ownerId, courseId, "General"))
      .rejects.toThrow(/open review comments/i);
    await studio.resolveCourseVersionComment(ownerId, courseId, reviewCommentId);
    const published = await studio.publishApprovedCourseVersion(ownerId, courseId, "General");
    expect(published).toMatchObject({ versionId: firstVersionId, versionNumber: 1 });
    const course = await pg.one<{
      content_version: number;
      published_version_id: string;
      current_draft_version_id: string | null;
      published: number;
    }>("SELECT content_version, published_version_id, current_draft_version_id, published FROM courses WHERE id = $1", [courseId]);
    expect(course).toEqual({
      content_version: 1,
      published_version_id: firstVersionId,
      current_draft_version_id: null,
      published: 1,
    });
    const lesson = await pg.one<{ content_version: number; cards: string }>(
      `SELECT lesson.content_version, lesson.cards FROM lessons lesson
       JOIN modules module ON module.id = lesson.module_id
       WHERE module.course_id = $1 AND lesson.content_version = 1`,
      [courseId]
    );
    expect(lesson?.content_version).toBe(1);
    expect(JSON.parse(lesson!.cards)).toEqual([
      { type: "concept", title: "Eye protection", body: "Wear safety glasses." },
    ]);
    await expect(pg.q("UPDATE course_versions SET title = 'tampered' WHERE id = $1", [firstVersionId]))
      .rejects.toThrow(/immutable/i);
    const practice = await db.createPracticeSession(ownerId, courseId, [{
      concept: "eye protection",
      card: {
        type: "quiz_truefalse",
        concept: "eye protection",
        statement: "Safety glasses protect your eyes.",
        answer: true,
        explanation: "They reduce exposure to debris.",
      },
    }], false);
    versionOnePracticeItem = practice.items[0];
    expect(versionOnePracticeItem.courseVersion).toBe(1);
  });

  it("branches the published version, preserves lineage, diffs, and supersedes safely", async () => {
    const draft = await studio.branchPublishedCourseVersion(ownerId, courseId);
    expect(draft).toMatchObject({ versionNumber: 2, parentVersionId: firstVersionId });
    const block = (await studio.getCourseStudio(ownerId, courseId)).blocks[0];
    expect(block.lineageId).toBe(blockLineageId);
    await studio.updateCourseBlock(ownerId, courseId, block.id, {
      expectedRevision: 1,
      content: { type: "explanation", heading: "Eye protection", body: "Wear approved safety glasses." },
      sourceRefs: [{ sourceVersionId }],
    });
    expect(await studio.diffCourseVersions(ownerId, courseId, firstVersionId, draft.versionId))
      .toMatchObject({ added: [], removed: [], changed: [blockLineageId] });
    await studio.submitCourseVersionForReview(ownerId, courseId);
    await studio.reviewCourseVersion(ownerId, courseId, { decision: "approved" });
    await studio.publishApprovedCourseVersion(ownerId, courseId, "General");
    await db.recordAnswerEvidence({
      courseId,
      courseVersion: versionOnePracticeItem.courseVersion,
      questionId: versionOnePracticeItem.questionId,
      concept: versionOnePracticeItem.concept,
      card: versionOnePracticeItem.card,
      eventId: "phase2-version-one-answer",
      userId: ownerId,
      answer: true,
      responseTimeMs: 500,
      occurredAt: new Date().toISOString(),
      sessionKind: "practice",
      sessionId: "phase2-version-one-session",
    });
    expect(await pg.one<{ course_version: number }>(
      "SELECT course_version FROM learning_events WHERE event_id = 'phase2-version-one-answer'"
    )).toEqual({ course_version: 1 });
    const versions = await pg.many<{ id: string; lifecycle_status: string }>(
      "SELECT id, lifecycle_status FROM course_versions WHERE course_id = $1 ORDER BY version_number",
      [courseId]
    );
    expect(versions).toEqual([
      { id: firstVersionId, lifecycle_status: "superseded" },
      { id: draft.versionId, lifecycle_status: "published" },
    ]);
    await expect(pg.q(
      "UPDATE course_versions SET title = 'tampered again' WHERE id = $1",
      [firstVersionId]
    )).rejects.toThrow(/immutable/i);
  });

  it("archives an unpublished working version without changing published history", async () => {
    const draft = await studio.branchPublishedCourseVersion(ownerId, courseId);
    expect(await studio.archiveCourseDraftVersion(ownerId, courseId)).toEqual({
      versionId: draft.versionId,
      status: "archived",
    });
    const course = await pg.one<{ authoring_status: string; current_draft_version_id: string | null }>(
      "SELECT authoring_status, current_draft_version_id FROM courses WHERE id = $1",
      [courseId]
    );
    expect(course).toEqual({ authoring_status: "published", current_draft_version_id: null });
  });
});
