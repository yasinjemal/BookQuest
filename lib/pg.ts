import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

/**
 * Postgres connection layer (Neon).
 *
 * Vercel's serverless filesystem is read-only, so the app cannot use SQLite in
 * production. Every request runs in a short-lived worker, so we keep a single
 * small pool per worker and let Neon's PgBouncer pooler (the `-pooler` host in
 * DATABASE_URL) fan the connections out.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Point it at your Neon Postgres connection string " +
      "(the -pooler host, sslmode=require)."
  );
}

const globalForPg = globalThis as unknown as { __pgPool?: Pool };

export const pool =
  globalForPg.__pgPool ??
  (globalForPg.__pgPool = new Pool({
    connectionString,
    // Serverless workers are short-lived; a few connections each is plenty and
    // stays well under Neon's pooled connection ceiling.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  }));

/** Anything we can run a query against: the pool or a checked-out client. */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

// The schema is created lazily on first use and only once per worker. Concurrent
// cold starts are serialized by a transaction-scoped advisory lock so exactly
// one worker runs the DDL while the others wait and then see it already exists.
let schemaReady: Promise<void> | undefined;
export function ready(): Promise<void> {
  return (schemaReady ??= ensureSchema());
}

/** Run a parameterized query, ensuring the schema exists first. */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  exec: Queryable = pool
): Promise<QueryResult<T>> {
  await ready();
  return exec.query<T>(text, params);
}

/** Convenience: first row or undefined. */
export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  exec: Queryable = pool
): Promise<T | undefined> {
  return (await q<T>(text, params, exec)).rows[0];
}

/** Convenience: all rows. */
export async function many<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  exec: Queryable = pool
): Promise<T[]> {
  return (await q<T>(text, params, exec)).rows;
}

/** Run `fn` inside a single transaction, committing on success. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* the connection is being discarded anyway */
    }
    throw err;
  } finally {
    client.release();
  }
}

// Namespace for per-course generation locks (keeps them distinct from any other
// advisory lock the app might take). Paired with the course id as the lock key.
const GENERATION_LOCK_NAMESPACE = 828170;

/**
 * Run `fn` while holding an exclusive advisory lock for one course, so only one
 * generation chain works on a course at a time. Returns `fn`'s result, or
 * `undefined` if another worker already holds the lock (nothing was run). The
 * lock is session-scoped and auto-released if the worker dies mid-generation.
 */
export async function withCourseGenerationLock<T>(
  courseId: number,
  fn: () => Promise<T>
): Promise<T | undefined> {
  await ready();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock($1, $2) AS ok",
      [GENERATION_LOCK_NAMESPACE, courseId]
    );
    if (!rows[0].ok) return undefined;
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [
        GENERATION_LOCK_NAMESPACE,
        courseId,
      ]);
    }
  } finally {
    client.release();
  }
}

// A stable 64-bit key so every worker takes the same advisory lock during init.
const SCHEMA_LOCK_KEY = 4927310572841100n;

async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [SCHEMA_LOCK_KEY]);
    await client.query(SCHEMA_SQL);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    // Let the next caller retry rather than caching a broken init.
    schemaReady = undefined;
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Full schema as idempotent DDL. Because this targets a fresh Postgres database,
 * there is no incremental-migration dance — the final table shapes are declared
 * directly. Timestamps are stored as ISO-8601 text (matching the app's use of
 * `Date.toISOString()` everywhere) so JS-side string comparisons keep working;
 * comparisons against "now" cast the column to timestamptz in SQL.
 */
