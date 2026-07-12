import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { QuizCard } from "../lib/learning-types";

const TEST_DB = process.env.TEST_DATABASE_URL;

let data: typeof import("../lib/db");
let pg: typeof import("../lib/pg");
let answerPost: typeof import("../app/api/answers/route").POST;
let completionPost: typeof import("../app/api/lessons/[id]/complete/route").POST;
let telemetryPost: typeof import("../app/api/telemetry/outbox/route").POST;
let userA: number;
let userB: number;
let courseA: number;
let courseB: number;
let lessonA: number;
let lessonB: number;
let lessonSessionA: string;
let lessonSessionB: string;
let practiceSessionA: string;
let practiceSessionB: string;
let reviewSessionA: string;
let reviewSessionB: string;
let reviewB: number;

const tokenA = "security-session-token-a";
const tokenB = "security-session-token-b";
const card: QuizCard = {
  type: "quiz_truefalse",
  concept: "authorization",
  statement: "The server derives learning context from its saved session.",
  answer: true,
  explanation: "Client context is not trusted.",
};

function answerRequest(token: string, body: Record<string, unknown>) {
  return new NextRequest("http://bookquest.test/api/answers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `bq_session=${token}`,
      "x-forwarded-for": "127.0.0.42",
    },
    body: JSON.stringify(body),
  });
}

