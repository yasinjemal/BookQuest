import crypto from "crypto";
import type { Card, CourseRow, CourseStatus, LessonRow, ModuleRow } from "./schemas";
import type { PracticeSessionItem, QuizAnswerValue, QuizCard } from "./learning-types";
import {
  answerEvidence,
  describeQuestionVersion,
  EVIDENCE_SCHEMA_VERSION,
  gradeQuizCard,
  INITIAL_MASTERY,
  isQuizAnswerCompatible,
  makeConceptId,
  MASTERY_ALGORITHM_VERSION,
  nextMastery,
  normalizeConcept,
} from "./learning";
import type { PoolClient } from "pg";
import { many, one, pool, q, tx, type Queryable } from "./pg";
import { newGenerationRunId } from "./generation-run";
import { SERVICE_CONSENT_VERSION } from "./privacy";
import {
  ensurePersonalSpaceForUser,
  createLegacyClassroomSpace,
  resolveCourseLearningContext,
} from "./spaces";
import {
  initializeCourseStudioDraft,
  branchCourseVersionForRegeneration,
  recordExtractedCourseSource,
} from "./studio";

/**
 * Data layer, backed by Neon Postgres (see ./pg for the connection + schema).
 *
 * The whole module is async: unlike better-sqlite3, `pg` has no synchronous API,
 * so every function returns a Promise and callers must await. Timestamps are
 * stored as ISO-8601 text (matching `Date.toISOString()`), and comparisons
 * against "now" cast the column to timestamptz in SQL.
 */

const nowIso = () => new Date().toISOString();

// ---------- Users ----------

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: "user" | "admin";
  credits: number;
  premium_until: string | null;
  email_verified_at: string | null;
  account_status: "active" | "deletion_scheduled" | "erased";
  deletion_scheduled_at: string | null;
  erased_at: string | null;
  created_at: string;
}

export async function createUser(
  email: string,
  name: string,
  passwordHash: string,
  serviceConsentVersion = SERVICE_CONSENT_VERSION
): Promise<UserRow> {
  return tx(async (c) => {
    const count = (await c.query("SELECT COUNT(*)::int AS n FROM users")).rows[0] as {
      n: number;
    };
    const isFirst = count.n === 0;
    const ins = await c.query(
      "INSERT INTO users (email, name, password_hash, role, credits) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [email.trim(), name.trim(), passwordHash, isFirst ? "admin" : "user", 3]
    );
    const id = Number(ins.rows[0].id);
    if (isFirst) {
      // The first account (the platform owner) adopts all pre-platform data.
      await c.query("UPDATE courses SET owner_id = $1 WHERE owner_id = 0", [id]);
      await c.query("UPDATE progress SET user_id = $1 WHERE user_id = 0", [id]);
      await c.query("UPDATE review_items SET user_id = $1 WHERE user_id = 0", [id]);
      await c.query(
        "UPDATE user_stats SET user_id = $1 WHERE user_id = 0 AND NOT EXISTS (SELECT 1 FROM user_stats WHERE user_id = $1)",
        [id]
      );
    }
    await c.query(
      "INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [id]
    );
    await c.query(
      `INSERT INTO consent_records
        (user_id, purpose, version, decision, source)
       VALUES ($1, 'service', $2, 'granted', 'registration')`,
      [id, serviceConsentVersion]
    );
    const personal = await ensurePersonalSpaceForUser(id, name, c);
    await c.query(
      `UPDATE courses SET owning_space_id = $1
       WHERE owner_id = $2 AND owning_space_id IS NULL`,
      [personal.space.id, id]
    );
    return (await c.query("SELECT * FROM users WHERE id = $1", [id])).rows[0] as UserRow;
  });
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  return (await one("SELECT * FROM users WHERE email = $1", [email.trim()])) as
    | UserRow
    | undefined;
}

export async function getUserById(
  id: number,
  exec?: Queryable
): Promise<UserRow | undefined> {
  return (await one("SELECT * FROM users WHERE id = $1", [id], exec)) as
    | UserRow
    | undefined;
}

export function isPremium(user: UserRow): boolean {
  return !!user.premium_until && user.premium_until > new Date().toISOString();
}

export async function adjustCredits(userId: number, delta: number) {
  await q("UPDATE users SET credits = GREATEST(0, credits + $1) WHERE id = $2", [
    delta,
    userId,
  ]);
}

export async function grantPremium(userId: number, days: number) {
  const user = await getUserById(userId);
  if (!user) return;
  const base =
    user.premium_until && user.premium_until > new Date().toISOString()
      ? new Date(user.premium_until)
      : new Date();
  base.setDate(base.getDate() + days);
  await q("UPDATE users SET premium_until = $1 WHERE id = $2", [
    base.toISOString(),
    userId,
  ]);
}

export async function listUsers(): Promise<UserRow[]> {
  return (await many("SELECT * FROM users ORDER BY created_at DESC")) as UserRow[];
}

// ---------- Sessions ----------

export async function createSession(userId: number, token: string, days = 30) {
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  await q(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
    [token, userId, expiresAt]
  );
}

export async function getSessionUser(token: string): Promise<UserRow | undefined> {
  const row = (await one(
    `SELECT s.user_id FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at::timestamptz > now()
       AND u.account_status <> 'erased'`,
    [token]
  )) as { user_id: number } | undefined;
  return row ? getUserById(row.user_id) : undefined;
}

export async function deleteSession(token: string) {
  await q("DELETE FROM sessions WHERE token = $1", [token]);
}

export type AccountTokenPurpose = "verify_email" | "reset_password";