const ISO_NOW =
  `to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_filename TEXT NOT NULL,
  source_json TEXT,
  status TEXT NOT NULL DEFAULT 'extracting',
  error TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'General',
  price_cents INTEGER NOT NULL DEFAULT 0,
  content_version INTEGER NOT NULL DEFAULT 1,
  generation_heartbeat TEXT,
  generation_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);

CREATE TABLE IF NOT EXISTS modules (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  chapter_indexes TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- Columns added after the initial deploy (idempotent for already-created tables).
ALTER TABLE courses ADD COLUMN IF NOT EXISTS generation_heartbeat TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS generation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS chapter_indexes TEXT;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  cards TEXT NOT NULL,
  generator_model TEXT,
  prompt_version TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email CITEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  credits INTEGER NOT NULL DEFAULT 3,
  premium_until TEXT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);

-- Preserve existing accounts as verified when this column is introduced. On a
-- fresh database the users table is empty here, so new registrations remain
-- unverified until they confirm their address.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified_at TEXT;
    UPDATE users SET email_verified_at = created_at;
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX IF NOT EXISTS idx_account_tokens_user_purpose
  ON account_tokens(user_id, purpose, created_at);
CREATE INDEX IF NOT EXISTS idx_account_tokens_expiry
  ON account_tokens(expires_at);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT NOT NULL,
  scope TEXT NOT NULL,
  window_id BIGINT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  PRIMARY KEY (bucket_key, window_id)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expiry
  ON rate_limit_buckets(expires_at);

CREATE TABLE IF NOT EXISTS operational_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  area TEXT NOT NULL,
  subject_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX IF NOT EXISTS idx_operational_events_time
  ON operational_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_operational_events_type_time
  ON operational_events(event_type, occurred_at);

CREATE TABLE IF NOT EXISTS enrollments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS concept_mastery (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  mastery DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  PRIMARY KEY (user_id, course_id, concept)
);

CREATE TABLE IF NOT EXISTS classrooms (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);

CREATE TABLE IF NOT EXISTS classroom_members (
  classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  PRIMARY KEY (classroom_id, user_id)
);

CREATE TABLE IF NOT EXISTS classroom_assignments (
  classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  PRIMARY KEY (classroom_id, course_id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  score_pct INTEGER NOT NULL,
  issued_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_ref TEXT NOT NULL UNIQUE,
  product TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL DEFAULT 'flutterwave',
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);

CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER NOT NULL DEFAULT 0,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  xp_earned INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id INTEGER PRIMARY KEY,
  total_xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT
);

CREATE TABLE IF NOT EXISTS review_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 0,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  card_index INTEGER NOT NULL,
  next_due TEXT NOT NULL,
  interval_days DOUBLE PRECISION NOT NULL DEFAULT 1,
  lapses INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, lesson_id, card_index)
);

-- ---------- Learning evidence ledger ----------
CREATE TABLE IF NOT EXISTS learning_identities (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  learner_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  course_id INTEGER,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'course',
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_concepts_course_label
  ON concepts(course_id, normalized_label);

CREATE TABLE IF NOT EXISTS question_versions (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  course_version INTEGER NOT NULL DEFAULT 1,
  lesson_id INTEGER,
  card_index INTEGER,
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  concept_label TEXT NOT NULL,
  question_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  generator_model TEXT,
  prompt_version TEXT,
  privacy_scope TEXT NOT NULL DEFAULT 'private_course',
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  UNIQUE(question_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_question_versions_question
  ON question_versions(question_id, created_at);
CREATE INDEX IF NOT EXISTS idx_question_versions_course
  ON question_versions(course_id, concept_id);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  fresh INTEGER NOT NULL DEFAULT 0 CHECK (fresh IN (0, 1)),
  items_json TEXT NOT NULL,
  generator_model TEXT,
  prompt_version TEXT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user
  ON practice_sessions(user_id, created_at);

CREATE TABLE IF NOT EXISTS answer_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('lesson', 'review')),
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answer_sessions_user
  ON answer_sessions(user_id, kind, created_at);

CREATE TABLE IF NOT EXISTS learning_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL DEFAULT 'answer_submitted',
  learner_key TEXT NOT NULL,
  organization_id TEXT,
  enrollment_id TEXT,
  assignment_id TEXT,
  course_id INTEGER,
  course_version INTEGER NOT NULL DEFAULT 1,
  lesson_id INTEGER,
  card_index INTEGER,
  question_version_id TEXT NOT NULL REFERENCES question_versions(id),
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  concept_label TEXT NOT NULL,
  session_id TEXT,
  session_kind TEXT NOT NULL,
  delivery_channel TEXT NOT NULL DEFAULT 'web',
  response_data TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  was_skipped INTEGER NOT NULL DEFAULT 0 CHECK (was_skipped IN (0, 1)),
  response_time_ms INTEGER NOT NULL CHECK (response_time_ms >= 0),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  hint_count INTEGER NOT NULL DEFAULT 0 CHECK (hint_count >= 0),
  mastery_before DOUBLE PRECISION NOT NULL,
  mastery_after DOUBLE PRECISION NOT NULL,
  mastery_algorithm_version TEXT NOT NULL,
  consent_version TEXT NOT NULL DEFAULT 'service-v1',
  retention_class TEXT NOT NULL DEFAULT 'learning-evidence',
  privacy_scope TEXT NOT NULL DEFAULT 'private_course',
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  schema_version INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS lesson_completion_events (
  answer_session_id TEXT PRIMARY KEY,
  learner_key TEXT NOT NULL,
  course_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  xp_awarded INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX IF NOT EXISTS idx_lesson_completion_learner
  ON lesson_completion_events(learner_key, completed_at);
CREATE INDEX IF NOT EXISTS idx_learning_events_learner_time
  ON learning_events(learner_key, recorded_at);
CREATE INDEX IF NOT EXISTS idx_learning_events_question_time
  ON learning_events(question_version_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_learning_events_course_concept
  ON learning_events(course_id, concept_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_learning_events_org_time
  ON learning_events(organization_id, recorded_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_events_semantic_attempt
  ON learning_events(
    learner_key, session_kind, session_id, question_version_id, attempt_number
  )
  WHERE session_id IS NOT NULL;

-- Append-only / immutability guards (SQLite RAISE(ABORT) -> plpgsql RAISE EXCEPTION)
CREATE OR REPLACE FUNCTION learning_events_block_write() RETURNS trigger AS $fn$
BEGIN RAISE EXCEPTION 'learning_events are append-only'; END;
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION question_versions_block_write() RETURNS trigger AS $fn$
BEGIN RAISE EXCEPTION 'question version content is immutable'; END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS learning_events_no_update ON learning_events;
CREATE TRIGGER learning_events_no_update BEFORE UPDATE ON learning_events
  FOR EACH ROW EXECUTE FUNCTION learning_events_block_write();
DROP TRIGGER IF EXISTS learning_events_no_delete ON learning_events;
CREATE TRIGGER learning_events_no_delete BEFORE DELETE ON learning_events
  FOR EACH ROW EXECUTE FUNCTION learning_events_block_write();

DROP TRIGGER IF EXISTS question_versions_no_content_update ON question_versions;
CREATE TRIGGER question_versions_no_content_update
  BEFORE UPDATE OF
    question_id, content_hash, course_version, lesson_id, card_index,
    concept_id, concept_label, question_type, content_json,
    generator_model, prompt_version, privacy_scope, created_at
  ON question_versions
  FOR EACH ROW EXECUTE FUNCTION question_versions_block_write();
DROP TRIGGER IF EXISTS question_versions_no_delete ON question_versions;
CREATE TRIGGER question_versions_no_delete BEFORE DELETE ON question_versions
  FOR EACH ROW EXECUTE FUNCTION question_versions_block_write();
`;