function completionRequest(token: string, answerSessionId: string) {
  return new NextRequest(`http://bookquest.test/api/lessons/${lessonA}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `bq_session=${token}` },
    body: JSON.stringify({ answerSessionId }),
  });
}

describe.skipIf(!TEST_DB)("answer route authorization and context boundaries", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    data = await import("../lib/db");
    ({ POST: answerPost } = await import("../app/api/answers/route"));
    ({ POST: completionPost } = await import(
      "../app/api/lessons/[id]/complete/route"
    ));
    ({ POST: telemetryPost } = await import("../app/api/telemetry/outbox/route"));
    await pg.ready();
    await pg.q(`TRUNCATE
      learning_events, lesson_completion_events, question_versions, concepts,
      learning_identities, answer_sessions, practice_sessions, concept_mastery,
      progress, user_stats, review_items, enrollments, certificates,
      classroom_assignments, classroom_members, classrooms, transactions,
      operational_events, rate_limit_buckets, privacy_actions, consent_records,
      account_tokens, sessions, lessons, modules, courses, users
      RESTART IDENTITY CASCADE`);

    const a = await data.createUser("security-a@example.com", "Learner A", "hash");
    const b = await data.createUser("security-b@example.com", "Learner B", "hash");
    userA = a.id;
    userB = b.id;
    await data.createSession(userA, tokenA);
    await data.createSession(userB, tokenB);

    courseA = (await data.createCourse(userA, "a.pdf")).id;
    courseB = (await data.createCourse(userB, "b.pdf")).id;
    const moduleA = await data.createModule(courseA, "A", "A", 0);
    const moduleB = await data.createModule(courseB, "B", "B", 0);
    lessonA = await data.createLesson(moduleA, "Lesson A", 0, JSON.stringify([card]));
    lessonB = await data.createLesson(moduleB, "Lesson B", 0, JSON.stringify([card]));
    lessonSessionA = (await data.createLessonAnswerSession(userA, lessonA))!.id;
    lessonSessionB = (await data.createLessonAnswerSession(userB, lessonB))!.id;

    practiceSessionA = (
      await data.createPracticeSession(
        userA,
        courseA,
        [{ concept: "authorization", card, lessonId: lessonA, cardIndex: 0 }],
        false
      )
    ).id;
    practiceSessionB = (
      await data.createPracticeSession(
        userB,
        courseB,
        [{ concept: "authorization", card, lessonId: lessonB, cardIndex: 0 }],
        false
      )
    ).id;

    await data.addReviewItem(userA, lessonA, 0);
    await data.addReviewItem(userB, lessonB, 0);
    const reviewA = (await pg.one(
      "SELECT id, next_due FROM review_items WHERE user_id = $1",
      [userA]
    )) as { id: number; next_due: string };
    const reviewBRow = (await pg.one(
      "SELECT id, next_due FROM review_items WHERE user_id = $1",
      [userB]
    )) as { id: number; next_due: string };
    reviewB = reviewBRow.id;
    reviewSessionA = (
      await data.createReviewAnswerSession(userA, [{
        courseId: courseA,
        lessonId: lessonA,
        cardIndex: 0,
        questionId: `lesson:${lessonA}:card:0`,
        concept: "authorization",
        card,
        reviewId: reviewA.id,
        reviewDueAt: reviewA.next_due,
      }])
    ).id;
    reviewSessionB = (
      await data.createReviewAnswerSession(userB, [{
        courseId: courseB,
        lessonId: lessonB,
        cardIndex: 0,
        questionId: `lesson:${lessonB}:card:0`,
        concept: "authorization",
        card,
        reviewId: reviewBRow.id,
        reviewDueAt: reviewBRow.next_due,
      }])
    ).id;
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("ignores forged correctness and context, grading against the saved lesson", async () => {
    const response = await answerPost(answerRequest(tokenA, {
      source: "lesson",
      accountId: userA,
      eventId: "security_lesson_wrong",
      sessionId: lessonSessionA,
      lessonId: lessonA,
      cardIndex: 0,
      answer: false,
      responseTimeMs: 500,
      occurredAt: "2026-07-12T10:00:00.000Z",
      correct: true,
      courseId: courseB,
      learnerId: userB,
      question: "forged",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ correct: false, duplicate: false });
    const learnerKey = await data.getLearnerKey(userA);
    expect(await pg.one(
      "SELECT learner_key, course_id, lesson_id, is_correct FROM learning_events WHERE event_id = $1",
      ["security_lesson_wrong"]
    )).toEqual({
      learner_key: learnerKey,
      course_id: courseA,
      lesson_id: lessonA,
      is_correct: 0,
    });
  });

  it("rejects another account id and another learner's lesson session", async () => {
    const wrongAccount = await answerPost(answerRequest(tokenA, {
      source: "lesson",
      accountId: userB,
      eventId: "security_wrong_account",
      sessionId: lessonSessionA,
      lessonId: lessonA,
      cardIndex: 0,
      answer: true,
      responseTimeMs: 1,
      occurredAt: "2026-07-12T10:01:00.000Z",
    }));
    expect(wrongAccount.status).toBe(403);

    const foreignSession = await answerPost(answerRequest(tokenA, {
      source: "lesson",
      accountId: userA,
      eventId: "security_foreign_lesson",
      sessionId: lessonSessionB,
      lessonId: lessonB,
      cardIndex: 0,
      answer: true,
      responseTimeMs: 1,
      occurredAt: "2026-07-12T10:02:00.000Z",
    }));
    expect(foreignSession.status).toBe(404);
  });

  it("cannot combine a valid lesson session with another course's lesson", async () => {
    const response = await answerPost(answerRequest(tokenA, {
      source: "lesson",
      accountId: userA,
      eventId: "security_cross_course_lesson",
      sessionId: lessonSessionA,
      lessonId: lessonB,
      cardIndex: 0,
      answer: true,
      responseTimeMs: 1,
      occurredAt: "2026-07-12T10:03:00.000Z",
    }));
    expect(response.status).toBe(404);
  });

  it("scopes practice and review sessions to their owner and saved course", async () => {
    const foreignPractice = await answerPost(answerRequest(tokenA, {
      source: "practice",
      accountId: userA,
      eventId: "security_foreign_practice",
      sessionId: practiceSessionB,
      itemIndex: 0,
      answer: true,
      responseTimeMs: 1,
      occurredAt: "2026-07-12T10:04:00.000Z",
    }));
    expect(foreignPractice.status).toBe(404);

    const validPractice = await answerPost(answerRequest(tokenA, {
      source: "practice",
      accountId: userA,
      eventId: "security_valid_practice",
      sessionId: practiceSessionA,
      itemIndex: 0,
      answer: true,
      responseTimeMs: 1,
      occurredAt: "2026-07-12T10:05:00.000Z",
      courseId: courseB,
    }));
    expect(validPractice.status).toBe(200);
    expect(await pg.one(
      "SELECT course_id, learner_key FROM learning_events WHERE event_id = $1",
      ["security_valid_practice"]
    )).toEqual({ course_id: courseA, learner_key: await data.getLearnerKey(userA) });

    const foreignReview = await answerPost(answerRequest(tokenA, {
      source: "review",
      accountId: userA,
      eventId: "security_foreign_review",
      sessionId: reviewSessionB,
      reviewId: reviewB,
      answer: true,
      responseTimeMs: 1,
      occurredAt: "2026-07-12T10:06:00.000Z",
    }));
    expect(foreignReview.status).toBe(404);

    const crossCourseReview = await answerPost(answerRequest(tokenA, {
      source: "review",
      accountId: userA,
      eventId: "security_cross_course_review",
      sessionId: reviewSessionA,
      reviewId: reviewB,
      answer: true,
      responseTimeMs: 1,
      occurredAt: "2026-07-12T10:07:00.000Z",
    }));
    expect(crossCourseReview.status).toBe(404);
  });

  it("serializes simultaneous completion replays before awarding XP", async () => {
    const before = (await data.getStats(userA)).total_xp;
    const requests = [
      completionPost(completionRequest(tokenA, lessonSessionA), {
        params: Promise.resolve({ id: String(lessonA) }),
      }),
      completionPost(completionRequest(tokenA, lessonSessionA), {
        params: Promise.resolve({ id: String(lessonA) }),
      }),
    ];
    const responses = await Promise.all(requests);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(bodies.filter((body) => body.duplicate)).toHaveLength(1);
    expect(bodies.reduce((sum, body) => sum + body.xp, 0)).toBe(10);
    expect((await data.getStats(userA)).total_xp - before).toBe(10);
    expect((await pg.one(
      "SELECT count(*)::int AS count FROM lesson_completion_events WHERE answer_session_id = $1",
      [lessonSessionA]
    ))).toEqual({ count: 1 });
  });

  it("accepts only aggregate outbox telemetry under the authenticated identity", async () => {
    const response = await telemetryPost(answerRequest(tokenA, {
      answerQueueDepth: 3,
      completionQueueDepth: 1,
      oldestQueueSeconds: 90,
      attempted: 4,
      drained: 2,
      accountId: userB,
      eventId: "must-not-be-stored",
      answer: "must-not-be-stored",
    }));
    expect(response.status).toBe(202);
    const event = (await pg.one(
      `SELECT subject_key, metadata_json FROM operational_events
        WHERE event_type = 'learning.outbox_health'
        ORDER BY id DESC LIMIT 1`
    )) as { subject_key: string; metadata_json: string };
    expect(event.subject_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(event.metadata_json)).toEqual({
      answer_queue_depth: 3,
      completion_queue_depth: 1,
      oldest_queue_seconds: 90,
      attempted: 4,
      drained: 2,
    });
    expect(event.metadata_json).not.toContain("must-not-be-stored");
  });
});
