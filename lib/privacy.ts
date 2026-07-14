import crypto from "crypto";
import type { PoolClient } from "pg";
import { many, one, pool, q, ready, tx } from "./pg";

export const SERVICE_CONSENT_VERSION = "service-v1";
export const ANALYTICS_CONSENT_VERSION = "analytics-v1";
export const PRODUCT_RESEARCH_CONSENT_VERSION = "product-research-v1";
export const ACCOUNT_DELETION_GRACE_DAYS = 30;
export const ACCOUNT_EXPORT_SCHEMA_VERSION = 5;

export type ConsentPurpose = "service" | "analytics" | "product_research";
export type ConsentDecision = "granted" | "withdrawn";

export class SoleAdministratorDeletionError extends Error {
  constructor() {
    super("Transfer administration to another account before deleting this one.");
    this.name = "SoleAdministratorDeletionError";
  }
}

export function deletionEffectiveAt(
  requestedAt = new Date(),
  graceDays = ACCOUNT_DELETION_GRACE_DAYS
): string {
  return new Date(requestedAt.getTime() + graceDays * 86_400_000).toISOString();
}

function consentVersion(purpose: ConsentPurpose): string {
  if (purpose === "service") return SERVICE_CONSENT_VERSION;
  if (purpose === "analytics") return ANALYTICS_CONSENT_VERSION;
  return PRODUCT_RESEARCH_CONSENT_VERSION;
}

