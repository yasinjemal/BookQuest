import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildChannelCoursePackage,
  CHANNEL_PACKAGE_SCHEMA,
  projectChannelBlock,
} from "../lib/channel-package";
import { offlineCourseCacheKey } from "../lib/offline-course-cache";

describe("channel-neutral course packages", () => {
  it("uses deterministic fallbacks and exposes the shared sync contract", () => {
    const media = projectChannelBlock({
      id: "media-1",
      blockType: "audio_video",
      content: { type: "audio_video", title: "Listen", url: "/audio.mp3", transcript: "Readable transcript" },
    }, "offline");
    expect(media).toMatchObject({
      renderedType: "explanation",
      fallbackApplied: true,
      content: { heading: "Listen", body: "Readable transcript" },
    });

    const coursePackage = buildChannelCoursePackage({
      packageId: "package-id",
      generatedAt: "2026-01-01T00:00:00.000Z",
      channel: "chat",
      accountBinding: "a".repeat(64),
      course: { id: 7, title: "Course", description: "Description", version: 2 },
      modules: [{
        id: 1,
        title: "Module",
        summary: "Summary",
        position: 0,
        lessons: [{
          id: 2,
          title: "Lesson",
          position: 0,
          blocks: [{ id: "quiz", blockType: "quiz_mcq", content: {
            type: "quiz_mcq",
            question: "Choose",
            options: ["A", "B"],
            correct_index: 0,
            explanation: "A",
          } }],
        }],
      }],
    });
    expect(coursePackage.schema).toBe(CHANNEL_PACKAGE_SCHEMA);
    expect(coursePackage.modules[0].lessons[0].blocks[0]).toMatchObject({
      renderedType: "multiple_choice",
      fallbackApplied: false,
    });
    expect(coursePackage.sync).toMatchObject({
      idempotencyField: "eventId",
      pendingEvidenceVisible: true,
      crossChannelResume: true,
    });
    expect(offlineCourseCacheKey(12, 7)).toBe("account-12:course-7");
  });
});

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("privacy-safe multi-channel persistence", () => {
  let db: typeof import("../lib/db");
  let delivery: typeof import("../lib/channel-delivery");
  let pg: typeof import("../lib/pg");
  let userId: number;
  let outsiderId: number;
  let courseId: number;
  let lessonId: number;
  const externalSubject = "+27123456789";

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.CHANNEL_IDENTITY_HASH_KEY = "test-channel-key-that-is-not-production";
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    delivery = await import("../lib/channel-delivery");
    await pg.ready();
    await pg.q(`TRUNCATE
      channel_delivery_events, channel_consent_events, channel_inbound_events,
      channel_resume_links, channel_resume_points, channel_identity_links,
      learning_events, lesson_completion_events, question_versions, concepts,
      learning_identities, answer_sessions, practice_sessions, concept_mastery,
      progress, user_stats, review_items, enrollments, certificates,
      classroom_assignments, classroom_members, classrooms, transactions,
      account_tokens, sessions, consent_records, lessons, modules, courses, users
      RESTART IDENTITY CASCADE`);
    const user = await db.createUser("channel@example.com", "Channel Learner", "hash");
    userId = user.id;
    outsiderId = (await db.createUser("channel-outsider@example.com", "Channel Outsider", "hash")).id;
    const course = await db.createCourse(userId, "channel.pdf");
    courseId = course.id;
    const moduleId = await db.createModule(courseId, "Channel module", "Summary", 0);
    lessonId = await db.createLesson(moduleId, "Channel lesson", 0, JSON.stringify([
      {
        type: "quiz_mcq",
        concept: "delivery",
        question: "What survives a retry?",
        options: ["The event ID", "Nothing"],
        correct_index: 0,
        explanation: "Stable event IDs make retries idempotent.",
      },
      {
        type: "audio_video",
        title: "Audio lesson",
        url: "https://example.invalid/audio.mp3",
        transcript: "A text alternative for offline learners.",
      },
    ]));
    await pg.q("UPDATE courses SET published=0,status='ready',title='Channel Course' WHERE id=$1", [courseId]);
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
    delete process.env.CHANNEL_IDENTITY_HASH_KEY;
  });

  it("builds account-bound packages without embedding account or phone identifiers", async () => {
    const coursePackage = await delivery.buildOfflineCoursePackage(userId, courseId);
    expect(coursePackage).toMatchObject({
      schema: CHANNEL_PACKAGE_SCHEMA,
      channel: "offline",
      course: { id: courseId, title: "Channel Course" },
    });
    expect(coursePackage.accountBinding).toMatch(/^[0-9a-f]{64}$/);
    expect(coursePackage.modules[0].lessons[0].blocks[1]).toMatchObject({
      renderedType: "explanation",
      fallbackApplied: true,
    });
    const serialized = JSON.stringify(coursePackage);
    expect(serialized).not.toContain(externalSubject);
    expect(serialized).not.toContain("channel@example.com");
    await expect(delivery.buildOfflineCoursePackage(outsiderId, courseId))
      .rejects.toMatchObject({ status: 404 });
  });

  it("stores only hashed identities and processes STOP idempotently", async () => {
    const link = await delivery.createChannelIdentityLink({
      userId,
      channel: "sms",
      externalSubject,
      policyVersion: "messaging-v1",
    });
    expect(link.subjectHash).toMatch(/^[0-9a-f]{64}$/);
    expect(link.subjectHash).not.toContain(externalSubject);
    const stored = await pg.one<{ external_subject_hash: string; status: string }>(
      "SELECT external_subject_hash,status FROM channel_identity_links WHERE id=$1",
      [link.id]
    );
    expect(stored).toMatchObject({ external_subject_hash: link.subjectHash, status: "linked" });
    await expect(delivery.optInChannelIdentity({
      userId,
      identityLinkId: link.id,
      policyVersion: "messaging-v1",
    })).resolves.toMatchObject({ status: "opted_in", duplicate: false });

    const first = await delivery.recordInboundChannelEvent({
      channel: "sms",
      externalEventId: "provider-event-1",
      externalSubject,
      eventType: "stop",
      payload: { command: "STOP" },
      policyVersion: "messaging-v1",
    });
    const duplicate = await delivery.recordInboundChannelEvent({
      channel: "sms",
      externalEventId: "provider-event-1",
      externalSubject,
      eventType: "stop",
      payload: { command: "STOP" },
      policyVersion: "messaging-v1",
    });
    expect(first.duplicate).toBe(false);
    expect(first.commandResponse).toMatch(/opted out/i);
    expect(duplicate).toMatchObject({ id: first.id, duplicate: true });
    expect((await pg.one<{ status: string }>(
      "SELECT status FROM channel_identity_links WHERE id=$1", [link.id]
    ))?.status).toBe("opted_out");
    expect((await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM channel_consent_events WHERE identity_link_id=$1",
      [link.id]
    ))?.count).toBe(3);
    await expect(delivery.recordInboundChannelEvent({
      channel: "sms",
      externalEventId: "provider-event-1",
      externalSubject,
      eventType: "stop",
      payload: { command: "DIFFERENT" },
      policyVersion: "messaging-v1",
    })).rejects.toMatchObject({ status: 409 });
    await expect(pg.q(
      "DELETE FROM channel_consent_events WHERE identity_link_id=$1", [link.id]
    )).rejects.toThrow(/append-only/);

    const deliveryEvent = await delivery.recordChannelDeliveryEvent({
      identityLinkId: link.id,
      channel: "sms",
      messageKind: "opt_out_confirmation",
      providerMessageId: "provider-message-1",
      status: "delivered",
      costMicros: 1250,
      metadata: { segmentCount: 1 },
    });
    expect(deliveryEvent).toMatchObject({ costMicros: 1250 });
    expect(deliveryEvent.providerMessageHash).toMatch(/^[0-9a-f]{64}$/);
    await expect(delivery.recordChannelDeliveryEvent({
      identityLinkId: link.id,
      channel: "sms",
      messageKind: "reminder",
      status: "queued",
    })).rejects.toMatchObject({ status: 409 });
    await expect(delivery.recordChannelDeliveryEvent({
      channel: "sms",
      messageKind: "reminder",
      status: "queued",
      metadata: { phone: externalSubject },
    })).rejects.toThrow(/metadata cannot include phone/i);
  });

  it("uses one-time short-lived links and ignores stale resume updates", async () => {
    const resumeLink = await delivery.createShortLivedResumeLink({
      userId,
      courseId,
      lessonId,
      ttlMinutes: 2,
    });
    expect(resumeLink.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const storedToken = await pg.one<{ token_hash: string }>(
      "SELECT token_hash FROM channel_resume_links WHERE course_id=$1", [courseId]
    );
    expect(storedToken?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedToken?.token_hash).not.toBe(resumeLink.token);
    await expect(delivery.consumeResumeLink(resumeLink.token)).resolves.toMatchObject({
      user_id: userId,
      course_id: courseId,
      lesson_id: lessonId,
    });
    await expect(delivery.consumeResumeLink(resumeLink.token)).rejects.toMatchObject({ status: 404 });

    await delivery.updateCrossChannelResume({
      userId, courseId, lessonId, channel: "offline", sequence: 10,
    });
    const stale = await delivery.updateCrossChannelResume({
      userId, courseId, channel: "web", sequence: 4,
    });
    expect(stale).toMatchObject({ lesson_id: lessonId, channel: "offline", sequence: 10 });
  });
});
