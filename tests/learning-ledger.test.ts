import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuizCard } from "../lib/learning-types";

let tempDir: string;
let data: typeof import("../lib/db");
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

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "bookquest-ledger-"));
  process.env.BOOKQUEST_DATA_DIR = tempDir;
  data = await import("../lib/db");

  const user = data.createUser("ledger@example.com", "Ledger Learner", "hash");
  userId = user.id;
  courseId = data.createCourse(userId, "finance.pdf");
  const moduleId = data.createModule(courseId, "Finance", "Core ideas", 0);
  lessonId = data.createLesson(moduleId, "Interest", 0, JSON.stringify([card]), {
    generatorModel: "test-model",
    promptVersion: "test-prompt-v1",
  });
  answerSessionId = data.createLessonAnswerSession(userId, lessonId)!.id;
});

afterAll(async () => {
  data.db.close();
  delete process.env.BOOKQUEST_DATA_DIR;
  await rm(tempDir, { recursive: true, force: true });
});

describe("learning evidence ledger", () => {
  it("appends one event and updates mastery in the same operation", () => {
    const result = data.recordAnswerEvidence({
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

    const row = data.db
      .prepare("SELECT * FROM learning_events WHERE event_id = ?")
      .get("event_exactly_once_1") as Record<string, unknown>;
    expect(row).toMatchObject({
      is_correct: 1,
      session_kind: "lesson",
      mastery_algorithm_version: "ewma-v1",
      schema_version: 1,
    });
    expect(String(row.learner_key)).toMatch(/^learner_/);
  });

  it("treats replay as a duplicate without inflating mastery", () => {
    const duplicate = data.db.transaction(() =>
      data.recordAnswerEvidence({
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
      })
    )();

    expect(duplicate.inserted).toBe(false);
    const count = data.db
      .prepare("SELECT COUNT(*) AS count FROM learning_events")
      .get() as { count: number };
    expect(count.count).toBe(1);
    const mastery = data.getCourseMastery(userId, courseId)[0];
    expect(mastery).toMatchObject({
      correct: 1,
      wrong: 0,
    });
    expect(mastery.mastery).toBeCloseTo(0.65);

    const semanticReplay = data.recordAnswerEvidence({
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

    expect(() =>
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
    ).toThrow(data.EvidenceConflictError);

    expect(data.getLessonEvidenceSummary(userId, lessonId, answerSessionId)).toEqual({
      score: 1,
      total: 1,
      wrongCardIndexes: [],
    });
  });

  it("rejects mutation and deletion of historical events", () => {
    expect(() =>
      data.db
        .prepare("UPDATE learning_events SET is_correct = 0 WHERE event_id = ?")
        .run("event_exactly_once_1")
    ).toThrow(/append-only/);
    expect(() =>
      data.db
        .prepare("DELETE FROM learning_events WHERE event_id = ?")
        .run("event_exactly_once_1")
    ).toThrow(/append-only/);
    expect(() =>
      data.db
        .prepare("UPDATE question_versions SET content_json = '{}' WHERE id = ?")
        .run(
          data.db.prepare("SELECT id FROM question_versions LIMIT 1").pluck().get()
        )
    ).toThrow(/immutable/);
  });

  it("reports calibration and database health", () => {
    expect(data.questionCalibration(10)[0]).toMatchObject({
      attempts: 1,
      unique_learners: 1,
      correct_rate: 1,
    });
    expect(data.learningLedgerHealth()).toMatchObject({
      events: 1,
      learners: 1,
      question_versions: 1,
      malformed: 0,
    });
    expect(data.db.pragma("foreign_key_check")).toEqual([]);
    expect(data.db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
  });

  it("persists fresh practice questions before they are answered", () => {
    const session = data.createPracticeSession(
      userId,
      courseId,
      [{ concept: "compound interest", card }],
      true,
      { generatorModel: "test-model", promptVersion: "practice-v1" }
    );
    practiceSessionId = session.id;
    expect(data.getPracticeSession(userId, session.id)?.items[0]).toMatchObject({
      questionId: `${session.id}:question:0`,
      concept: "compound interest",
    });
    const registered = data.db
      .prepare("SELECT COUNT(*) AS count FROM question_versions WHERE question_id = ?")
      .get(`${session.id}:question:0`) as { count: number };
    expect(registered.count).toBe(1);
  });

  it("does not award lesson XP twice when completion is replayed", () => {
    expect(data.completeLesson(userId, lessonId, 1, 1, 15)).toBe(15);
    expect(data.completeLesson(userId, lessonId, 1, 1, 15)).toBe(0);
    expect(data.getStats(userId).total_xp).toBe(15);
  });

  it("preserves historical evidence when source content is deleted", () => {
    expect(() => data.deleteCourse(courseId)).not.toThrow();
    const event = data.db
      .prepare("SELECT course_id, lesson_id FROM learning_events WHERE event_id = ?")
      .get("event_exactly_once_1") as { course_id: number; lesson_id: number };
    expect(event).toEqual({ course_id: courseId, lesson_id: lessonId });

    const question = data.db
      .prepare("SELECT course_id, content_json FROM question_versions LIMIT 1")
      .get() as { course_id: number | null; content_json: string };
    expect(question.course_id).toBeNull();
    expect(question.content_json).toContain("earned interest");

    const delayedSession = data.getPracticeSession(userId, practiceSessionId)!;
    const delayedItem = delayedSession.items[0];
    expect(
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
      }).inserted
    ).toBe(true);
    expect(data.db.pragma("foreign_key_check")).toEqual([]);
  });
});