export async function createAccountToken(
  userId: number,
  purpose: AccountTokenPurpose,
  tokenHash: string,
  expiresAt: string
) {
  await tx(async (client) => {
    // Only the newest live link for a purpose remains usable.
    await client.query(
      `UPDATE account_tokens SET used_at = $1
       WHERE user_id = $2 AND purpose = $3 AND used_at IS NULL`,
      [nowIso(), userId, purpose]
    );
    await client.query(
      `INSERT INTO account_tokens (token_hash, user_id, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [tokenHash, userId, purpose, expiresAt]
    );
    await client.query(
      "DELETE FROM account_tokens WHERE expires_at::timestamptz < now() - interval '1 day'"
    );
  });
}

export async function verifyEmailWithToken(tokenHash: string): Promise<boolean> {
  return tx(async (client) => {
    const row = (
      await client.query(
        `SELECT user_id FROM account_tokens
         WHERE token_hash = $1 AND purpose = 'verify_email'
           AND used_at IS NULL AND expires_at::timestamptz > now()
         FOR UPDATE`,
        [tokenHash]
      )
    ).rows[0] as { user_id: number } | undefined;
    if (!row) return false;
    const usedAt = nowIso();
    await client.query(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, $1) WHERE id = $2",
      [usedAt, row.user_id]
    );
    await client.query(
      `UPDATE account_tokens SET used_at = $1
       WHERE user_id = $2 AND purpose = 'verify_email' AND used_at IS NULL`,
      [usedAt, row.user_id]
    );
    return true;
  });
}

export async function resetPasswordWithToken(
  tokenHash: string,
  passwordHash: string
): Promise<number | undefined> {
  return tx(async (client) => {
    const row = (
      await client.query(
        `SELECT user_id FROM account_tokens
         WHERE token_hash = $1 AND purpose = 'reset_password'
           AND used_at IS NULL AND expires_at::timestamptz > now()
         FOR UPDATE`,
        [tokenHash]
      )
    ).rows[0] as { user_id: number } | undefined;
    if (!row) return undefined;
    const usedAt = nowIso();
    // Receiving the reset link also proves control of the email address.
    await client.query(
      `UPDATE users SET password_hash = $1,
        email_verified_at = COALESCE(email_verified_at, $2)
       WHERE id = $3`,
      [passwordHash, usedAt, row.user_id]
    );
    await client.query("DELETE FROM sessions WHERE user_id = $1", [row.user_id]);
    await client.query(
      "UPDATE account_tokens SET used_at = $1 WHERE user_id = $2 AND used_at IS NULL",
      [usedAt, row.user_id]
    );
    return row.user_id;
  });
}

// ---------- Courses ----------

export interface CreatedCourse {
  id: number;
  generationRunId: string;
}

export async function createCourse(
  ownerId: number,
  sourceFilename: string
): Promise<CreatedCourse> {
  return tx(async (client) => {
    const user = (
      await client.query<{ name: string }>("SELECT name FROM users WHERE id = $1", [
        ownerId,
      ])
    ).rows[0];
    if (!user) throw new Error("Course owner not found");
    const personal = await ensurePersonalSpaceForUser(ownerId, user.name, client);
    const generationRunId = newGenerationRunId();
    const row = (
      await client.query<{ id: number }>(
        `INSERT INTO courses
          (owner_id, owning_space_id, title, source_filename, status, generation_run_id)
         VALUES ($1, $2, $3, $4, 'extracting', $5) RETURNING id`,
        [
          ownerId,
          personal.space.id,
          sourceFilename,
          sourceFilename,
          generationRunId,
        ]
      )
    ).rows[0];
    await initializeCourseStudioDraft(client, {
      courseId: Number(row.id),
      userId: ownerId,
      spaceId: personal.space.id,
      title: sourceFilename,
      sourceFilename,
    });
    return { id: Number(row.id), generationRunId };
  });
}

/** Persist the extracted chapters so retries regenerate without the original file. */
export async function setCourseSource(
  id: number,
  sourceJson: string,
  provenance?: {
    mimeType?: string | null;
    extractorVersion?: string;
    extractionModel?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await tx(async (client) => {
    await recordExtractedCourseSource(client, {
      courseId: id,
      extractedContentJson: sourceJson,
      mimeType: provenance?.mimeType,
      extractorVersion: provenance?.extractorVersion,
      extractionModel: provenance?.extractionModel,
      provenance: provenance?.metadata,
    });
  });
}

export async function getCourseSource(id: number): Promise<string | null> {
  const row = (await one("SELECT source_json FROM courses WHERE id = $1", [id])) as
    | { source_json: string | null }
    | undefined;
  return row?.source_json ?? null;
}

export async function setCourseStatus(
  id: number,
  status: CourseStatus,
  error?: string,
  generationRunId?: string
) {
  const result = await q(
    `UPDATE courses SET status = $1, error = $2
     WHERE id = $3 AND ($4::text IS NULL OR generation_run_id = $4)`,
    [status, error ?? null, id, generationRunId ?? null]
  );
  if (generationRunId && result.rowCount !== 1) throw new StaleGenerationRunError();
}

export async function setCourseMeta(
  id: number,
  title: string,
  description: string,
  generationRunId?: string
) {
  const result = await q(
    `UPDATE courses SET title = $1, description = $2
     WHERE id = $3 AND ($4::text IS NULL OR generation_run_id = $4)`,
    [title, description, id, generationRunId ?? null]
  );
  if (generationRunId && result.rowCount !== 1) throw new StaleGenerationRunError();
}

export async function setCoursePublished(
  id: number,
  published: boolean,
  category: string
) {
  await q("UPDATE courses SET published = $1, category = $2 WHERE id = $3", [
    published ? 1 : 0,
    category,
    id,
  ]);
}

export async function getCourse(
  id: number,
  exec?: Queryable
): Promise<(CourseRow & PlatformCourseCols) | undefined> {
  return (await one("SELECT * FROM courses WHERE id = $1", [id], exec)) as
    | (CourseRow & PlatformCourseCols)
    | undefined;
}

export interface PlatformCourseCols {
  owner_id: number;
  owning_space_id: string | null;
  published: number;
  category: string;
  price_cents: number;
  content_version: number;
  generation_run_id: string;
}

export async function listOwnedCourses(
  userId: number
): Promise<(CourseRow & PlatformCourseCols)[]> {
  return (await many(
    "SELECT * FROM courses WHERE owner_id = $1 ORDER BY created_at DESC",
    [userId]
  )) as (CourseRow & PlatformCourseCols)[];
}

export async function listEnrolledCourses(
  userId: number
): Promise<(CourseRow & PlatformCourseCols)[]> {
  return (await many(
    `SELECT c.* FROM courses c
     JOIN enrollments e ON e.course_id = c.id
     WHERE e.user_id = $1 AND c.owner_id != $1
     ORDER BY e.created_at DESC`,
    [userId]
  )) as (CourseRow & PlatformCourseCols)[];
}

export async function listPublishedCourses(qStr?: string, category?: string) {
  const args: unknown[] = [];
  let sql = `
    SELECT c.*, u.name AS owner_name,
      (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enroll_count
    FROM courses c JOIN users u ON u.id = c.owner_id
    WHERE c.published = 1 AND c.status = 'ready'`;
  if (qStr) {
    args.push(`%${qStr}%`);
    const a = `$${args.length}`;
    args.push(`%${qStr}%`);
    const b = `$${args.length}`;
    sql += ` AND (c.title ILIKE ${a} OR c.description ILIKE ${b})`;
  }
  if (category && category !== "All") {
    args.push(category);
    sql += ` AND c.category = $${args.length}`;
  }
  sql += " ORDER BY enroll_count DESC, c.created_at DESC LIMIT 100";
  return (await many(sql, args)) as (CourseRow &
    PlatformCourseCols & { owner_name: string; enroll_count: number })[];
}

export async function deleteCourse(id: number) {
  await q("DELETE FROM courses WHERE id = $1", [id]);
}

/** Claim a failed course for a new isolated generation run. */
export async function prepareCourseRetry(id: number): Promise<string | undefined> {
  return tx(async (c) => {
    const generationRunId = newGenerationRunId();
    const claimed = await c.query(
      `UPDATE courses
       SET content_version = content_version + 1,
           status = 'outlining', error = NULL,
           generation_attempts = 0, generation_heartbeat = NULL,
           generation_run_id = $2
       WHERE id = $1 AND status = 'error'`,
      [id, generationRunId]
    );
    if (claimed.rowCount !== 1) return undefined;
    const version = (
      await c.query<{ content_version: number }>(
        "SELECT content_version FROM courses WHERE id = $1",
        [id]
      )
    ).rows[0];
    await branchCourseVersionForRegeneration(c, id, version.content_version);
    await c.query("DELETE FROM modules WHERE course_id = $1", [id]);
    return generationRunId;
  });
}

// ---------- Enrollment & access ----------

export async function enroll(userId: number, courseId: number) {
  await q(
    "INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, courseId]
  );
}

export async function isEnrolled(userId: number, courseId: number): Promise<boolean> {
  return !!(await one(
    "SELECT 1 AS x FROM enrollments WHERE user_id = $1 AND course_id = $2",
    [userId, courseId]
  ));
}

/** Owner, enrolled, or classroom-assigned → full access.
    Published → auto-enroll on first use. */
export async function canAccessCourse(
  userId: number,
  courseId: number
): Promise<boolean> {
  const course = await getCourse(courseId);
  if (!course) return false;
  if (course.published) {
    await enroll(userId, courseId);
  }
  return !!(await resolveCourseLearningContext(userId, courseId, pool));
}

// ---------- Modules / lessons ----------

export async function createModule(
  courseId: number,
  title: string,
  summary: string,
  position: number,
  chapterIndexes?: number[],
  generationRunId?: string
): Promise<number> {
  const args = [
    courseId,
    title,
    summary,
    position,
    chapterIndexes ? JSON.stringify(chapterIndexes) : null,
  ];
  const row = generationRunId
    ? ((await one(
        `INSERT INTO modules
          (course_id, title, summary, position, chapter_indexes, generation_run_id,
           content_version)
         SELECT id, $2, $3, $4, $5, $6, content_version FROM courses
         WHERE id = $1 AND generation_run_id = $6
         RETURNING id`,
        [...args, generationRunId]
      )) as { id: number } | undefined)
    : ((await one(
        `INSERT INTO modules
          (course_id, title, summary, position, chapter_indexes, content_version)
         SELECT id, $2, $3, $4, $5, content_version FROM courses WHERE id = $1
         RETURNING id`,
        args
      )) as { id: number });
  if (!row) throw new StaleGenerationRunError();
  return Number(row.id);
}

export async function setModuleStatus(
  id: number,
  status: ModuleRow["status"],
  generationRunId?: string
) {
  const result = await q(
    `UPDATE modules m SET status = $1
     WHERE m.id = $2 AND ($3::text IS NULL OR (
       m.generation_run_id = $3 AND EXISTS (
         SELECT 1 FROM courses c
         WHERE c.id = m.course_id AND c.generation_run_id = $3
       )
     ))`,
    [status, id, generationRunId ?? null]
  );
  if (generationRunId && result.rowCount !== 1) throw new StaleGenerationRunError();
}

// ---------- Durable generation ----------

export class StaleGenerationRunError extends Error {
  constructor() {
    super("Generation run is no longer active");
    this.name = "StaleGenerationRunError";
  }
}

export interface GenerationCourse {
  id: number;
  status: CourseStatus;
  source_json: string | null;
  content_version: number;
  published: number;
  generation_run_id: string;
}

/** The fields the generation pipeline needs to resume a course from DB state. */
export async function getGenerationCourse(
  courseId: number
): Promise<GenerationCourse | undefined> {
  return (await one(
    `SELECT id, status, source_json, content_version, published, generation_run_id
     FROM courses WHERE id = $1`,
    [courseId]
  )) as GenerationCourse | undefined;
}

/** Mark that a generation chain is actively working on this course, now. */
export async function touchGenerationHeartbeat(courseId: number, generationRunId: string) {
  const result = await q(
    `UPDATE courses SET generation_heartbeat = $1
     WHERE id = $2 AND generation_run_id = $3`,
    [nowIso(), courseId, generationRunId]
  );
  if (result.rowCount !== 1) throw new StaleGenerationRunError();
}

export async function bumpCourseGenerationAttempts(
  courseId: number,
  generationRunId: string
): Promise<number> {
  const row = (await one(
    `UPDATE courses SET generation_attempts = generation_attempts + 1
     WHERE id = $1 AND generation_run_id = $2 RETURNING generation_attempts`,
    [courseId, generationRunId]
  )) as { generation_attempts: number } | undefined;
  if (!row) throw new StaleGenerationRunError();
  return row.generation_attempts;
}

export async function countModules(
  courseId: number,
  generationRunId?: string
): Promise<number> {
  const r = (await one(
    `SELECT COUNT(*)::int AS n FROM modules
     WHERE course_id = $1 AND ($2::text IS NULL OR generation_run_id = $2)`,
    [courseId, generationRunId ?? null]
  )) as { n: number };
  return r.n;
}

/** Modules that are not yet finished (still to generate or in flight). */
export async function countUnfinishedModules(
  courseId: number,
  generationRunId?: string
): Promise<number> {
  const r = (await one(
    `SELECT COUNT(*)::int AS n FROM modules
     WHERE course_id = $1 AND status IN ('pending', 'generating')
       AND ($2::text IS NULL OR generation_run_id = $2)`,
    [courseId, generationRunId ?? null]
  )) as { n: number };
  return r.n;
}

export interface ClaimedModule {
  id: number;
  title: string;
  chapter_indexes: number[];
  attempts: number;
}

/**
 * Atomically claim the next pending module for generation: mark it 'generating',
 * bump its attempt count, and return it. `SKIP LOCKED` keeps concurrent claims
 * from colliding. Returns undefined when nothing is left to claim.
 */
export async function claimNextModule(
  courseId: number,
  maxAttempts: number,
  generationRunId: string
): Promise<ClaimedModule | undefined> {
  const row = (await one(
    `WITH next AS (
       SELECT id FROM modules
       WHERE course_id = $1 AND status = 'pending' AND attempts < $2
         AND generation_run_id = $3
         AND EXISTS (
           SELECT 1 FROM courses c
           WHERE c.id = $1 AND c.generation_run_id = $3
         )
       ORDER BY position
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE modules m SET status = 'generating', attempts = m.attempts + 1
     FROM next WHERE m.id = next.id
     RETURNING m.id, m.title, m.chapter_indexes, m.attempts`,
    [courseId, maxAttempts, generationRunId]
  )) as
    | { id: number; title: string; chapter_indexes: string | null; attempts: number }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    chapter_indexes: row.chapter_indexes
      ? (JSON.parse(row.chapter_indexes) as number[])
      : [],
    attempts: row.attempts,
  };
}

/**
 * Recover modules left 'generating' by a chain that died. Safe because the
 * caller holds the per-course generation lock, so no other chain is mid-module:
 * ones with attempts left return to 'pending'; exhausted ones become 'error'.
 */
export async function recoverStuckModules(
  courseId: number,
  maxAttempts: number,
  generationRunId: string
) {
  const active = await getGenerationCourse(courseId);
  if (!active || active.generation_run_id !== generationRunId) {
    throw new StaleGenerationRunError();
  }
  await q(
    `UPDATE modules SET status = 'error'
     WHERE course_id = $1 AND status = 'generating' AND attempts >= $2
       AND generation_run_id = $3`,
    [courseId, maxAttempts, generationRunId]
  );
  await q(
    `UPDATE modules SET status = 'pending'
     WHERE course_id = $1 AND status = 'generating' AND attempts < $2
       AND generation_run_id = $3`,
    [courseId, maxAttempts, generationRunId]
  );
}

/**
 * Atomically lease owned courses whose generation appears stalled.
 *
 * Moving the heartbeat as part of the claim prevents every concurrent course
 * poll from firing the same recovery request. If the trigger fails, the lease
 * naturally expires after the normal stale window and another request retries.
 */
export async function claimStalledCourses(
  ownerId: number,
  staleBeforeIso: string,
  claimedAtIso: string
): Promise<{ id: number; generation_run_id: string }[]> {
  return (await many(
    `WITH stalled AS (
       SELECT id
       FROM courses
       WHERE owner_id = $1
         AND status IN ('outlining', 'generating')
         AND (generation_heartbeat IS NULL OR generation_heartbeat < $2)
       FOR UPDATE SKIP LOCKED
     )
     UPDATE courses AS course
     SET generation_heartbeat = $3
     FROM stalled
     WHERE course.id = stalled.id
     RETURNING course.id, course.generation_run_id`,
    [ownerId, staleBeforeIso, claimedAtIso]
  )) as { id: number; generation_run_id: string }[];
}

export async function listModules(courseId: number): Promise<ModuleRow[]> {
  return (await many(
    `SELECT m.* FROM modules m JOIN courses c ON c.id = m.course_id
     WHERE m.course_id = $1 AND m.content_version = c.content_version
     ORDER BY m.position`,
    [courseId]
  )) as ModuleRow[];
}

export async function createLesson(
  moduleId: number,
  title: string,
  position: number,
  cardsJson: string,
  provenance?: {
    generatorModel?: string;
    promptVersion?: string;
    generationRunId?: string;
  }
): Promise<number> {
  const args = [
    moduleId,
    title,
    position,
    cardsJson,
    provenance?.generatorModel ?? null,
    provenance?.promptVersion ?? null,
  ];
  const generationRunId = provenance?.generationRunId;
  const row = generationRunId
    ? ((await one(
        `INSERT INTO lessons
          (module_id, title, position, cards, generator_model, prompt_version,
           generation_run_id, content_version)
         SELECT m.id, $2, $3, $4, $5, $6, $7, m.content_version
         FROM modules m JOIN courses c ON c.id = m.course_id
         WHERE m.id = $1 AND m.generation_run_id = $7
           AND c.generation_run_id = $7
         RETURNING id`,
        [...args, generationRunId]
      )) as { id: number } | undefined)
    : ((await one(
        `INSERT INTO lessons
          (module_id, title, position, cards, generator_model, prompt_version,
           content_version)
         SELECT id, $2, $3, $4, $5, $6, content_version
         FROM modules WHERE id = $1 RETURNING id`,
        args
      )) as { id: number });
  if (!row) throw new StaleGenerationRunError();
  return Number(row.id);
}

export async function listLessons(moduleId: number): Promise<LessonRow[]> {
  return (await many(
    `SELECT l.* FROM lessons l JOIN modules m ON m.id = l.module_id
     WHERE l.module_id = $1 AND l.content_version = m.content_version
     ORDER BY l.position`,
    [moduleId]
  )) as LessonRow[];
}

export async function getLesson(
  id: number
): Promise<(LessonRow & { course_id: number }) | undefined> {
  return (await one(
    `SELECT l.*, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = $1`,
    [id]
  )) as (LessonRow & { course_id: number }) | undefined;
}

// ---------- Progress / stats ----------

export async function completeLesson(
  userId: number,
  lessonId: number,
  score: number,
  total: number,
  xp: number
): Promise<number> {
  return tx(async (c) => {
    const previous = (
      await c.query(
        "SELECT xp_earned FROM progress WHERE user_id = $1 AND lesson_id = $2",
        [userId, lessonId]
      )
    ).rows[0] as { xp_earned: number } | undefined;
    const awardedXp = Math.max(0, xp - (previous?.xp_earned ?? 0));
    await c.query(
      `INSERT INTO progress (user_id, lesson_id, score, total, xp_earned, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         score = GREATEST(progress.score, excluded.score),
         total = excluded.total,
         xp_earned = GREATEST(progress.xp_earned, excluded.xp_earned),
         completed_at = excluded.completed_at`,
      [userId, lessonId, score, total, xp, nowIso()]
    );

    const today = new Date().toISOString().slice(0, 10);
    await c.query(
      "INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [userId]
    );
    const stats = (
      await c.query(
        "SELECT total_xp, streak, last_active_date FROM user_stats WHERE user_id = $1",
        [userId]
      )
    ).rows[0] as { total_xp: number; streak: number; last_active_date: string | null };
    let streak = stats.streak;
    if (stats.last_active_date !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      streak = stats.last_active_date === yesterday ? streak + 1 : 1;
    }
    await c.query(
      "UPDATE user_stats SET total_xp = total_xp + $1, streak = $2, last_active_date = $3 WHERE user_id = $4",
      [awardedXp, streak, today, userId]
    );
    return awardedXp;
  });
}

export async function getCompletedLessonIds(userId: number): Promise<Set<number>> {
  const rows = (await many(
    "SELECT lesson_id FROM progress WHERE user_id = $1",
    [userId]
  )) as { lesson_id: number }[];
  return new Set(rows.map((r) => r.lesson_id));
}

export async function getStats(userId: number): Promise<{
  total_xp: number;
  streak: number;
  last_active_date: string | null;
}> {
  await q("INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [
    userId,
  ]);
  return (await one(
    "SELECT total_xp, streak, last_active_date FROM user_stats WHERE user_id = $1",
    [userId]
  )) as { total_xp: number; streak: number; last_active_date: string | null };
}

export async function weeklyLeaderboard(limit = 20): Promise<
  {
    name: string;
    xp: number;
    user_id: number;
  }[]
> {
  return (await many(
    `SELECT u.id AS user_id, u.name, SUM(p.xp_earned)::int AS xp
     FROM progress p JOIN users u ON u.id = p.user_id
     WHERE p.completed_at::timestamptz >= now() - interval '7 days'
     GROUP BY u.id, u.name ORDER BY xp DESC LIMIT $1`,
    [limit]
  )) as { name: string; xp: number; user_id: number }[];
}

// ---------- Review (SM-2 lite) ----------

export async function addReviewItem(
  userId: number,
  lessonId: number,
  cardIndex: number
) {
  const nextDue = new Date(Date.now() + 86_400_000).toISOString();
  await q(
    `INSERT INTO review_items (user_id, lesson_id, card_index, next_due, interval_days, lapses)
     VALUES ($1, $2, $3, $4, 1, 0)
     ON CONFLICT (user_id, lesson_id, card_index) DO UPDATE SET
       next_due = $4,
       interval_days = 1,
       lapses = review_items.lapses + 1`,
    [userId, lessonId, cardIndex, nextDue]
  );
}

export async function getDueReviewItems(
  userId: number,
  limit = 20
): Promise<{ id: number; lesson_id: number; card_index: number; next_due: string }[]> {
  return (await many(
    "SELECT id, lesson_id, card_index, next_due FROM review_items WHERE user_id = $1 AND next_due::timestamptz <= now() ORDER BY next_due LIMIT $2",
    [userId, limit]
  )) as {
    id: number;
    lesson_id: number;
    card_index: number;
    next_due: string;
  }[];
}

export async function answerReviewItem(
  userId: number,
  id: number,
  correct: boolean,
  exec?: Queryable
) {
  if (correct) {
    const row = (await one(
      "SELECT interval_days FROM review_items WHERE id = $1 AND user_id = $2",
      [id, userId],
      exec
    )) as { interval_days: number } | undefined;
    if (!row) return;
    const next = Math.min(row.interval_days * 2.2, 60);
    const nextDue = new Date(
      Date.now() + Math.round(next * 24) * 3_600_000
    ).toISOString();
    await q(
      "UPDATE review_items SET interval_days = $1, next_due = $2 WHERE id = $3 AND user_id = $4",
      [next, nextDue, id, userId],
      exec
    );
  } else {
    const nextDue = new Date(Date.now() + 4 * 3_600_000).toISOString();
    await q(
      "UPDATE review_items SET interval_days = 1, lapses = lapses + 1, next_due = $1 WHERE id = $2 AND user_id = $3",
      [nextDue, id, userId],
      exec
    );
  }
}

/** Add XP to a user's running total. Accepts a tx client to stay in one commit. */
export async function addStatsXp(userId: number, delta: number, exec?: Queryable) {
  await q("UPDATE user_stats SET total_xp = total_xp + $1 WHERE user_id = $2", [
    delta,
    userId,
  ], exec);
}

export async function countDueReviews(userId: number): Promise<number> {
  const r = (await one(
    "SELECT COUNT(*)::int AS n FROM review_items WHERE user_id = $1 AND next_due::timestamptz <= now()",
    [userId]
  )) as { n: number };
  return r.n;
}

// ---------- Concept mastery (the adaptive engine) ----------

/** EWMA mastery update: recent answers weigh more, old knowledge decays. */
export async function recordConceptAnswer(
  userId: number,
  courseId: number,
  concept: string,
  correct: boolean
) {
  const key = concept.trim().toLowerCase().slice(0, 60);
  if (!key) return;
  const row = (await one(
    "SELECT mastery FROM concept_mastery WHERE user_id = $1 AND course_id = $2 AND concept = $3",
    [userId, courseId, key]
  )) as { mastery: number } | undefined;
  const prev = row?.mastery ?? INITIAL_MASTERY;
  const next = nextMastery(prev, correct);
  await q(
    `INSERT INTO concept_mastery (user_id, course_id, concept, correct, wrong, mastery, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, course_id, concept) DO UPDATE SET
       correct = concept_mastery.correct + excluded.correct,
       wrong = concept_mastery.wrong + excluded.wrong,
       mastery = $6,
       updated_at = $7`,
    [userId, courseId, key, correct ? 1 : 0, correct ? 0 : 1, next, nowIso()]
  );
}

export interface MasteryRow {
  concept: string;
  correct: number;
  wrong: number;
  mastery: number;
}

export async function getCourseMastery(
  userId: number,
  courseId: number
): Promise<MasteryRow[]> {
  return (await many(
    "SELECT concept, correct, wrong, mastery FROM concept_mastery WHERE user_id = $1 AND course_id = $2 ORDER BY mastery ASC",
    [userId, courseId]
  )) as MasteryRow[];
}

/** Class-level weak spots: average mastery per concept across members. */
export async function classWeakConcepts(
  memberIds: number[],
  courseIds: number[],
  limit = 6
): Promise<{ concept: string; avg_mastery: number; learners: number }[]> {
  if (memberIds.length === 0 || courseIds.length === 0) return [];
  const args: unknown[] = [];
  const mPh = memberIds
    .map((v) => {
      args.push(v);
      return `$${args.length}`;
    })
    .join(",");
  const cPh = courseIds
    .map((v) => {
      args.push(v);
      return `$${args.length}`;
    })
    .join(",");
  args.push(limit);
  const limPh = `$${args.length}`;
  return (await many(
    `SELECT concept, AVG(mastery)::float8 AS avg_mastery,
            COUNT(DISTINCT user_id)::int AS learners
     FROM concept_mastery
     WHERE user_id IN (${mPh}) AND course_id IN (${cPh})
     GROUP BY concept HAVING COUNT(DISTINCT user_id) >= 1
     ORDER BY avg_mastery ASC LIMIT ${limPh}`,
    args
  )) as { concept: string; avg_mastery: number; learners: number }[];
}

// ---------- Immutable learning evidence ----------

export class EvidenceConflictError extends Error {
  constructor(message = "This event ID is already attached to different evidence") {
    super(message);
    this.name = "EvidenceConflictError";
  }
}

export class InvalidAnswerError extends Error {
  constructor(message = "Answer type does not match this question") {
    super(message);
    this.name = "InvalidAnswerError";
  }
}

export async function getLearnerKey(
  userId: number,
  exec?: Queryable
): Promise<string> {
  const existing = (await one(
    "SELECT learner_key FROM learning_identities WHERE user_id = $1",
    [userId],
    exec
  )) as { learner_key: string } | undefined;
  if (existing) return existing.learner_key;

  const learnerKey = `learner_${crypto.randomUUID()}`;
  await q(
    "INSERT INTO learning_identities (user_id, learner_key) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, learnerKey],
    exec
  );
  return (
    (await one(
      "SELECT learner_key FROM learning_identities WHERE user_id = $1",
      [userId],
      exec
    )) as { learner_key: string }
  ).learner_key;
}

interface QuestionContext {
  courseId: number;
  courseVersion?: number;
  lessonId?: number;
  cardIndex?: number;
  questionId: string;
  concept: string;
  card: QuizCard;
  generatorModel?: string | null;
  promptVersion?: string | null;
}

async function ensureQuestionVersion(context: QuestionContext, exec?: Queryable) {
  const conceptLabel = normalizeConcept(context.concept);
  if (!conceptLabel) throw new Error("Question has no concept");
  const conceptId = makeConceptId(context.courseId, conceptLabel);
  const version = describeQuestionVersion(context.questionId, context.card);
  const persisted = (await one(
    `SELECT concept_id, concept_label, course_version, privacy_scope
     FROM question_versions WHERE id = $1`,
    [version.id],
    exec
  )) as
    | {
        concept_id: string;
        concept_label: string;
        course_version: number;
        privacy_scope: string;
      }
    | undefined;
  if (persisted) {
    return {
      questionVersionId: version.id,
      conceptId: persisted.concept_id,
      conceptLabel: persisted.concept_label,
      courseVersion: persisted.course_version,
      privacyScope: persisted.privacy_scope,
    };
  }

  const course = await getCourse(context.courseId, exec);
  if (!course) throw new Error("Course not found");
  const courseVersion = context.courseVersion ?? course.content_version;
  const privacyScope = course.published ? "public_course" : "private_course";

  await q(
    `INSERT INTO concepts
      (id, course_id, label, normalized_label, scope)
     VALUES ($1, $2, $3, $4, 'course') ON CONFLICT DO NOTHING`,
    [conceptId, context.courseId, conceptLabel, conceptLabel],
    exec
  );

  await q(
    `INSERT INTO question_versions
      (id, question_id, content_hash, course_id, course_version, lesson_id,
       card_index, concept_id, concept_label, question_type, content_json,
       generator_model, prompt_version, privacy_scope)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT DO NOTHING`,
    [
      version.id,
      version.questionId,
      version.contentHash,
      context.courseId,
      courseVersion,
      context.lessonId ?? null,
      context.cardIndex ?? null,
      conceptId,
      conceptLabel,
      context.card.type,
      version.contentJson,
      context.generatorModel ?? null,
      context.promptVersion ?? null,
      privacyScope,
    ],
    exec
  );

  return {
    questionVersionId: version.id,
    conceptId,
    conceptLabel,
    courseVersion,
    privacyScope,
  };
}

export interface AnswerEvidenceInput extends QuestionContext {
  eventId: string;
  userId: number;
  answer: QuizAnswerValue;
  responseTimeMs: number;
  occurredAt: string;
  sessionKind: "lesson" | "practice" | "review";
  sessionId?: string;
  attemptNumber?: number;
  hintCount?: number;
  deliveryChannel?: string;
}

export class CourseParticipationRevokedError extends Error {
  constructor() {
    super("Course participation is no longer authorized");
    this.name = "CourseParticipationRevokedError";
  }
}

export interface AnswerEvidenceResult {
  eventId: string;
  inserted: boolean;
  correct: boolean;
  masteryBefore: number;
  masteryAfter: number;
  questionVersionId: string;
}

/** Append one answer and update the current mastery projection atomically.
 *  `project` runs inside the same transaction only when a new event is
 *  inserted, so source-specific side effects commit together with the event. */
export async function recordAnswerEvidence(
  input: AnswerEvidenceInput,
  project?: (client: PoolClient, recorded: AnswerEvidenceResult) => Promise<void>
): Promise<AnswerEvidenceResult> {
  return tx(async (c) => {
    if (!isQuizAnswerCompatible(input.card, input.answer)) {
      throw new InvalidAnswerError();
    }
    const spaceContext = await resolveCourseLearningContext(
      input.userId,
      input.courseId,
      c
    );
    if (!spaceContext) throw new CourseParticipationRevokedError();
    const learnerKey = await getLearnerKey(input.userId, c);
    const question = await ensureQuestionVersion(input, c);
    const canProjectMastery = !!(await getCourse(input.courseId, c));
    const correct = gradeQuizCard(input.card, input.answer);
    const responseData = answerEvidence(input.card, input.answer);
    const attemptNumber = Math.max(1, Math.trunc(input.attemptNumber ?? 1));
    type ExistingEvidence = {
      event_id: string;
      learner_key: string;
      question_version_id: string;
      response_data: string;
      session_kind: string;
      session_id: string | null;
      attempt_number: number;
      is_correct: number;
      mastery_before: number;
      mastery_after: number;
      space_id: string | null;
      membership_id: string | null;
      assignment_id: string | null;
      space_policy_version: number | null;
    };
    const byEventId = (
      await c.query(
        `SELECT event_id, learner_key, question_version_id, response_data,
                session_kind, session_id, attempt_number, is_correct,
                mastery_before, mastery_after, space_id, membership_id,
                assignment_id, space_policy_version
         FROM learning_events WHERE event_id = $1`,
        [input.eventId]
      )
    ).rows[0] as ExistingEvidence | undefined;
    const bySemanticAttempt = input.sessionId
      ? ((
          await c.query(
            `SELECT event_id, learner_key, question_version_id, response_data,
                    session_kind, session_id, attempt_number, is_correct,
                    mastery_before, mastery_after, space_id, membership_id,
                    assignment_id, space_policy_version
             FROM learning_events
             WHERE learner_key = $1 AND session_kind = $2 AND session_id = $3
               AND question_version_id = $4 AND attempt_number = $5`,
            [
              learnerKey,
              input.sessionKind,
              input.sessionId,
              question.questionVersionId,
              attemptNumber,
            ]
          )
        ).rows[0] as ExistingEvidence | undefined)
      : undefined;
    if (
      byEventId &&
      bySemanticAttempt &&
      byEventId.event_id !== bySemanticAttempt.event_id
    ) {
      throw new EvidenceConflictError();
    }
    const existing = byEventId ?? bySemanticAttempt;

    if (existing) {
      if (
        existing.learner_key !== learnerKey ||
        existing.question_version_id !== question.questionVersionId ||
        existing.response_data !== responseData ||
        existing.session_kind !== input.sessionKind ||
        existing.session_id !== (input.sessionId ?? null) ||
        existing.attempt_number !== attemptNumber ||
        existing.space_id !== spaceContext.spaceId ||
        existing.membership_id !== spaceContext.membershipId ||
        existing.assignment_id !== spaceContext.assignmentId ||
        existing.space_policy_version !== spaceContext.policyVersion
      ) {
        throw new EvidenceConflictError();
      }
      return {
        eventId: existing.event_id,
        inserted: false,
        correct: !!existing.is_correct,
        masteryBefore: existing.mastery_before,
        masteryAfter: existing.mastery_after,
        questionVersionId: existing.question_version_id,
      };
    }

    const current = canProjectMastery
      ? ((
          await c.query(
            `SELECT mastery FROM concept_mastery
             WHERE user_id = $1 AND course_id = $2 AND concept = $3`,
            [input.userId, input.courseId, question.conceptLabel]
          )
        ).rows[0] as { mastery: number } | undefined)
      : undefined;
    const masteryBefore = current?.mastery ?? INITIAL_MASTERY;
    const masteryAfter =
      input.answer === null ? masteryBefore : nextMastery(masteryBefore, correct);
    const responseTimeMs = Math.max(
      0,
      Math.min(86_400_000, Math.trunc(input.responseTimeMs))
    );

    await c.query(
      `INSERT INTO learning_events
        (event_id, learner_key, organization_id, enrollment_id, assignment_id,
         space_id, membership_id, space_policy_version,
         course_id, course_version, lesson_id, card_index, question_version_id,
         concept_id, concept_label, session_id, session_kind, delivery_channel,
         response_data, is_correct, was_skipped, response_time_ms,
         attempt_number, hint_count, mastery_before, mastery_after,
         mastery_algorithm_version, privacy_scope, occurred_at, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
               $27, $28, $29, $30)`,
      [
        input.eventId,
        learnerKey,
        null,
        null,
        spaceContext.assignmentId,
        spaceContext.spaceId,
        spaceContext.membershipId,
        spaceContext.policyVersion,
        input.courseId,
        question.courseVersion,
        input.lessonId ?? null,
        input.cardIndex ?? null,
        question.questionVersionId,
        question.conceptId,
        question.conceptLabel,
        input.sessionId ?? null,
        input.sessionKind,
        input.deliveryChannel ?? "web",
        responseData,
        correct ? 1 : 0,
        input.answer === null ? 1 : 0,
        responseTimeMs,
        attemptNumber,
        Math.max(0, Math.trunc(input.hintCount ?? 0)),
        masteryBefore,
        masteryAfter,
        MASTERY_ALGORITHM_VERSION,
        question.privacyScope,
        input.occurredAt,
        EVIDENCE_SCHEMA_VERSION,
      ]
    );

    if (canProjectMastery) {
      await c.query(
        `INSERT INTO concept_mastery
          (user_id, course_id, concept, correct, wrong, mastery, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, course_id, concept) DO UPDATE SET
           correct = concept_mastery.correct + excluded.correct,
           wrong = concept_mastery.wrong + excluded.wrong,
           mastery = excluded.mastery,
           updated_at = excluded.updated_at`,
        [
          input.userId,
          input.courseId,
          question.conceptLabel,
          input.answer === null ? 0 : correct ? 1 : 0,
          input.answer === null ? 0 : correct ? 0 : 1,
          masteryAfter,
          nowIso(),
        ]
      );
    }

    const result: AnswerEvidenceResult = {
      eventId: input.eventId,
      inserted: true,
      correct,
      masteryBefore,
      masteryAfter,
      questionVersionId: question.questionVersionId,
    };
    if (project) await project(c, result);
    return result;
  });
}

/** Has this exact learning event already been recorded for the user? */
export async function isEventRecordedForUser(
  userId: number,
  eventId: string
): Promise<boolean> {
  const learnerKey = await getLearnerKey(userId);
  return !!(await one(
    "SELECT 1 AS x FROM learning_events WHERE event_id = $1 AND learner_key = $2",
    [eventId, learnerKey]
  ));
}

export interface AnswerSessionItem extends PracticeSessionItem {
  courseId: number;
  reviewId?: number;
  reviewDueAt?: string;
}

export interface AnswerSessionRow {
  id: string;
  user_id: number;
  kind: "lesson" | "review";
  items: AnswerSessionItem[];
  created_at: string;
  expires_at: string;
  space_id?: string | null;
  membership_id?: string | null;
  assignment_id?: string | null;
  space_policy_version?: number | null;
}

async function createAnswerSession(
  userId: number,
  kind: AnswerSessionRow["kind"],
  items: AnswerSessionItem[],
  scopeCourseIds: number[] = []
): Promise<AnswerSessionRow> {
  const id = `${kind}_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await tx(async (c) => {
    const contexts = [] as Awaited<ReturnType<typeof resolveCourseLearningContext>>[];
    for (const courseId of new Set([...scopeCourseIds, ...items.map((item) => item.courseId)])) {
      const context = await resolveCourseLearningContext(userId, courseId, c);
      if (!context) throw new CourseParticipationRevokedError();
      contexts.push(context);
    }
    for (const item of items) {
      await ensureQuestionVersion(
        {
          courseId: item.courseId,
          courseVersion: item.courseVersion,
          lessonId: item.lessonId,
          cardIndex: item.cardIndex,
          questionId: item.questionId,
          concept: item.concept,
          card: item.card,
          generatorModel: item.generatorModel,
          promptVersion: item.promptVersion,
        },
        c
      );
    }
    const sharedContext = contexts.length > 0 && contexts.every((context) =>
      context?.spaceId === contexts[0]?.spaceId &&
      context?.membershipId === contexts[0]?.membershipId &&
      context?.assignmentId === contexts[0]?.assignmentId
    ) ? contexts[0] : undefined;
    await c.query(
      `INSERT INTO answer_sessions
        (id, user_id, kind, items_json, expires_at, space_id, membership_id,
         assignment_id, space_policy_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        userId,
        kind,
        JSON.stringify(items),
        expiresAt,
        sharedContext?.spaceId ?? null,
        sharedContext?.membershipId ?? null,
        sharedContext?.assignmentId ?? null,
        sharedContext?.policyVersion ?? null,
      ]
    );
  });
  return {
    id,
    user_id: userId,
    kind,
    items,
    created_at: nowIso(),
    expires_at: expiresAt,
  };
}

export async function createLessonAnswerSession(
  userId: number,
  lessonId: number
): Promise<AnswerSessionRow | undefined> {
  const lesson = await getLesson(lessonId);
  if (!lesson) return undefined;
  const cards = JSON.parse(lesson.cards) as Card[];
  const items: AnswerSessionItem[] = [];
  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex];
    if (!card.type.startsWith("quiz_")) continue;
    const quizCard = card as QuizCard;
    items.push({
      courseId: lesson.course_id,
      courseVersion: lesson.content_version,
      lessonId: lesson.id,
      cardIndex,
      questionId: `lesson:${lesson.id}:card:${cardIndex}`,
      concept: quizCard.concept || lesson.title,
      card: quizCard,
      generatorModel: lesson.generator_model,
      promptVersion: lesson.prompt_version,
    });
  }
  return createAnswerSession(userId, "lesson", items, [lesson.course_id]);
}

export async function createReviewAnswerSession(
  userId: number,
  items: AnswerSessionItem[]
): Promise<AnswerSessionRow> {
  return createAnswerSession(userId, "review", items);
}

export async function getAnswerSession(
  userId: number,
  sessionId: string,
  kind: AnswerSessionRow["kind"]
): Promise<AnswerSessionRow | undefined> {
  const row = (await one(
    `SELECT * FROM answer_sessions
     WHERE id = $1 AND user_id = $2 AND kind = $3`,
    [sessionId, userId, kind]
  )) as (Omit<AnswerSessionRow, "items"> & { items_json: string }) | undefined;
  if (!row) return undefined;
  const items = JSON.parse(row.items_json) as AnswerSessionItem[];
  for (const courseId of new Set(items.map((item) => item.courseId))) {
    if (!(await resolveCourseLearningContext(userId, courseId, pool))) return undefined;
  }
  return { ...row, items };
}

export interface PracticeSessionRow {
  id: string;
  user_id: number;
  course_id: number | null;
  fresh: number;
  items: PracticeSessionItem[];
  generator_model: string | null;
  prompt_version: string | null;
  created_at: string;
  expires_at: string;
  space_id?: string | null;
  membership_id?: string | null;
  assignment_id?: string | null;
  space_policy_version?: number | null;
}

export async function createPracticeSession(
  userId: number,
  courseId: number,
  items: (Omit<PracticeSessionItem, "questionId"> & { questionId?: string })[],
  fresh: boolean,
  provenance?: { generatorModel?: string; promptVersion?: string }
): Promise<PracticeSessionRow> {
  const id = `practice_${crypto.randomUUID()}`;
  const sessionItems: PracticeSessionItem[] = items.map((item, index) => ({
    ...item,
    courseId,
    questionId: item.questionId ?? `${id}:question:${index}`,
  }));
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

  await tx(async (c) => {
    const context = await resolveCourseLearningContext(userId, courseId, c);
    if (!context) throw new CourseParticipationRevokedError();
    const course = (
      await c.query<{ content_version: number }>(
        "SELECT content_version FROM courses WHERE id = $1",
        [courseId]
      )
    ).rows[0];
    if (!course) throw new Error("Course not found");
    for (const item of sessionItems) item.courseVersion ??= course.content_version;
    await c.query(
      `INSERT INTO practice_sessions
        (id, user_id, course_id, fresh, items_json, generator_model,
         prompt_version, expires_at, space_id, membership_id, assignment_id,
         space_policy_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        userId,
        courseId,
        fresh ? 1 : 0,
        JSON.stringify(sessionItems),
        provenance?.generatorModel ?? null,
        provenance?.promptVersion ?? null,
        expiresAt,
        context.spaceId,
        context.membershipId,
        context.assignmentId,
        context.policyVersion,
      ]
    );
    for (const item of sessionItems) {
      await ensureQuestionVersion(
        {
          courseId,
          courseVersion: item.courseVersion,
          lessonId: item.lessonId,
          cardIndex: item.cardIndex,
          questionId: item.questionId,
          concept: item.concept,
          card: item.card,
          generatorModel: item.generatorModel ?? provenance?.generatorModel,
          promptVersion: item.promptVersion ?? provenance?.promptVersion,
        },
        c
      );
    }
  });

  return {
    id,
    user_id: userId,
    course_id: courseId,
    fresh: fresh ? 1 : 0,
    items: sessionItems,
    generator_model: provenance?.generatorModel ?? null,
    prompt_version: provenance?.promptVersion ?? null,
    created_at: nowIso(),
    expires_at: expiresAt,
  };
}

export async function getPracticeSession(
  userId: number,
  sessionId: string
): Promise<PracticeSessionRow | undefined> {
  const row = (await one(
    `SELECT * FROM practice_sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  )) as (Omit<PracticeSessionRow, "items"> & { items_json: string }) | undefined;
  if (!row) return undefined;
  if (row.course_id !== null) {
    const context = await resolveCourseLearningContext(userId, row.course_id, pool);
    if (!context) return undefined;
    if (row.space_id && (
      row.space_id !== context.spaceId ||
      row.membership_id !== context.membershipId ||
      row.assignment_id !== context.assignmentId
    )) return undefined;
  }
  return { ...row, items: JSON.parse(row.items_json) as PracticeSessionItem[] };
}

export async function getReviewItemForUser(
  userId: number,
  reviewId: number
): Promise<
  { id: number; lesson_id: number; card_index: number; next_due: string } | undefined
> {
  return (await one(
    `SELECT id, lesson_id, card_index, next_due FROM review_items
     WHERE id = $1 AND user_id = $2`,
    [reviewId, userId]
  )) as
    | { id: number; lesson_id: number; card_index: number; next_due: string }
    | undefined;
}

export async function getLessonEvidenceSummary(
  userId: number,
  lessonId: number,
  answerSessionId: string
): Promise<{ score: number; total: number; wrongCardIndexes: number[] } | undefined> {
  const session = await getAnswerSession(userId, answerSessionId, "lesson");
  if (!session) return undefined;
  const expected = session.items.filter((item) => item.lessonId === lessonId);
  if (expected.length === 0) return undefined;
  const learnerKey = await getLearnerKey(userId);
  const rows = (await many(
    `SELECT question_version_id, is_correct, card_index FROM learning_events
     WHERE learner_key = $1 AND lesson_id = $2
       AND session_kind = 'lesson' AND session_id = $3`,
    [learnerKey, lessonId, answerSessionId]
  )) as {
    question_version_id: string;
    is_correct: number;
    card_index: number;
  }[];
  if (rows.length !== expected.length) return undefined;
  const expectedKeys = new Set(
    expected.map(
      (item) =>
        `${item.cardIndex}:${describeQuestionVersion(item.questionId, item.card).id}`
    )
  );
  const actualKeys = new Set(
    rows.map((row) => `${row.card_index}:${row.question_version_id}`)
  );
  if (
    expectedKeys.size !== expected.length ||
    actualKeys.size !== rows.length ||
    [...expectedKeys].some((key) => !actualKeys.has(key))
  ) {
    return undefined;
  }
  return {
    score: rows.filter((row) => row.is_correct).length,
    total: rows.length,
    wrongCardIndexes: rows
      .filter((row) => !row.is_correct)
      .map((row) => row.card_index),
  };
}

/** Idempotency guard for lesson completion (PK on answer_session_id). */
export async function lessonCompletionExists(
  answerSessionId: string
): Promise<boolean> {
  return !!(await one(
    "SELECT 1 AS x FROM lesson_completion_events WHERE answer_session_id = $1",
    [answerSessionId]
  ));
}

/** Record a lesson completion. Returns false if this session already completed. */
export async function recordLessonCompletion(input: {
  answerSessionId: string;
  userId: number;
  learnerKey: string;
  courseId: number;
  lessonId: number;
  score: number;
  total: number;
  xpAwarded: number;
}): Promise<boolean> {
  return tx(async (client) => {
    const context = await resolveCourseLearningContext(input.userId, input.courseId, client);
    if (!context) throw new CourseParticipationRevokedError();
    const r = await client.query(
      `INSERT INTO lesson_completion_events
        (answer_session_id, learner_key, course_id, lesson_id, score, total,
         xp_awarded, space_id, membership_id, assignment_id, space_policy_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING`,
      [
        input.answerSessionId,
        input.learnerKey,
        input.courseId,
        input.lessonId,
        input.score,
        input.total,
        input.xpAwarded,
        context.spaceId,
        context.membershipId,
        context.assignmentId,
        context.policyVersion,
      ]
    );
    return r.rowCount === 1;
  });
}

export async function learningLedgerHealth(): Promise<{
  events: number;
  events_24h: number;
  learners: number;
  question_versions: number;
  malformed: number;
}> {
  return (await one(
    `SELECT
      COUNT(*)::int AS events,
      COALESCE(SUM(CASE WHEN recorded_at::timestamptz >= now() - interval '1 day' THEN 1 ELSE 0 END), 0)::int AS events_24h,
      COUNT(DISTINCT learner_key)::int AS learners,
      COUNT(DISTINCT question_version_id)::int AS question_versions,
      COALESCE(SUM(CASE WHEN concept_id = '' OR question_version_id = '' THEN 1 ELSE 0 END), 0)::int AS malformed
     FROM learning_events`
  )) as {
    events: number;
    events_24h: number;
    learners: number;
    question_versions: number;
    malformed: number;
  };
}

export async function questionCalibration(limit = 100): Promise<
  {
    question_version_id: string;
    attempts: number;
    unique_learners: number;
    correct_rate: number;
    avg_response_time_ms: number;
  }[]
> {
  return (await many(
    `SELECT question_version_id,
            COUNT(*)::int AS attempts,
            COUNT(DISTINCT learner_key)::int AS unique_learners,
            AVG(is_correct)::float8 AS correct_rate,
            AVG(response_time_ms)::float8 AS avg_response_time_ms
     FROM learning_events
     WHERE was_skipped = 0
     GROUP BY question_version_id
     ORDER BY attempts DESC
     LIMIT $1`,
    [limit]
  )) as {
    question_version_id: string;
    attempts: number;
    unique_learners: number;
    correct_rate: number;
    avg_response_time_ms: number;
  }[];
}

// ---------- Classrooms ----------

export interface ClassroomRow {
  id: number;
  owner_id: number;
  name: string;
  code: string;
  created_at: string;
}

function makeClassCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createClassroom(
  ownerId: number,
  name: string
): Promise<ClassroomRow> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makeClassCode();
    try {
      return await createLegacyClassroomSpace(ownerId, name, code);
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
      /* code collision — retry */
    }
  }
  throw new Error("Could not generate a class code");
}

export async function getClassroom(id: number): Promise<ClassroomRow | undefined> {
  return (await one("SELECT * FROM classrooms WHERE id = $1", [id])) as
    | ClassroomRow
    | undefined;
}

export async function getClassroomByCode(
  code: string
): Promise<ClassroomRow | undefined> {
  return (await one("SELECT * FROM classrooms WHERE code = $1", [
    code.trim().toUpperCase(),
  ])) as ClassroomRow | undefined;
}

export async function joinClassroom(classroomId: number, userId: number) {
  await q(
    "INSERT INTO classroom_members (classroom_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [classroomId, userId]
  );
}

export async function listMyClassrooms(userId: number): Promise<
  (ClassroomRow & {
    member_count: number;
    is_owner: number;
  })[]
> {
  return (await many(
    `SELECT c.*,
      (SELECT COUNT(*)::int FROM classroom_members m WHERE m.classroom_id = c.id) AS member_count,
      (c.owner_id = $1)::int AS is_owner
     FROM classrooms c
     WHERE c.owner_id = $2
        OR c.id IN (SELECT classroom_id FROM classroom_members WHERE user_id = $3)
     ORDER BY c.created_at DESC`,
    [userId, userId, userId]
  )) as (ClassroomRow & { member_count: number; is_owner: number })[];
}

export async function classroomMembers(classroomId: number): Promise<
  {
    user_id: number;
    name: string;
    joined_at: string;
  }[]
> {
  return (await many(
    `SELECT m.user_id, u.name, m.joined_at
     FROM classroom_members m JOIN users u ON u.id = m.user_id
     WHERE m.classroom_id = $1 ORDER BY m.joined_at`,
    [classroomId]
  )) as { user_id: number; name: string; joined_at: string }[];
}

export async function isClassroomMember(
  classroomId: number,
  userId: number
): Promise<boolean> {
  return !!(await one(
    "SELECT 1 AS x FROM classroom_members WHERE classroom_id = $1 AND user_id = $2",
    [classroomId, userId]
  ));
}

export async function assignCourse(classroomId: number, courseId: number) {
  await q(
    "INSERT INTO classroom_assignments (classroom_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [classroomId, courseId]
  );
}

export async function unassignCourse(classroomId: number, courseId: number) {
  await q(
    "DELETE FROM classroom_assignments WHERE classroom_id = $1 AND course_id = $2",
    [classroomId, courseId]
  );
}

export async function classroomAssignments(
  classroomId: number
): Promise<(CourseRow & PlatformCourseCols)[]> {
  return (await many(
    `SELECT c.* FROM courses c
     JOIN classroom_assignments a ON a.course_id = c.id
     WHERE a.classroom_id = $1 ORDER BY a.assigned_at DESC`,
    [classroomId]
  )) as (CourseRow & PlatformCourseCols)[];
}

/** Is this course assigned to any classroom the user belongs to? */
export async function hasAssignmentAccess(
  userId: number,
  courseId: number
): Promise<boolean> {
  return !!(await one(
    `SELECT 1 AS x FROM classroom_assignments a
     JOIN classroom_members m ON m.classroom_id = a.classroom_id
     WHERE a.course_id = $1 AND m.user_id = $2
     UNION
     SELECT 1 FROM classroom_assignments a2
     JOIN classrooms c2 ON c2.id = a2.classroom_id
     WHERE a2.course_id = $3 AND c2.owner_id = $4`,
    [courseId, userId, courseId, userId]
  ));
}

/** Average quiz score (0-100) across a learner's completed lessons in a course. */
export async function courseAverageScore(
  userId: number,
  courseId: number
): Promise<number> {
  const r = (await one(
    `SELECT AVG(p.score * 100.0 / p.total)::float8 AS pct
     FROM progress p
     JOIN lessons l ON l.id = p.lesson_id
     JOIN modules m ON m.id = l.module_id
     WHERE p.user_id = $1 AND m.course_id = $2 AND p.total > 0`,
    [userId, courseId]
  )) as { pct: number | null };
  return Math.round(r.pct ?? 0);
}

// ---------- Certificates ----------

export interface CertificateRow {
  id: string;
  user_id: number;
  course_id: number;
  score_pct: number;
  issued_at: string;
}

export async function issueCertificate(
  id: string,
  userId: number,
  courseId: number,
  scorePct: number
): Promise<CertificateRow> {
  await q(
    "INSERT INTO certificates (id, user_id, course_id, score_pct) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    [id, userId, courseId, scorePct]
  );
  return (await one(
    "SELECT * FROM certificates WHERE user_id = $1 AND course_id = $2",
    [userId, courseId]
  )) as CertificateRow;
}

export async function getCertificate(
  id: string
): Promise<(CertificateRow & { user_name: string; course_title: string }) | undefined> {
  return (await one(
    `SELECT ct.*, u.name AS user_name, c.title AS course_title
     FROM certificates ct
     JOIN users u ON u.id = ct.user_id
     JOIN courses c ON c.id = ct.course_id
     WHERE ct.id = $1`,
    [id]
  )) as (CertificateRow & { user_name: string; course_title: string }) | undefined;
}

export async function listCertificates(userId: number): Promise<
  (CertificateRow & {
    course_title: string;
  })[]
> {
  return (await many(
    `SELECT ct.*, c.title AS course_title FROM certificates ct
     JOIN courses c ON c.id = ct.course_id
     WHERE ct.user_id = $1 ORDER BY ct.issued_at DESC`,
    [userId]
  )) as (CertificateRow & { course_title: string })[];
}

// ---------- Transactions (billing) ----------

export interface TxRow {
  id: number;
  user_id: number;
  tx_ref: string;
  product: string;
  amount_cents: number;
  currency: string;
  provider: string;
  provider_ref: string | null;
  status: "pending" | "successful" | "failed";
  created_at: string;
}

export async function createTransaction(
  userId: number,
  txRef: string,
  product: string,
  amountCents: number,
  currency: string
) {
  await q(
    "INSERT INTO transactions (user_id, tx_ref, product, amount_cents, currency) VALUES ($1, $2, $3, $4, $5)",
    [userId, txRef, product, amountCents, currency]
  );
}

export async function getTransaction(txRef: string): Promise<TxRow | undefined> {
  return (await one("SELECT * FROM transactions WHERE tx_ref = $1", [txRef])) as
    | TxRow
    | undefined;
}

export async function markTransaction(
  txRef: string,
  status: "successful" | "failed",
  providerRef?: string
) {
  await q(
    `UPDATE transactions SET status = $1, provider_ref = $2
      WHERE tx_ref = $3 AND status = 'pending'`,
    [status, providerRef ?? null, txRef]
  );
}

/** Claim and fulfill a verified payment exactly once. The transaction row lock,
 * status transition, and entitlement updates commit together, so concurrent
 * provider redirects/webhooks cannot double-grant or leave a successful ledger
 * row without its credits. */
export async function fulfillTransactionAtomically(
  txRef: string,
  providerRef: string,
  grant: { credits?: number; premiumDays?: number }
): Promise<boolean> {
  return tx(async (client) => {
    const row = (
      await client.query(
        `SELECT t.user_id, t.status, u.premium_until
           FROM transactions t JOIN users u ON u.id = t.user_id
          WHERE t.tx_ref = $1 FOR UPDATE OF t, u`,
        [txRef]
      )
    ).rows[0] as {
      user_id: number;
      status: TxRow["status"];
      premium_until: string | null;
    } | undefined;
    if (!row || row.status !== "pending") return false;

    await client.query(
      `UPDATE transactions SET status = 'successful', provider_ref = $1
        WHERE tx_ref = $2`,
      [providerRef, txRef]
    );
    const credits = Math.max(0, Math.trunc(grant.credits ?? 0));
    if (credits > 0) {
      await client.query("UPDATE users SET credits = credits + $1 WHERE id = $2", [
        credits,
        row.user_id,
      ]);
    }
    const premiumDays = Math.max(0, Math.trunc(grant.premiumDays ?? 0));
    if (premiumDays > 0) {
      const now = new Date();
      const base =
        row.premium_until && row.premium_until > now.toISOString()
          ? new Date(row.premium_until)
          : now;
      base.setUTCDate(base.getUTCDate() + premiumDays);
      await client.query("UPDATE users SET premium_until = $1 WHERE id = $2", [
        base.toISOString(),
        row.user_id,
      ]);
    }
    return true;
  });
}

export async function platformCounts() {
  const users = ((await one("SELECT COUNT(*)::int AS n FROM users")) as { n: number }).n;
  const courses = ((await one("SELECT COUNT(*)::int AS n FROM courses")) as {
    n: number;
  }).n;
  const published = ((await one(
    "SELECT COUNT(*)::int AS n FROM courses WHERE published = 1"
  )) as { n: number }).n;
  const revenue = ((await one(
    "SELECT COALESCE(SUM(amount_cents), 0)::float8 AS n FROM transactions WHERE status = 'successful'"
  )) as { n: number }).n;
  return { users, courses, published, revenue_cents: revenue };
}
