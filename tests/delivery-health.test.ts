import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuizCard } from "../lib/learning-types";

// Database integration test for the admin delivery-health drill-down. Skipped
// unless TEST_DATABASE_URL is set (it TRUNCATEs tables).
const TEST_DB = process.env.TEST_DATABASE_URL;

let data: typeof import("../lib/db");
let observability: typeof import("../lib/observability");
let pg: typeof import("../lib/pg");
let userId: number;
let courseId: number;
let lessonId: number;
let answerSessionId: string;

const card: QuizCard = {
  type: "quiz_mcq",
  concept: "tides",
  question: "What mainly causes ocean tides?",
  options: ["The Moon", "The wind", "Rivers", "Boats"],
  correct_index: 0,
  explanation: "The Moon's gravity drives the tides.",
};

describe.skipIf(!TEST_DB)("delivery health drill-down", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    data = await import("../lib/db");
    observability = await import("../lib/observability");
    await pg.ready();
    await pg.q(`TRUNCATE
      learning_events, lesson_completion_events, question_versions, concepts,
      learning_identities, answer_sessions, practice_sessions, concept_mastery,
      progress, user_stats, review_items, enrollments, certificates,
      classroom_assignments, classroom_members, classrooms, transactions,
      operational_events, account_tokens, sessions, lessons, modules, courses, users
      RESTART IDENTITY CASCADE`);

    const user = await data.createUser("delivery@example.com", "Del", "hash");
    userId = user.id;
    courseId = (await data.createCourse(userId, "ocean.pdf")).id;
    const moduleId = await data.createModule(courseId, "Oceans", "Tides", 0);
    lessonId = await data.createLesson(moduleId, "Tides", 0, JSON.stringify([card]), {
      generatorModel: "test-model",
      promptVersion: "test-prompt-v1",
    });
    answerSessionId = (await data.createLessonAnswerSession(userId, lessonId))!.id;

    // A prompt answer (~now) and a delayed one (answered 10 minutes before it was
    // recorded), so exactly one event should count as delayed.
    await data.recordAnswerEvidence({
      eventId: "delivery_prompt",
      userId,
      courseId,
      lessonId,
      cardIndex: 0,
      questionId: `lesson:${lessonId}:card:0`,
      concept: "tides",
      card,
      answer: 0,
      responseTimeMs: 1500,
      occurredAt: new Date().toISOString(),
      sessionKind: "lesson",
      sessionId: answerSessionId,
      attemptNumber: 1,
    });
    await data.recordAnswerEvidence({
      eventId: "delivery_delayed",
      userId,
      courseId,
      lessonId,
      cardIndex: 0,
      questionId: `lesson:${lessonId}:card:0`,
      concept: "tides",
      card,
      answer: 0,
      responseTimeMs: 1500,
      occurredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      sessionKind: "lesson",
      sessionId: answerSessionId,
      attemptNumber: 2,
    });

    // A server-side answer failure, as the answers route records it.
    await observability.recordOperationalError({
      eventType: "learning.answer_failed",
      area: "learning.answers",
      error: new Error("boom"),
      metadata: { answer_source: "lesson" },
    });
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("counts delayed events and reports the largest delay", async () => {
    const health = await observability.deliveryHealth();
    expect(health.delayed_events_24h).toBe(1);
    expect(health.max_delay_seconds).toBeGreaterThanOrEqual(
      10 * 60 - observability.DELAYED_EVENT_THRESHOLD_SECONDS
    );
    expect(health.delayed_sample[0]).toMatchObject({
      session_kind: "lesson",
      course_id: courseId,
    });
    expect(health.delayed_sample[0].delay_seconds).toBeGreaterThanOrEqual(500);
  });

  it("counts answer failures and surfaces a groupable sample", async () => {
    const health = await observability.deliveryHealth();
    expect(health.answer_failures_24h).toBe(1);
    expect(health.failure_sample[0]).toMatchObject({
      area: "learning.answers",
      answer_source: "lesson",
    });
    expect(health.failure_sample[0].error_fingerprint).toMatch(/^[a-f0-9]{24}$/);
    expect(health.alerts.some((a) => a.includes("answer delivery failure"))).toBe(true);
  });
});
