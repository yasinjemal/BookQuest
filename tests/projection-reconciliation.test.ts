import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuizCard } from "../lib/learning-types";

// Database integration test: reconcile/rebuild the concept-mastery projection
// against the immutable ledger. Skipped unless TEST_DATABASE_URL is set (it
// TRUNCATEs tables), like the other integration suites.
const TEST_DB = process.env.TEST_DATABASE_URL;

let data: typeof import("../lib/db");
let projection: typeof import("../lib/projection");
let pg: typeof import("../lib/pg");
let userId: number;
let courseId: number;
let lessonId: number;
let answerSessionId: string;

const card: QuizCard = {
  type: "quiz_mcq",
  concept: "gravity",
  question: "What pulls objects toward Earth?",
  options: ["Gravity", "Magnetism", "Friction", "Inertia"],
  correct_index: 0,
  explanation: "Gravity is the attractive force toward Earth's centre.",
};

async function recordAnswer(
  eventId: string,
  answer: number | null,
  attemptNumber: number
) {
  // Distinct attempt numbers keep these from colliding on the semantic-attempt
  // uniqueness index (same learner, session, question).
  return data.recordAnswerEvidence({
    eventId,
    userId,
    courseId,
    lessonId,
    cardIndex: 0,
    questionId: `lesson:${lessonId}:card:0`,
    concept: "gravity",
    card,
    answer,
    responseTimeMs: 2000,
    occurredAt: new Date().toISOString(),
    sessionKind: "lesson",
    sessionId: answerSessionId,
    attemptNumber,
  });
}

describe.skipIf(!TEST_DB)("concept-mastery projection reconciliation", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    data = await import("../lib/db");
    projection = await import("../lib/projection");
    await pg.ready();
    await pg.q(`TRUNCATE
      learning_events, lesson_completion_events, question_versions, concepts,
      learning_identities, answer_sessions, practice_sessions, concept_mastery,
      progress, user_stats, review_items, enrollments, certificates,
      classroom_assignments, classroom_members, classrooms, transactions,
      account_tokens, sessions, lessons, modules, courses, users
      RESTART IDENTITY CASCADE`);

    const user = await data.createUser("reconcile@example.com", "Recon", "hash");
    userId = user.id;
    courseId = (await data.createCourse(userId, "science.pdf")).id;
    const moduleId = await data.createModule(courseId, "Physics", "Forces", 0);
    lessonId = await data.createLesson(moduleId, "Forces", 0, JSON.stringify([card]), {
      generatorModel: "test-model",
      promptVersion: "test-prompt-v1",
    });
    answerSessionId = (await data.createLessonAnswerSession(userId, lessonId))!.id;

    // Two wrong then one right, plus a skip, so mastery, correct and wrong all
    // have non-trivial values to reproduce.
    await recordAnswer("recon_evt_1", 1, 1); // wrong
    await recordAnswer("recon_evt_2", 2, 2); // wrong
    await recordAnswer("recon_evt_3", 0, 3); // correct
    await recordAnswer("recon_evt_skip", null, 4); // skipped
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("reports a clean projection written by the live path", async () => {
    const report = await projection.reconcileConceptMastery();
    expect(report.ok).toBe(true);
    expect(report.scanned).toBe(1);
    expect(report.matched).toBe(1);
    expect(report.missing).toBe(0);
    expect(report.mismatched).toBe(0);
    expect(report.orphaned).toBe(0);
  });

  it("detects a corrupted projection value", async () => {
    await pg.q(
      "UPDATE concept_mastery SET mastery = 0.999, correct = 99 WHERE user_id = $1 AND course_id = $2",
      [userId, courseId]
    );
    const report = await projection.reconcileConceptMastery();
    expect(report.ok).toBe(false);
    expect(report.mismatched).toBe(1);
    expect(report.mismatches[0]).toMatchObject({
      kind: "mismatch",
      userId,
      courseId,
      concept: "gravity",
      actual: { correct: 99 },
    });
  });

  it("rebuilds the projection to exactly match the ledger", async () => {
    const result = await projection.rebuildConceptMastery();
    expect(result.deletedRows).toBeGreaterThanOrEqual(1);
    expect(result.rebuiltRows).toBe(1);

    const report = await projection.reconcileConceptMastery();
    expect(report.ok).toBe(true);

    // One correct of three graded answers: 0.5 -> 0.35 -> 0.245 -> 0.4715.
    const row = (await pg.one(
      "SELECT correct, wrong, mastery FROM concept_mastery WHERE user_id = $1 AND course_id = $2",
      [userId, courseId]
    )) as { correct: number; wrong: number; mastery: number };
    expect(row.correct).toBe(1);
    expect(row.wrong).toBe(2);
    expect(row.mastery).toBeCloseTo(0.4715, 6);
  });

  it("detects and removes an orphan projection row on rebuild", async () => {
    await pg.q(
      `INSERT INTO concept_mastery (user_id, course_id, concept, correct, wrong, mastery)
       VALUES ($1, $2, 'ghost concept', 5, 5, 0.5)`,
      [userId, courseId]
    );
    const before = await projection.reconcileConceptMastery();
    expect(before.orphaned).toBe(1);
    expect(before.mismatches.some((m) => m.kind === "orphan")).toBe(true);

    await projection.rebuildConceptMastery();
    const after = await projection.reconcileConceptMastery();
    expect(after.ok).toBe(true);
    expect(
      await pg.one(
        "SELECT 1 FROM concept_mastery WHERE user_id = $1 AND concept = 'ghost concept'",
        [userId]
      )
    ).toBeUndefined();
  });

  it("detects a missing projection row", async () => {
    await pg.q("DELETE FROM concept_mastery WHERE user_id = $1", [userId]);
    const report = await projection.reconcileConceptMastery();
    expect(report.ok).toBe(false);
    expect(report.missing).toBe(1);
    expect(report.mismatches[0]).toMatchObject({ kind: "missing", concept: "gravity" });

    await projection.rebuildConceptMastery();
    expect((await projection.reconcileConceptMastery()).ok).toBe(true);
  });
});
