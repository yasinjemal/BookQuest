import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuizCard } from "../lib/learning-types";

const TEST_DB = process.env.TEST_DATABASE_URL;

let data: typeof import("../lib/db");
let privacy: typeof import("../lib/privacy");
let pg: typeof import("../lib/pg");
let userId: number;
let courseId: number;
let learnerKey: string;

const card: QuizCard = {
  type: "quiz_truefalse",
  concept: "privacy",
  statement: "Consent choices should be reversible.",
  answer: true,
  explanation: "Optional consent can be withdrawn.",
};

describe.skipIf(!TEST_DB)("account privacy lifecycle", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    data = await import("../lib/db");
    privacy = await import("../lib/privacy");
    await pg.ready();
    await pg.q(`TRUNCATE
      learning_events, lesson_completion_events, question_versions, concepts,
      learning_identities, answer_sessions, practice_sessions, concept_mastery,
      progress, user_stats, review_items, enrollments, certificates,
      classroom_assignments, classroom_members, classrooms, transactions,
      privacy_actions, consent_records, account_tokens, sessions,
      lessons, modules, courses, users
      RESTART IDENTITY CASCADE`);

    // Keep a platform administrator so the learner account can be erased.
    await data.createUser("owner@example.com", "Owner", "owner-hash");
    const user = await data.createUser("privacy@example.com", "Private Learner", "hash");
    userId = user.id;
    courseId = (await data.createCourse(userId, "private-source.pdf")).id;
    await data.setCourseSource(courseId, JSON.stringify({ private: "source text" }));
    const moduleId = await data.createModule(courseId, "Privacy", "Choices", 0);
    const lessonId = await data.createLesson(moduleId, "Consent", 0, JSON.stringify([card]));
    const session = await data.createLessonAnswerSession(userId, lessonId);
    await data.recordAnswerEvidence({
      eventId: "privacy_evidence_1",
      userId,
      courseId,
      lessonId,
      cardIndex: 0,
      questionId: `lesson:${lessonId}:card:0`,
      concept: "privacy",
      card,
      answer: true,
      responseTimeMs: 1000,
      occurredAt: "2026-01-01T00:00:00.000Z",
      sessionKind: "lesson",
      sessionId: session!.id,
    });
    learnerKey = await data.getLearnerKey(userId);
    await data.createTransaction(userId, "privacy-tx", "credits_5", 299, "USD");
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("records explicit, append-only consent history", async () => {
    await privacy.recordConsent(userId, "analytics", true, "test");
    await privacy.recordConsent(userId, "analytics", false, "test");
    const status = await privacy.getPrivacyStatus(userId);
    expect(status.consents.service?.decision).toBe("granted");
    expect(status.consents.analytics?.decision).toBe("withdrawn");
    await expect(
      pg.q("UPDATE consent_records SET decision = 'granted' WHERE user_id = $1", [userId])
    ).rejects.toThrow(/append-only/);
  });

  it("exports owned content and evidence without authentication secrets", async () => {
    const exported = await privacy.createAccountExport(userId);
    expect(exported.account.email).toBe("privacy@example.com");
    expect(exported.content.courses[0].source_json).toContain("source text");
    expect(exported.content.authoring.personalSpaces).toHaveLength(1);
    expect(exported.content.authoring.sourceAssets.length).toBeGreaterThan(0);
    expect(exported.content.authoring.sourceVersions[0].extracted_content_json).toContain("source text");
    expect(exported.learning.events).toHaveLength(1);
    expect(exported.billing).toHaveLength(1);
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("password_hash");
    expect(serialized).not.toContain("sessions");
    expect(serialized).not.toContain("account_tokens");
    expect(serialized).not.toContain("raw_storage_key");
  });

  it("supports cancellation during the grace period", async () => {
    const requestedAt = new Date("2026-02-01T00:00:00.000Z");
    const effectiveAt = await privacy.scheduleAccountDeletion(userId, requestedAt);
    expect(effectiveAt).toBe("2026-03-03T00:00:00.000Z");
    expect((await privacy.getPrivacyStatus(userId)).accountStatus).toBe("deletion_scheduled");
    expect(await privacy.cancelAccountDeletion(userId)).toBe(true);
    expect((await privacy.getPrivacyStatus(userId)).accountStatus).toBe("active");
  });

  it("erases direct data only when due while preserving pseudonymous evidence", async () => {
    await privacy.scheduleAccountDeletion(userId, new Date("2026-03-01T00:00:00.000Z"));
    expect(await privacy.processDueAccountErasures(new Date("2026-03-30T23:59:59.000Z"))).toEqual([]);
    expect(await privacy.processDueAccountErasures(new Date("2026-03-31T00:00:00.000Z"))).toEqual([userId]);

    const erased = await data.getUserById(userId);
    expect(erased).toMatchObject({
      name: "Deleted learner",
      account_status: "erased",
      credits: 0,
    });
    expect(erased!.email).toBe(`erased-${userId}@deleted.invalid`);
    expect(await data.getCourse(courseId)).toBeUndefined();
    expect(
      await pg.one("SELECT learner_key FROM learning_identities WHERE user_id = $1", [userId])
    ).toEqual({ learner_key: learnerKey });
    expect(
      await pg.one("SELECT event_id FROM learning_events WHERE learner_key = $1", [learnerKey])
    ).toEqual({ event_id: "privacy_evidence_1" });
    expect(
      await pg.one("SELECT tx_ref FROM transactions WHERE user_id = $1", [userId])
    ).toEqual({ tx_ref: "privacy-tx" });
  });
});