export async function recordConsent(
  userId: number,
  purpose: Exclude<ConsentPurpose, "service">,
  granted: boolean,
  source = "account"
) {
  const decision: ConsentDecision = granted ? "granted" : "withdrawn";
  await q(
    `INSERT INTO consent_records (user_id, purpose, version, decision, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, purpose, consentVersion(purpose), decision, source]
  );
  return { purpose, version: consentVersion(purpose), decision };
}

export interface PrivacyStatus {
  accountStatus: "active" | "deletion_scheduled" | "erased";
  deletionScheduledAt: string | null;
  consents: Record<ConsentPurpose, {
    version: string;
    decision: ConsentDecision;
    recordedAt: string;
  } | null>;
}

export async function getPrivacyStatus(userId: number): Promise<PrivacyStatus> {
  const user = (await one(
    `SELECT account_status, deletion_scheduled_at
       FROM users WHERE id = $1`,
    [userId]
  )) as { account_status: PrivacyStatus["accountStatus"]; deletion_scheduled_at: string | null };
  const latest = (await many(
    `SELECT DISTINCT ON (purpose) purpose, version, decision, recorded_at
       FROM consent_records
      WHERE user_id = $1
      ORDER BY purpose, recorded_at DESC, id DESC`,
    [userId]
  )) as { purpose: ConsentPurpose; version: string; decision: ConsentDecision; recorded_at: string }[];
  const consents: PrivacyStatus["consents"] = {
    service: null,
    analytics: null,
    product_research: null,
  };
  for (const row of latest) {
    consents[row.purpose] = {
      version: row.version,
      decision: row.decision,
      recordedAt: row.recorded_at,
    };
  }
  return {
    accountStatus: user.account_status,
    deletionScheduledAt: user.deletion_scheduled_at,
    consents,
  };
}

async function rows(client: PoolClient, sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows;
}

/** A portable, snapshot-consistent account export. Authentication secrets and
 * session/token material are deliberately never selected. */
export async function createAccountExport(userId: number) {
  await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const account = (
      await rows(
        client,
        `SELECT id, email, name, role, credits, premium_until,
                email_verified_at, account_status, deletion_scheduled_at,
                erased_at, created_at
           FROM users WHERE id = $1`,
        [userId]
      )
    )[0];
    if (!account) throw new Error("Account not found");

    const ownedCourses = await rows(
      client,
      `SELECT id, title, description, source_filename, source_json, status,
              error, published, category, price_cents, content_version,
              generation_run_id, lifecycle_status, archived_at, created_at
         FROM courses WHERE owner_id = $1 ORDER BY id`,
      [userId]
    );
    const courseIds = ownedCourses.map((course) => Number(course.id));
    const modules = courseIds.length
      ? await rows(client, "SELECT * FROM modules WHERE course_id = ANY($1::int[]) ORDER BY course_id, position", [courseIds])
      : [];
    const moduleIds = modules.map((module) => Number(module.id));
    const lessons = moduleIds.length
      ? await rows(client, "SELECT * FROM lessons WHERE module_id = ANY($1::int[]) ORDER BY module_id, position", [moduleIds])
      : [];
    const identity = (
      await rows(client, "SELECT learner_key, created_at FROM learning_identities WHERE user_id = $1", [userId])
    )[0] ?? null;
    const learnerKey = identity?.learner_key as string | undefined;

    const passport = (
      await rows(client, "SELECT id, visibility, created_at FROM skill_passports WHERE user_id = $1", [userId])
    )[0] ?? null;
    const payload = {
      schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      account,
      consentHistory: await rows(client, "SELECT purpose, version, decision, source, recorded_at FROM consent_records WHERE user_id = $1 ORDER BY id", [userId]),
      privacyHistory: await rows(client, "SELECT action, effective_at, metadata_json, recorded_at FROM privacy_actions WHERE user_id = $1 ORDER BY id", [userId]),
      content: { courses: ownedCourses, modules, lessons },
      learning: {
        identity,
        enrollments: await rows(client, `SELECT e.course_id, e.created_at, c.title FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = $1 ORDER BY e.created_at`, [userId]),
        progress: await rows(client, `SELECT p.*, m.course_id FROM progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id WHERE p.user_id = $1 ORDER BY p.completed_at`, [userId]),
        reviewItems: await rows(client, "SELECT * FROM review_items WHERE user_id = $1 ORDER BY id", [userId]),
        mastery: await rows(client, "SELECT course_id, concept, correct, wrong, mastery, updated_at FROM concept_mastery WHERE user_id = $1 ORDER BY course_id, concept", [userId]),
        answerSessions: await rows(client, "SELECT * FROM answer_sessions WHERE user_id = $1 ORDER BY created_at", [userId]),
        practiceSessions: await rows(client, "SELECT * FROM practice_sessions WHERE user_id = $1 ORDER BY created_at", [userId]),
        events: learnerKey ? await rows(client, "SELECT * FROM learning_events WHERE learner_key = $1 ORDER BY recorded_at, id", [learnerKey]) : [],
        lessonCompletions: learnerKey ? await rows(client, "SELECT * FROM lesson_completion_events WHERE learner_key = $1 ORDER BY completed_at", [learnerKey]) : [],
      },
      collaboration: {
        ownedClassrooms: await rows(client, "SELECT id, name, code, lifecycle_status, archived_at, created_at FROM classrooms WHERE owner_id = $1 ORDER BY id", [userId]),
        memberships: await rows(client, `SELECT cm.classroom_id, cm.joined_at, c.name FROM classroom_members cm JOIN classrooms c ON c.id = cm.classroom_id WHERE cm.user_id = $1 ORDER BY cm.joined_at`, [userId]),
      },
      credentials: await rows(client, `SELECT ct.id, ct.course_id, ct.score_pct, ct.issued_at, c.title AS course_title FROM certificates ct JOIN courses c ON c.id = ct.course_id WHERE ct.user_id = $1 ORDER BY ct.issued_at`, [userId]),
      skillPassport: passport ? {
        passport,
        claims: await rows(client, `SELECT claim.id AS claim_id, version.id AS claim_version_id,
          version.version, version.claim_type, version.title, version.statement,
          version.course_id, version.course_version, version.assignment_version_id,
          version.completion_rule_version_id, version.completion_event_id,
          version.participation_id, version.credential_id, version.evidence_hash,
          version.issued_at, version.created_at
          FROM competency_claims claim
          JOIN competency_claim_versions version ON version.claim_id=claim.id
          WHERE claim.user_id=$1 ORDER BY version.created_at,version.id`, [userId]),
        shares: await rows(client, `SELECT id,status,include_learner_name,expires_at,
          created_at,revoked_at,consent_withdrawn_at
          FROM passport_share_grants WHERE user_id=$1 ORDER BY created_at,id`, [userId]),
        selections: await rows(client, `SELECT selected.share_id,selected.claim_version_id,selected.position
          FROM passport_share_claims selected
          JOIN passport_share_grants share ON share.id=selected.share_id
          WHERE share.user_id=$1 ORDER BY selected.share_id,selected.position`, [userId]),
        consentHistory: await rows(client, `SELECT consent.share_id,consent.decision,consent.occurred_at
          FROM passport_share_consent_events consent
          JOIN passport_share_grants share ON share.id=consent.share_id
          WHERE share.user_id=$1 ORDER BY consent.occurred_at,consent.id`, [userId]),
        statusHistory: await rows(client, `SELECT event.share_id,event.event_type,event.occurred_at
          FROM passport_share_status_events event
          JOIN passport_share_grants share ON share.id=event.share_id
          WHERE share.user_id=$1 ORDER BY event.occurred_at,event.id`, [userId]),
        verificationHistory: await rows(client, `SELECT event.share_id,event.claim_count,
          event.learner_name_disclosed,event.occurred_at,event.retain_until
          FROM passport_verification_events event
          JOIN passport_share_grants share ON share.id=event.share_id
          WHERE share.user_id=$1 AND event.retain_until::timestamptz > now()
          ORDER BY event.occurred_at,event.id`, [userId]),
        disputes: await rows(client, `SELECT dispute.id,dispute.claim_id,
          dispute.disputed_claim_version_id,dispute.category,dispute.status,
          dispute.created_at,dispute.resolved_at,dispute.resolution_code,
          dispute.replacement_credential_id,dispute.resulting_claim_version_id,
          details.statement
          FROM competency_claim_disputes dispute
          LEFT JOIN competency_claim_dispute_details details ON details.dispute_id=dispute.id
          WHERE dispute.learner_user_id=$1 ORDER BY dispute.created_at,dispute.id`, [userId]),
        disputeHistory: await rows(client, `SELECT event.dispute_id,event.event_type,
          event.resolution_code,event.resulting_claim_version_id,event.occurred_at
          FROM competency_claim_dispute_events event
          JOIN competency_claim_disputes dispute ON dispute.id=event.dispute_id
          WHERE dispute.learner_user_id=$1 ORDER BY event.occurred_at,event.id`, [userId]),
        signedCredentials: await rows(client, `SELECT id,claim_version_id,space_id,
          issuer_key_id,status,issued_at,revoked_at,compact_jws
          FROM open_badge_credentials WHERE learner_user_id=$1
          ORDER BY issued_at,id`, [userId]),
        signedCredentialHistory: await rows(client, `SELECT event.open_badge_credential_id,
          event.event_type,event.occurred_at
          FROM open_badge_credential_events event
          JOIN open_badge_credentials badge ON badge.id=event.open_badge_credential_id
          WHERE badge.learner_user_id=$1 ORDER BY event.occurred_at,event.id`, [userId]),
      } : null,
      billing: await rows(client, "SELECT tx_ref, product, amount_cents, currency, provider, provider_ref, status, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at", [userId]),
    };
    await client.query("COMMIT");
    await q(
      `INSERT INTO privacy_actions (user_id, action, metadata_json)
       VALUES ($1, 'export_created', $2)`,
      [userId, JSON.stringify({ schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION })]
    );
    return payload;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection closes below */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function scheduleAccountDeletion(userId: number, requestedAt = new Date()) {
  return tx(async (client) => {
    const user = (
      await client.query(
        "SELECT role, account_status, deletion_scheduled_at FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      )
    ).rows[0] as { role: string; account_status: string; deletion_scheduled_at: string | null } | undefined;
    if (!user) throw new Error("Account not found");
    if (user.account_status === "erased") throw new Error("Account already erased");
    if (user.account_status === "deletion_scheduled") {
      return user.deletion_scheduled_at!;
    }
    if (user.role === "admin") {
      const { rows: admins } = await client.query(
        `SELECT count(*)::int AS count FROM users
          WHERE role = 'admin' AND account_status <> 'erased' AND id <> $1`,
        [userId]
      );
      if (admins[0].count === 0) throw new SoleAdministratorDeletionError();
    }
    const effectiveAt = deletionEffectiveAt(requestedAt);
    await client.query(
      `UPDATE users SET account_status = 'deletion_scheduled', deletion_scheduled_at = $1
        WHERE id = $2`,
      [effectiveAt, userId]
    );
    await client.query(
      `INSERT INTO privacy_actions (user_id, action, effective_at)
       VALUES ($1, 'deletion_scheduled', $2)`,
      [userId, effectiveAt]
    );
    return effectiveAt;
  });
}

export async function cancelAccountDeletion(userId: number) {
  return tx(async (client) => {
    const result = await client.query(
      `UPDATE users SET account_status = 'active', deletion_scheduled_at = NULL
        WHERE id = $1 AND account_status = 'deletion_scheduled'
        RETURNING id`,
      [userId]
    );
    if (!result.rowCount) return false;
    await client.query(
      `INSERT INTO privacy_actions (user_id, action)
       VALUES ($1, 'deletion_cancelled')`,
      [userId]
    );
    return true;
  });
}

async function eraseAccount(client: PoolClient, userId: number, erasedAt: string) {
  const activePassportShares = (await client.query<{ id: string }>(
    `SELECT id FROM passport_share_grants
     WHERE user_id=$1 AND status='active' FOR UPDATE`,
    [userId]
  )).rows;
  for (const share of activePassportShares) {
    await client.query(
      `UPDATE passport_share_grants
       SET status='consent_withdrawn',consent_withdrawn_at=$2 WHERE id=$1`,
      [share.id, erasedAt]
    );
    await client.query(
      `INSERT INTO passport_share_consent_events
        (share_id,decision,actor_user_id,occurred_at)
       VALUES ($1,'withdrawn',$2,$3)`,
      [share.id, userId, erasedAt]
    );
    await client.query(
      `INSERT INTO passport_share_status_events
        (share_id,event_type,actor_user_id,occurred_at)
       VALUES ($1,'consent_withdrawn',$2,$3)`,
      [share.id, userId, erasedAt]
    );
  }
  const activeSignedCredentials = (await client.query<{ id: string }>(
    `SELECT id FROM open_badge_credentials
     WHERE learner_user_id=$1 AND status='active' FOR UPDATE`,
    [userId]
  )).rows;
  for (const badge of activeSignedCredentials) {
    await client.query(
      "UPDATE open_badge_credentials SET status='revoked',revoked_at=$2 WHERE id=$1",
      [badge.id, erasedAt]
    );
    await client.query(
      `INSERT INTO open_badge_credential_events
        (open_badge_credential_id,event_type,actor_user_id,occurred_at)
       VALUES ($1,'revoked',$2,$3)`,
      [badge.id, userId, erasedAt]
    );
  }
  await client.query(
    `DELETE FROM passport_verification_events event
     USING passport_share_grants share
     WHERE event.share_id=share.id AND share.user_id=$1`,
    [userId]
  );
  await client.query(
    "DELETE FROM competency_claim_dispute_details WHERE learner_user_id=$1",
    [userId]
  );
  // Published content is withdrawn and retained only as an archived evidentiary
  // version. Private content is destroyed. Original source text is always erased.
  await client.query(
    `UPDATE courses SET owner_id = 0, published = 0, source_json = NULL,
            source_filename = 'removed', lifecycle_status = 'archived', archived_at = $1
      WHERE owner_id = $2 AND published = 1`,
    [erasedAt, userId]
  );
  await client.query("DELETE FROM courses WHERE owner_id = $1", [userId]);
  await client.query("DELETE FROM classrooms WHERE owner_id = $1", [userId]);
  for (const table of [
    "classroom_members",
    "enrollments",
    "concept_mastery",
    "progress",
    "review_items",
    "practice_sessions",
    "answer_sessions",
    "certificates",
    "sessions",
    "account_tokens",
    "user_stats",
  ]) {
    await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  }
  const randomPassword = crypto.randomBytes(48).toString("base64url");
  await client.query(
    `UPDATE users SET email = $1, name = 'Deleted learner', password_hash = $2,
            role = 'user', credits = 0, premium_until = NULL,
            email_verified_at = NULL, account_status = 'erased',
            deletion_scheduled_at = NULL, erased_at = $3
      WHERE id = $4`,
    [`erased-${userId}@deleted.invalid`, randomPassword, erasedAt, userId]
  );
  await client.query(
    `INSERT INTO privacy_actions (user_id, action, effective_at, metadata_json)
     VALUES ($1, 'erasure_completed', $2, $3)`,
    [userId, erasedAt, JSON.stringify({
      retained: ["pseudonymous_learning_evidence", "credential_history", "passport_claim_history", "structured_dispute_history", "consent_history", "financial_records"],
      withdrawnPassportShares: activePassportShares.length,
      revokedSignedCredentials: activeSignedCredentials.length,
    })]
  );
}

export async function processDueAccountErasures(now = new Date()): Promise<number[]> {
  return tx(async (client) => {
    const { rows: due } = await client.query(
      `SELECT id FROM users
        WHERE account_status = 'deletion_scheduled'
          AND deletion_scheduled_at::timestamptz <= $1::timestamptz
        ORDER BY deletion_scheduled_at
        FOR UPDATE SKIP LOCKED`,
      [now.toISOString()]
    );
    const erased: number[] = [];
    for (const row of due) {
      const userId = Number(row.id);
      await eraseAccount(client, userId, now.toISOString());
      erased.push(userId);
    }
    return erased;
  });
}

export async function purgeExpiredOperationalData(now = new Date()) {
  const { rows } = await q(
    `WITH deleted_sessions AS (
       DELETE FROM sessions WHERE expires_at::timestamptz < now() RETURNING 1
     ), deleted_tokens AS (
       DELETE FROM account_tokens
        WHERE expires_at::timestamptz < now() - interval '1 day' RETURNING 1
     ), deleted_limits AS (
       DELETE FROM rate_limit_buckets WHERE expires_at::timestamptz < now() RETURNING 1
     ), deleted_passport_access AS (
       DELETE FROM passport_verification_events
        WHERE retain_until::timestamptz <= $1::timestamptz RETURNING 1
     )
     SELECT
       (SELECT count(*)::int FROM deleted_sessions) AS sessions,
       (SELECT count(*)::int FROM deleted_tokens) AS tokens,
       (SELECT count(*)::int FROM deleted_limits) AS rate_limits,
       (SELECT count(*)::int FROM deleted_passport_access) AS passport_access`,
    [now.toISOString()]
  );
  return rows[0] as { sessions: number; tokens: number; rate_limits: number; passport_access: number };
}
