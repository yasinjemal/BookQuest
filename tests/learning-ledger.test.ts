import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuizCard } from "../lib/learning-types";

// This is a database integration test. It runs against a *dedicated* scratch
// Postgres set via TEST_DATABASE_URL (it TRUNCATEs tables), so it is skipped by
// default to avoid touching the real Neon database. To run it:
//   TEST_DATABASE_URL=postgres://... npm test
const TEST_DB = process.env.TEST_DATABASE_URL;

let data: typeof import("../lib/db");
let pg: typeof import("../lib/pg");
let userId: number;
let courseId: number;
let lessonId: number;
let answerSessionId: string;
let practiceSessionId: string;

const card: QuizCard = {
  type: "quiz_mcq",
  concept: "compound interest",
  question: "What happens when earned interest also earns interest?",
  options: ["Compounding", "Discounting", "Depreciation", "Taxation"],
  correct_index: 0,
  explanation: "Compounding earns returns on earlier returns.",
};

describe.skipIf(!TEST_DB)("learning evidence ledger", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    data = await import("../lib/db");
    await pg.ready();
    // Clean slate so the global count assertions below are deterministic.
    await pg.q(`TRUNCATE
      learning_events, lesson_completion_events, question_versions, concepts,
      learning_identities, answer_sessions, practice_sessions, concept_mastery,
      progress, user_stats, review_items, enrollments, certificates,
      classroom_assignments, classroom_members, classrooms, transactions,
      account_tokens, sessions, lessons, modules, courses, users
      RESTART IDENTITY CASCADE`);

    const user = await data.createUser("ledger@example.com", "Ledger Learner", "hash");
    userId = user.id;
    courseId = (await data.createCourse(userId, "finance.pdf")).id;
    const moduleId = await data.createModule(courseId, "Finance", "Core ideas", 0);
    lessonId = await data.createLesson(
      moduleId,
      "Interest",
      0,
      JSON.stringify([card]),
      { generatorModel: "test-model", promptVersion: "test-prompt-v1" }
    );
    answerSessionId = (await data.createLessonAnswerSession(userId, lessonId))!.id;
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("appends one event and updates mastery in the same operation", async () => {
    const result = await data.recordAnswerEvidence({
      eventId: "event_exactly_once_1",
      userId,
      courseId,
      lessonId,
      cardIndex: 0,
      questionId: `lesson:${lessonId}:card:0`,
      concept: "compound interest",
      card,
      answer: 0,
      responseTimeMs: 3200,
      occurredAt: new Date().toISOString(),
      sessionKind: "lesson",
      sessionId: answerSessionId,
    });

    expect(result.inserted).toBe(true);
    expect(result.correct).toBe(true);
    expect(result.masteryBefore).toBeCloseTo(0.5);
    expect(result.masteryAfter).toBeCloseTo(0.65);

    const row = (await pg.one(
      "SELECT * FROM learning_events WHERE event_id = $1",
      ["event_exactly_once_1"]
    )) as Record<string, unknown>;
    expect(row).toMatchObject({
      is_correct: 1,
      session_kind: "lesson",
      mastery_algorithm_version: "ewma-v1",
      schema_version: 2,
    });
    expect(String(row.learner_key)).toMatch(/^learner_/);
  });

  it("treats replay as a duplicate without inflating mastery", async () => {
    const duplicate = await data.recordAnswerEvidence({
      eventId: "event_exactly_once_1",
      userId,
      courseId,
      lessonId,
      cardIndex: 0,
      questionId: `lesson:${lessonId}:card:0`,
      concept: "compound interest",
      card,
      answer: 0,
      responseTimeMs: 3200,
      occurredAt: new Date().toISOString(),
      sessionKind: "lesson",
      sessionId: answerSessionId,
    });

    expect(duplicate.inserted).toBe(false);
    const count = (await pg.one(
      "SELECT COUNT(*)::int AS count FROM learning_events"
    )) as { count: number };
    expect(count.count).toBe(1);
    const mastery = (await data.getCourseMastery(userId, courseId))[0];
    expect(mastery).toMatchObject({ correct: 1, wrong: 0 });
    expect(mastery.mastery).toBeCloseTo(0.65);

    const semanticReplay = await data.recordAnswerEvidence({
      eventId: "event_same_attempt_new_transport_id",
      userId,
      courseId,
      lessonId,
      cardIndex: 0,
      questionId: `lesson:${lessonId}:card:0`,
      concept: "compound interest",
      card,
      answer: 0,
      responseTimeMs: 3200,
      occurredAt: new Date().toISOString(),
      sessionKind: "lesson",
      sessionId: answerSessionId,
    });
    expect(semanticReplay.inserted).toBe(false);
    expect(semanticReplay.eventId).toBe("event_exactly_once_1");

    await expect(
      data.recordAnswerEvidence({
        eventId: "event_exactly_once_1",
        userId,
        courseId,
        lessonId,
        cardIndex: 0,
        questionId: `lesson:${lessonId}:card:0`,
        concept: "compound interest",
        card,
        answer: 1,
        responseTimeMs: 3200,
        occurredAt: new Date().toISOString(),
        sessionKind: "lesson",
        sessionId: answerSessionId,
      })
    ).rejects.toThrow(data.EvidenceConflictError);

    expect(
      await data.getLessonEvidenceSummary(userId, lessonId, answerSessionId)
    ).toEqual({ score: 1, total: 1, correctCardIndexes: [0], wrongCardIndexes: [] });
  });

  it("rejects mutation and deletion of historical events", async () => {
    await expect(
      pg.q("UPDATE learning_events SET is_correct = 0 WHERE event_id = $1", [
        "event_exactly_once_1",
      ])
    ).rejects.toThrow(/append-only/);
    await expect(
      pg.q("DELETE FROM learning_events WHERE event_id = $1", [
        "event_exactly_once_1",
      ])
    ).rejects.toThrow(/append-only/);
    const qv = (await pg.one("SELECT id FROM question_versions LIMIT 1")) as {
      id: string;
    };
    await expect(
      pg.q("UPDATE question_versions SET content_json = '{}' WHERE id = $1", [
        qv.id,
      ])
    ).rejects.toThrow(/immutable/);
  });

  it("reports calibration and database health", async () => {
    expect((await data.questionCalibration(10))[0]).toMatchObject({
      attempts: 1,
      unique_learners: 1,
      correct_rate: 1,
    });
    expect(await data.learningLedgerHealth()).toMatchObject({
      events: 1,
      learners: 1,
      question_versions: 1,
      malformed: 0,
    });
  });

  it("persists fresh practice questions before they are answered", async () => {
    const session = await data.createPracticeSession(
      userId,
      courseId,
      [{ concept: "compound interest", card }],
      true,
      { generatorModel: "test-model", promptVersion: "practice-v1" }
    );
    practiceSessionId = session.id;
    expect((await data.getPracticeSession(userId, session.id))?.items[0]).toMatchObject(
      {
        questionId: `${session.id}:question:0`,
        concept: "compound interest",
      }
    );
    const registered = (await pg.one(
      "SELECT COUNT(*)::int AS count FROM question_versions WHERE question_id = $1",
      [`${session.id}:question:0`]
    )) as { count: number };
    expect(registered.count).toBe(1);
  });

  it("does not award lesson XP twice when completion is replayed", async () => {
    expect(await data.completeLesson(userId, lessonId, 1, 1, 15)).toBe(15);
    expect(await data.completeLesson(userId, lessonId, 1, 1, 15)).toBe(0);
    expect((await data.getStats(userId)).total_xp).toBe(15);
  });

  it("preserves historical evidence and rejects new cached evidence after source deletion", async () => {
    const delayedSession = (await data.getPracticeSession(userId, practiceSessionId))!;
    await expect(data.deleteCourse(courseId)).resolves.not.toThrow();
    const event = (await pg.one(
      "SELECT course_id, lesson_id FROM learning_events WHERE event_id = $1",
      ["event_exactly_once_1"]
    )) as { course_id: number; lesson_id: number };
    expect(event).toEqual({ course_id: courseId, lesson_id: lessonId });

    const question = (await pg.one(
      "SELECT course_id, content_json FROM question_versions LIMIT 1"
    )) as { course_id: number | null; content_json: string };
    expect(question.course_id).toBeNull();
    expect(question.content_json).toContain("earned interest");

    const delayedItem = delayedSession.items[0];
    await expect(
      data.recordAnswerEvidence({
        eventId: "event_after_course_deletion",
        userId,
        courseId,
        questionId: delayedItem.questionId,
        concept: delayedItem.concept,
        card: delayedItem.card,
        answer: 0,
        responseTimeMs: 4000,
        occurredAt: new Date().toISOString(),
        sessionKind: "practice",
        sessionId: delayedSession.id,
      })
    ).rejects.toMatchObject({ name: "CourseParticipationRevokedError" });
    const rejected = (await pg.one(
      "SELECT COUNT(*)::int AS count FROM learning_events WHERE event_id = $1",
      ["event_after_course_deletion"]
    )) as { count: number };
    expect(rejected.count).toBe(0);
  });

  it("consumes account tokens once and invalidates sessions after reset", async () => {
    const verifyHash = "a".repeat(64);
    await data.createAccountToken(
      userId,
      "verify_email",
      verifyHash,
      new Date(Date.now() + 60_000).toISOString()
    );
    expect(await data.verifyEmailWithToken(verifyHash)).toBe(true);
    expect(await data.verifyEmailWithToken(verifyHash)).toBe(false);
    expect((await data.getUserById(userId))?.email_verified_at).toBeTruthy();

    await data.createSession(userId, "session_before_password_reset");
    const resetHash = "b".repeat(64);
    await data.createAccountToken(
      userId,
      "reset_password",
      resetHash,
      new Date(Date.now() + 60_000).toISOString()
    );
    expect(await data.resetPasswordWithToken(resetHash, "replacement-hash")).toBe(
      userId
    );
    expect(await data.resetPasswordWithToken(resetHash, "another-hash")).toBeUndefined();
    expect(await data.getSessionUser("session_before_password_reset")).toBeUndefined();
    expect((await data.getUserById(userId))?.password_hash).toBe("replacement-hash");
  });

  it("rejects every stale generation write after a retry rotates the run", async () => {
    const created = await data.createCourse(userId, "stale-worker.pdf");
    await data.setCourseStatus(
      created.id,
      "error",
      "retry test",
      created.generationRunId
    );
    const nextRunId = await data.prepareCourseRetry(created.id);
    expect(nextRunId).toBeTruthy();
    expect(nextRunId).not.toBe(created.generationRunId);

    await expect(
      data.touchGenerationHeartbeat(created.id, created.generationRunId)
    ).rejects.toThrow(data.StaleGenerationRunError);
    await expect(
      data.setCourseMeta(
        created.id,
        "Stale title",
        "Stale description",
        created.generationRunId
      )
    ).rejects.toThrow(data.StaleGenerationRunError);
    await expect(
      data.createModule(
        created.id,
        "Stale module",
        "Must not be inserted",
        0,
        [],
        created.generationRunId
      )
    ).rejects.toThrow(data.StaleGenerationRunError);

    await expect(
      data.touchGenerationHeartbeat(created.id, nextRunId!)
    ).resolves.toBeUndefined();
    const moduleId = await data.createModule(
      created.id,
      "Current module",
      "Allowed",
      0,
      [],
      nextRunId
    );
    const module = (await pg.one("SELECT generation_run_id FROM modules WHERE id = $1", [
      moduleId,
    ])) as { generation_run_id: string };
    expect(module.generation_run_id).toBe(nextRunId);
  });

  it("atomically leases a stalled generation recovery once per cooldown", async () => {
    const created = await data.createCourse(userId, "recovery-lease.pdf");
    await data.setCourseStatus(
      created.id,
      "generating",
      undefined,
      created.generationRunId
    );
    await pg.q(
      "UPDATE courses SET generation_heartbeat = $2 WHERE id = $1",
      [created.id, "2026-01-01T00:00:00.000Z"]
    );

    const staleBefore = "2026-01-01T00:05:00.000Z";
    const claimedAt = "2026-01-01T00:10:00.000Z";
    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        data.claimStalledCourses(userId, staleBefore, claimedAt)
      )
    );
    expect(claims.flat()).toEqual([
      { id: created.id, generation_run_id: created.generationRunId },
    ]);

    expect(
      await data.claimStalledCourses(userId, staleBefore, claimedAt)
    ).toEqual([]);
    const course = (await pg.one(
      "SELECT generation_heartbeat FROM courses WHERE id = $1",
      [created.id]
    )) as { generation_heartbeat: string };
    expect(new Date(course.generation_heartbeat).toISOString()).toBe(claimedAt);
  });
});
