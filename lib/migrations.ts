/**
 * Versioned, forward-only schema migrations.
 *
 * Each migration is applied exactly once, inside its own transaction, and its id
 * is recorded in `schema_migrations` in that same transaction (see `ensureSchema`
 * in ./pg). This replaces the previous "lazy schema evolution", where the full
 * idempotent DDL re-ran — backfills and all — on every worker cold start.
 *
 * Rules for changing the schema:
 *   1. Never edit a migration that has already shipped — append a new one. Applied
 *      migrations are recorded by id, so an edit would silently never run on any
 *      database that already passed it.
 *   2. Give the new migration the next integer id (strictly increasing, no gaps).
 *   3. Migrations are forward-only: a new one may assume every earlier migration
 *      has run, so it does not need `IF NOT EXISTS` guards. The single exception is
 *      migration 1, the baseline, which stays idempotent so it can adopt both a
 *      fresh database and a pre-migrations production database without running any
 *      statement twice.
 *   4. Keep each migration transactional. Avoid statements Postgres refuses to run
 *      inside a transaction (e.g. `CREATE INDEX CONCURRENTLY`); none are used here.
 */

import type { PoolClient } from "pg";

export interface Migration {
  /** Strictly increasing from 1, with no gaps. */
  id: number;
  /** Human-readable label, recorded alongside the id in `schema_migrations`. */
  name: string;
  /** DDL run as one multi-statement transaction. No bind parameters. */
  sql: string;
}

// Postgres renders timestamps as ISO-8601 text so JS-side string comparisons keep
// working (matching the app's use of `Date.toISOString()` everywhere); comparisons
// against "now" cast the column to timestamptz in SQL.
const ISO_NOW =
  `to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Migration 1 — baseline.
 *
 * The complete schema as of the switch to versioned migrations, kept fully
 * idempotent. On a fresh database it builds everything; on a pre-migrations
 * production database every statement is a no-op (the tables, columns and
 * backfills already exist), and the runner then records it so it never runs
 * again. Future schema changes are new, forward-only migrations below — they do
 * not belong in this baseline.
 */
const BASELINE_SQL = `
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
  generation_run_id TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
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
  attempts INTEGER NOT NULL DEFAULT 0,
  generation_run_id TEXT
);

-- Columns added after the initial deploy (idempotent for already-created tables).
ALTER TABLE courses ADD COLUMN IF NOT EXISTS generation_heartbeat TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS generation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS generation_run_id TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text);
ALTER TABLE modules ADD COLUMN IF NOT EXISTS chapter_indexes TEXT;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS generation_run_id TEXT;

CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  cards TEXT NOT NULL,
  generator_model TEXT,
  prompt_version TEXT,
  generation_run_id TEXT
);
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS generation_run_id TEXT;
UPDATE modules m SET generation_run_id = c.generation_run_id
  FROM courses c
  WHERE m.course_id = c.id AND m.generation_run_id IS NULL;
UPDATE lessons l SET generation_run_id = m.generation_run_id
  FROM modules m
  WHERE l.module_id = m.id AND l.generation_run_id IS NULL;

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

/**
 * Ordered migration list. Append new migrations; never edit or reorder shipped
 * ones (see the rules at the top of this file).
 */
export const MIGRATIONS: readonly Migration[] = [
  { id: 1, name: "baseline_schema", sql: BASELINE_SQL },
];

/**
 * Fail fast if the list is malformed: ids must be `1..N`, strictly increasing
 * with no gaps or duplicates, and every migration must carry a name and SQL.
 * Runs at import time so a bad edit breaks tests and boot immediately, not after
 * a half-applied deploy.
 */
export function assertMigrationsWellFormed(
  migrations: readonly Migration[] = MIGRATIONS
): void {
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.id !== expected) {
      throw new Error(
        `Migration at position ${index} has id ${migration.id}, expected ${expected}: ` +
          `ids must start at 1 and increase by 1 with no gaps.`
      );
    }
    if (!migration.name.trim()) {
      throw new Error(`Migration ${migration.id} has an empty name.`);
    }
    if (!migration.sql.trim()) {
      throw new Error(`Migration ${migration.id} (${migration.name}) has empty SQL.`);
    }
  });
}

assertMigrationsWellFormed();

// The migration ledger records which migrations a database has already applied.
// It is created first (idempotently) so the runner can read it before applying
// anything; its own creation is not a migration.
const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`;

/**
 * Apply every not-yet-recorded migration on `client`, in order, each in its own
 * transaction with its `schema_migrations` row committed alongside its DDL — so a
 * migration is either fully applied and recorded, or not at all. Returns the ids
 * applied in this call (empty when the database is already up to date).
 *
 * The caller owns concurrency control and must pass a dedicated client, not a
 * pool (per-migration `BEGIN`/`COMMIT` needs one connection). In the app,
 * `ensureSchema` (lib/pg) holds a session-scoped advisory lock around this; the
 * upgrade test drives it directly against a scratch database.
 */
export async function applyPendingMigrations(client: PoolClient): Promise<number[]> {
  await client.query(MIGRATIONS_TABLE_SQL);
  const applied = new Set(
    (
      await client.query<{ id: number }>("SELECT id FROM schema_migrations")
    ).rows.map((row) => Number(row.id))
  );
  const ran: number[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO schema_migrations (id, name, applied_at) VALUES ($1, $2, $3)",
        [migration.id, migration.name, new Date().toISOString()]
      );
      await client.query("COMMIT");
      ran.push(migration.id);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* the connection is being discarded anyway */
      }
      throw err;
    }
  }
  return ran;
}
