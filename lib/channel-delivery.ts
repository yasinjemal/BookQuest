import crypto from "crypto";
import {
  buildChannelCoursePackage,
  type ChannelCoursePackage,
  type ChannelSourceModule,
} from "./channel-package";
import { canAccessCourse, getCourse, listLessons, listModules } from "./db";
import { one, q, tx } from "./pg";

export type MessagingChannel = "sms" | "whatsapp" | "email" | "chat";

export class ChannelDeliveryError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "ChannelDeliveryError";
  }
}

function secretMaterial(): string {
  const material = process.env.CHANNEL_IDENTITY_HASH_KEY || process.env.GENERATION_SECRET;
  if (!material && process.env.NODE_ENV === "production") {
    throw new Error("CHANNEL_IDENTITY_HASH_KEY or GENERATION_SECRET is required in production");
  }
  return material || "bookquest-development-channel-key";
}

export function hashChannelValue(value: string): string {
  return crypto.createHmac("sha256", secretMaterial()).update(value.trim()).digest("hex");
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function buildOfflineCoursePackage(
  userId: number,
  courseId: number
): Promise<ChannelCoursePackage> {
  const course = await getCourse(courseId);
  if (!course || !(await canAccessCourse(userId, courseId))) {
    throw new ChannelDeliveryError("Course not found", 404);
  }
  const moduleRows = await listModules(courseId);
  const modules: ChannelSourceModule[] = await Promise.all(moduleRows.map(async (module) => ({
    id: module.id,
    title: module.title,
    summary: module.summary,
    position: module.position,
    lessons: await Promise.all((await listLessons(module.id)).map(async (lesson) => {
      let cards: unknown[] = [];
      try {
        const parsed = JSON.parse(lesson.cards);
        cards = Array.isArray(parsed) ? parsed : [];
      } catch {
        cards = [];
      }
      return {
        id: lesson.id,
        title: lesson.title,
        position: lesson.position,
        blocks: cards.map((content, index) => ({
          id: `lesson-${lesson.id}-block-${index}`,
          blockType: content && typeof content === "object" && "type" in content
            ? String((content as { type: unknown }).type)
            : "explanation",
          content,
        })),
      };
    })),
  })));
  const generatedAt = new Date().toISOString();
  const accountBinding = hashChannelValue(`offline:${userId}:${courseId}`);
  return buildChannelCoursePackage({
    packageId: sha256(`${courseId}:${course.content_version}:${accountBinding}`),
    generatedAt,
    channel: "offline",
    accountBinding,
    course: {
      id: courseId,
      title: course.title,
      description: course.description,
      version: course.content_version,
    },
    modules,
  });
}

export async function createChannelIdentityLink(input: {
  userId: number;
  channel: MessagingChannel;
  externalSubject: string;
  policyVersion: string;
}) {
  if (!input.externalSubject.trim()) throw new ChannelDeliveryError("Channel identity is required");
  if (!input.policyVersion.trim()) throw new ChannelDeliveryError("Policy version is required");
  const subjectHash = hashChannelValue(`${input.channel}:${input.externalSubject}`);
  return tx(async (client) => {
    const existing = (await client.query<{ id: string; user_id: number; status: string }>(
      "SELECT id,user_id,status FROM channel_identity_links WHERE channel=$1 AND external_subject_hash=$2 FOR UPDATE",
      [input.channel, subjectHash]
    )).rows[0];
    if (existing && existing.user_id !== input.userId) {
      throw new ChannelDeliveryError("Channel identity is already linked", 409);
    }
    const row = existing ?? (await client.query<{ id: string; user_id: number; status: string }>(
      `INSERT INTO channel_identity_links (user_id,channel,external_subject_hash)
       VALUES ($1,$2,$3) RETURNING id,user_id,status`,
      [input.userId, input.channel, subjectHash]
    )).rows[0];
    if (!existing) {
      await client.query(
        `INSERT INTO channel_consent_events
          (identity_link_id,event_type,policy_version) VALUES ($1,'linked',$2)`,
        [row.id, input.policyVersion]
      );
    }
    return { id: row.id, channel: input.channel, status: row.status, subjectHash };
  });
}

export async function optInChannelIdentity(input: {
  userId: number;
  identityLinkId: string;
  policyVersion: string;
  sourceEventId?: string;
}) {
  if (!input.policyVersion.trim()) throw new ChannelDeliveryError("Policy version is required");
  return tx(async (client) => {
    const link = (await client.query<{ status: string }>(
      "SELECT status FROM channel_identity_links WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [input.identityLinkId, input.userId]
    )).rows[0];
    if (!link) throw new ChannelDeliveryError("Channel identity not found", 404);
    if (link.status === "revoked") throw new ChannelDeliveryError("Channel identity is revoked", 409);
    if (link.status === "opted_in") return { id: input.identityLinkId, status: "opted_in", duplicate: true };
    const at = new Date().toISOString();
    await client.query(
      "UPDATE channel_identity_links SET status='opted_in',updated_at=$2 WHERE id=$1",
      [input.identityLinkId, at]
    );
    await client.query(
      `INSERT INTO channel_consent_events
        (identity_link_id,event_type,policy_version,source_event_id,occurred_at)
       VALUES ($1,'opted_in',$2,$3,$4)`,
      [input.identityLinkId, input.policyVersion, input.sourceEventId ?? null, at]
    );
    return { id: input.identityLinkId, status: "opted_in", duplicate: false, recordedAt: at };
  });
}

export async function recordChannelDeliveryEvent(input: {
  identityLinkId?: string;
  channel: MessagingChannel;
  messageKind: "lesson_card" | "reminder" | "resume_link" | "help" | "opt_out_confirmation";
  providerMessageId?: string;
  status: "queued" | "sent" | "delivered" | "replied" | "failed" | "complaint" | "opted_out";
  costMicros?: number;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const costMicros = Math.max(0, Math.trunc(input.costMicros ?? 0));
  if (!Number.isSafeInteger(costMicros)) throw new ChannelDeliveryError("Invalid delivery cost");
  const providerMessageHash = input.providerMessageId
    ? hashChannelValue(`${input.channel}:message:${input.providerMessageId}`)
    : null;
  const metadata = input.metadata ?? {};
  const forbidden = Object.keys(metadata).find((key) => /phone|email|address|subject|content|answer/i.test(key));
  if (forbidden) throw new ChannelDeliveryError(`Delivery metadata cannot include ${forbidden}`);
  return tx(async (client) => {
    if (input.identityLinkId) {
      const link = (await client.query<{ channel: string; status: string }>(
        "SELECT channel,status FROM channel_identity_links WHERE id=$1 FOR SHARE",
        [input.identityLinkId]
      )).rows[0];
      if (!link || link.channel !== input.channel) {
        throw new ChannelDeliveryError("Channel identity not found", 404);
      }
      const essential = input.messageKind === "help" || input.messageKind === "opt_out_confirmation";
      if (!essential && link.status !== "opted_in") {
        throw new ChannelDeliveryError("Non-essential delivery requires current opt-in", 409);
      }
    }
    const row = (await client.query<{ id: number; occurred_at: string }>(
      `INSERT INTO channel_delivery_events
        (identity_link_id,channel,message_kind,provider_message_hash,status,cost_micros,metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,occurred_at`,
      [input.identityLinkId ?? null, input.channel, input.messageKind, providerMessageHash,
        input.status, costMicros, JSON.stringify(metadata)]
    )).rows[0];
    return { id: row.id, occurredAt: row.occurred_at, providerMessageHash, costMicros };
  });
}

function commandResponse(eventType: "reply" | "stop" | "help" | "delivery_receipt" | "complaint") {
  if (eventType === "stop") return "You are opted out. Reply HELP for support.";
  if (eventType === "help") return "BookQuest help: open the app for support or reply STOP to opt out.";
  return null;
}

export async function recordInboundChannelEvent(input: {
  channel: MessagingChannel;
  externalEventId: string;
  externalSubject: string;
  eventType: "reply" | "stop" | "help" | "delivery_receipt" | "complaint";
  payload: unknown;
  policyVersion: string;
}) {
  if (!input.externalEventId.trim() || input.externalEventId.length > 500) {
    throw new ChannelDeliveryError("Invalid external event ID");
  }
  const subjectHash = hashChannelValue(`${input.channel}:${input.externalSubject}`);
  const payloadDigest = sha256(JSON.stringify(input.payload ?? null));
  return tx(async (client) => {
    const inserted = (await client.query<{ id: string }>(
      `INSERT INTO channel_inbound_events
        (channel,external_event_id,external_subject_hash,event_type,payload_digest)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (channel,external_event_id) DO NOTHING RETURNING id`,
      [input.channel, input.externalEventId, subjectHash, input.eventType, payloadDigest]
    )).rows[0];
    if (!inserted) {
      const prior = (await client.query<{ id: string; payload_digest: string; status: string }>(
        `SELECT id,payload_digest,status FROM channel_inbound_events
          WHERE channel=$1 AND external_event_id=$2`,
        [input.channel, input.externalEventId]
      )).rows[0];
      if (prior.payload_digest !== payloadDigest) {
        throw new ChannelDeliveryError("External event ID was reused with different content", 409);
      }
      return {
        id: prior.id,
        duplicate: true,
        status: prior.status,
        commandResponse: commandResponse(input.eventType),
      };
    }

    const link = (await client.query<{ id: string }>(
      `SELECT id FROM channel_identity_links
        WHERE channel=$1 AND external_subject_hash=$2 FOR UPDATE`,
      [input.channel, subjectHash]
    )).rows[0];
    if (link && (input.eventType === "stop" || input.eventType === "help")) {
      const eventType = input.eventType === "stop" ? "opted_out" : "help_requested";
      if (input.eventType === "stop") {
        await client.query(
          `UPDATE channel_identity_links SET status='opted_out',updated_at=$2 WHERE id=$1`,
          [link.id, new Date().toISOString()]
        );
      }
      await client.query(
        `INSERT INTO channel_consent_events
          (identity_link_id,event_type,policy_version,source_event_id)
         VALUES ($1,$2,$3,$4)`,
        [link.id, eventType, input.policyVersion, inserted.id]
      );
    }
    const processedAt = new Date().toISOString();
    await client.query(
      "UPDATE channel_inbound_events SET status='processed',processed_at=$2 WHERE id=$1",
      [inserted.id, processedAt]
    );
    return {
      id: inserted.id,
      duplicate: false,
      status: "processed",
      processedAt,
      commandResponse: commandResponse(input.eventType),
    };
  });
}

export async function createShortLivedResumeLink(input: {
  userId: number;
  courseId: number;
  lessonId?: number;
  ttlMinutes?: number;
}) {
  if (!(await canAccessCourse(input.userId, input.courseId))) {
    throw new ChannelDeliveryError("Course not found", 404);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const ttl = Math.max(1, Math.min(30, Math.trunc(input.ttlMinutes ?? 10)));
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
  await q(
    `INSERT INTO channel_resume_links
      (token_hash,user_id,course_id,lesson_id,expires_at) VALUES ($1,$2,$3,$4,$5)`,
    [tokenHash, input.userId, input.courseId, input.lessonId ?? null, expiresAt]
  );
  return { token, expiresAt };
}

export async function consumeResumeLink(token: string) {
  const tokenHash = sha256(token);
  return tx(async (client) => {
    const row = (await client.query<{
      user_id: number;
      course_id: number;
      lesson_id: number | null;
    }>(
      `SELECT user_id,course_id,lesson_id FROM channel_resume_links
        WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at::timestamptz > now()
        FOR UPDATE`,
      [tokenHash]
    )).rows[0];
    if (!row) throw new ChannelDeliveryError("Resume link is invalid or expired", 404);
    await client.query(
      "UPDATE channel_resume_links SET consumed_at=$2 WHERE token_hash=$1",
      [tokenHash, new Date().toISOString()]
    );
    return row;
  });
}

export async function updateCrossChannelResume(input: {
  userId: number;
  courseId: number;
  lessonId?: number;
  channel: "web" | "offline" | MessagingChannel;
  sequence: number;
}) {
  if (!(await canAccessCourse(input.userId, input.courseId))) {
    throw new ChannelDeliveryError("Course not found", 404);
  }
  const updatedAt = new Date().toISOString();
  return one(
    `INSERT INTO channel_resume_points
      (user_id,course_id,lesson_id,channel,sequence,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id,course_id) DO UPDATE SET
       lesson_id=CASE WHEN EXCLUDED.sequence >= channel_resume_points.sequence THEN EXCLUDED.lesson_id ELSE channel_resume_points.lesson_id END,
       channel=CASE WHEN EXCLUDED.sequence >= channel_resume_points.sequence THEN EXCLUDED.channel ELSE channel_resume_points.channel END,
       sequence=GREATEST(channel_resume_points.sequence,EXCLUDED.sequence),
       updated_at=CASE WHEN EXCLUDED.sequence >= channel_resume_points.sequence THEN EXCLUDED.updated_at ELSE channel_resume_points.updated_at END
     RETURNING user_id,course_id,lesson_id,channel,sequence,updated_at`,
    [input.userId, input.courseId, input.lessonId ?? null, input.channel,
      Math.max(0, Math.trunc(input.sequence)), updatedAt]
  );
}
