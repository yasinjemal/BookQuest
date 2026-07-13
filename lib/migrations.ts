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

const PRIVACY_LIFECYCLE_SQL = `
ALTER TABLE users
  ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'deletion_scheduled', 'erased')),
  ADD COLUMN deletion_scheduled_at TEXT,
  ADD COLUMN erased_at TEXT;

ALTER TABLE courses
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'archived')),
  ADD COLUMN archived_at TEXT;

ALTER TABLE classrooms
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'archived')),
  ADD COLUMN archived_at TEXT;

CREATE TABLE consent_records (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('service', 'analytics', 'product_research')),
  version TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('granted', 'withdrawn')),
  source TEXT NOT NULL DEFAULT 'account',
  recorded_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX idx_consent_records_user_purpose_time
  ON consent_records(user_id, purpose, recorded_at DESC, id DESC);

CREATE TABLE privacy_actions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN (
    'export_created', 'deletion_scheduled', 'deletion_cancelled', 'erasure_completed'
  )),
  effective_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  recorded_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX idx_privacy_actions_user_time
  ON privacy_actions(user_id, recorded_at DESC, id DESC);

-- Existing accounts accepted the service terms in force when they registered.
-- Preserve that historical fact explicitly rather than inventing an optional
-- analytics/research choice for them.
INSERT INTO consent_records (user_id, purpose, version, decision, source, recorded_at)
SELECT id, 'service', 'service-v1', 'granted', 'legacy_migration', created_at
  FROM users;

CREATE OR REPLACE FUNCTION privacy_history_block_write() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'privacy and consent history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_records_no_update
  BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION privacy_history_block_write();
CREATE TRIGGER consent_records_no_delete
  BEFORE DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION privacy_history_block_write();
CREATE TRIGGER privacy_actions_no_update
  BEFORE UPDATE ON privacy_actions
  FOR EACH ROW EXECUTE FUNCTION privacy_history_block_write();
CREATE TRIGGER privacy_actions_no_delete
  BEFORE DELETE ON privacy_actions
  FOR EACH ROW EXECUTE FUNCTION privacy_history_block_write();
`;

const SPACES_TENANCY_SQL = `
CREATE TABLE spaces (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type TEXT NOT NULL CHECK (type IN (
    'personal', 'private', 'unlisted', 'organization', 'public'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'suspended', 'archived', 'deletion_scheduled'
  )),
  preset TEXT CHECK (preset IS NULL OR preset IN ('class')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  personal_owner_user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  parent_space_id TEXT REFERENCES spaces(id) ON DELETE RESTRICT,
  discovery_policy TEXT NOT NULL DEFAULT 'hidden' CHECK (discovery_policy IN (
    'owner_only', 'hidden', 'unlisted', 'organization', 'public'
  )),
  entry_policy TEXT NOT NULL DEFAULT 'invitation' CHECK (entry_policy IN (
    'owner_only', 'invitation', 'approval', 'managed', 'open', 'moderated'
  )),
  member_directory_policy TEXT NOT NULL DEFAULT 'members' CHECK (
    member_directory_policy IN ('owner_only', 'managers', 'members', 'public')
  ),
  content_sharing_policy TEXT NOT NULL DEFAULT 'members' CHECK (
    content_sharing_policy IN ('owner_only', 'members', 'organization', 'public')
  ),
  join_code_enabled SMALLINT NOT NULL DEFAULT 0 CHECK (join_code_enabled IN (0, 1)),
  language TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  profile_json TEXT NOT NULL DEFAULT '{}',
  branding_json TEXT NOT NULL DEFAULT '{}',
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  deletion_scheduled_at TEXT
);
CREATE INDEX idx_spaces_parent ON spaces(parent_space_id);
CREATE INDEX idx_spaces_type_status ON spaces(type, status);

CREATE TABLE space_memberships (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN (
    'invited', 'active', 'suspended', 'removed', 'expired'
  )),
  role TEXT NOT NULL CHECK (role IN (
    'owner', 'administrator', 'creator', 'reviewer', 'manager', 'learner', 'auditor'
  )),
  invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  invitation_id TEXT,
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  expires_at TEXT,
  joined_at TEXT,
  suspended_at TEXT,
  removed_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  UNIQUE (space_id, user_id)
);
CREATE INDEX idx_space_memberships_user_status
  ON space_memberships(user_id, status, space_id);
CREATE INDEX idx_space_memberships_space_status
  ON space_memberships(space_id, status, role);

CREATE TABLE space_teams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  UNIQUE (space_id, name)
);
CREATE INDEX idx_space_teams_space_status ON space_teams(space_id, status);

CREATE TABLE space_team_members (
  team_id TEXT NOT NULL REFERENCES space_teams(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES space_memberships(id) ON DELETE CASCADE,
  added_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  PRIMARY KEY (team_id, membership_id)
);
CREATE INDEX idx_space_team_members_membership ON space_team_members(membership_id, team_id);

CREATE TABLE space_invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  invitee_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN (
    'administrator', 'creator', 'reviewer', 'manager', 'learner', 'auditor'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'revoked', 'expired'
  )),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX idx_space_invitations_space_status
  ON space_invitations(space_id, status, expires_at);
CREATE INDEX idx_space_invitations_user_status
  ON space_invitations(invitee_user_id, status, expires_at);
CREATE UNIQUE INDEX idx_space_invitations_one_pending_user
  ON space_invitations(space_id, invitee_user_id)
  WHERE status = 'pending' AND invitee_user_id IS NOT NULL;
ALTER TABLE space_memberships
  ADD CONSTRAINT space_memberships_invitation_fk
  FOREIGN KEY (invitation_id) REFERENCES space_invitations(id) ON DELETE SET NULL;

CREATE TABLE space_courses (
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  attached_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attached_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  PRIMARY KEY (space_id, course_id)
);
CREATE INDEX idx_space_courses_course ON space_courses(course_id, space_id);

CREATE TABLE space_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  course_version INTEGER NOT NULL CHECK (course_version > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'draft', 'active', 'closed', 'archived'
  )),
  assigned_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX idx_space_assignments_space_status
  ON space_assignments(space_id, status, created_at);
CREATE INDEX idx_space_assignments_course ON space_assignments(course_id, space_id);

CREATE TABLE space_assignment_members (
  assignment_id TEXT NOT NULL REFERENCES space_assignments(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES space_memberships(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  PRIMARY KEY (assignment_id, membership_id)
);

CREATE TABLE space_audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  membership_id TEXT REFERENCES space_memberships(id) ON DELETE SET NULL,
  invitation_id TEXT REFERENCES space_invitations(id) ON DELETE SET NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  assignment_id TEXT REFERENCES space_assignments(id) ON DELETE SET NULL,
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX idx_space_audit_space_time
  ON space_audit_events(space_id, occurred_at DESC, id DESC);

CREATE OR REPLACE FUNCTION space_audit_block_write() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'space audit history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER space_audit_no_update
  BEFORE UPDATE ON space_audit_events
  FOR EACH ROW EXECUTE FUNCTION space_audit_block_write();
CREATE TRIGGER space_audit_no_delete
  BEFORE DELETE ON space_audit_events
  FOR EACH ROW EXECUTE FUNCTION space_audit_block_write();

CREATE TABLE legacy_classroom_spaces (
  classroom_id INTEGER PRIMARY KEY REFERENCES classrooms(id) ON DELETE RESTRICT,
  space_id TEXT NOT NULL UNIQUE REFERENCES spaces(id) ON DELETE RESTRICT,
  migrated_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);

-- Every existing account receives exactly one personal tenancy boundary.
INSERT INTO spaces (
  type, name, personal_owner_user_id, discovery_policy, entry_policy,
  member_directory_policy, content_sharing_policy, created_at, updated_at
)
SELECT 'personal', u.name || '''s Space', u.id, 'owner_only', 'owner_only',
       'owner_only', 'owner_only', u.created_at, u.created_at
FROM users u;

INSERT INTO space_memberships (
  space_id, user_id, status, role, policy_version, joined_at, created_at, updated_at
)
SELECT s.id, s.personal_owner_user_id, 'active', 'owner', s.policy_version,
       s.created_at, s.created_at, s.created_at
FROM spaces s
WHERE s.type = 'personal';

-- Legacy classes use deterministic opaque UUIDs so duplicate names/timestamps
-- cannot cross-wire the mapping during backfill.
INSERT INTO spaces (
  id, type, preset, name, discovery_policy, entry_policy,
  member_directory_policy, content_sharing_policy, join_code_enabled,
  created_at, updated_at
)
SELECT
  substr(md5('bookquest:classroom:' || c.id::text), 1, 8) || '-' ||
  substr(md5('bookquest:classroom:' || c.id::text), 9, 4) || '-' ||
  substr(md5('bookquest:classroom:' || c.id::text), 13, 4) || '-' ||
  substr(md5('bookquest:classroom:' || c.id::text), 17, 4) || '-' ||
  substr(md5('bookquest:classroom:' || c.id::text), 21, 12),
  'private', 'class', c.name, 'hidden', 'invitation',
  'members', 'members', 1, c.created_at, c.created_at
FROM classrooms c;

INSERT INTO legacy_classroom_spaces (classroom_id, space_id, migrated_at)
SELECT c.id,
  substr(md5('bookquest:classroom:' || c.id::text), 1, 8) || '-' ||
  substr(md5('bookquest:classroom:' || c.id::text), 9, 4) || '-' ||
  substr(md5('bookquest:classroom:' || c.id::text), 13, 4) || '-' ||
  substr(md5('bookquest:classroom:' || c.id::text), 17, 4) || '-' ||
  substr(md5('bookquest:classroom:' || c.id::text), 21, 12),
  ${ISO_NOW}
FROM classrooms c;

INSERT INTO space_memberships (
  space_id, user_id, status, role, policy_version, joined_at, created_at, updated_at
)
SELECT l.space_id, c.owner_id, 'active', 'owner', s.policy_version,
       c.created_at, c.created_at, c.created_at
FROM legacy_classroom_spaces l
JOIN classrooms c ON c.id = l.classroom_id
JOIN spaces s ON s.id = l.space_id
ON CONFLICT (space_id, user_id) DO NOTHING;

INSERT INTO space_memberships (
  space_id, user_id, status, role, policy_version, joined_at, created_at, updated_at
)
SELECT l.space_id, m.user_id, 'active', 'learner', s.policy_version,
       m.joined_at, m.joined_at, m.joined_at
FROM legacy_classroom_spaces l
JOIN classroom_members m ON m.classroom_id = l.classroom_id
JOIN spaces s ON s.id = l.space_id
ON CONFLICT (space_id, user_id) DO NOTHING;

ALTER TABLE courses ADD COLUMN owning_space_id TEXT REFERENCES spaces(id) ON DELETE RESTRICT;
UPDATE courses c
SET owning_space_id = s.id
FROM spaces s
WHERE s.type = 'personal' AND s.personal_owner_user_id = c.owner_id;
CREATE INDEX idx_courses_owning_space ON courses(owning_space_id, created_at);

INSERT INTO space_courses (space_id, course_id, attached_by_user_id, attached_at)
SELECT l.space_id, a.course_id, c.owner_id, a.assigned_at
FROM legacy_classroom_spaces l
JOIN classroom_assignments a ON a.classroom_id = l.classroom_id
JOIN classrooms c ON c.id = l.classroom_id
ON CONFLICT DO NOTHING;

INSERT INTO space_assignments (
  space_id, course_id, course_version, status, assigned_by_user_id,
  policy_version, created_at, updated_at
)
SELECT l.space_id, a.course_id, course.content_version, 'active', classroom.owner_id,
       space.policy_version, a.assigned_at, a.assigned_at
FROM legacy_classroom_spaces l
JOIN classroom_assignments a ON a.classroom_id = l.classroom_id
JOIN classrooms classroom ON classroom.id = l.classroom_id
JOIN courses course ON course.id = a.course_id
JOIN spaces space ON space.id = l.space_id;

INSERT INTO space_assignment_members (assignment_id, membership_id, assigned_at)
SELECT assignment.id, membership.id, assignment.created_at
FROM space_assignments assignment
JOIN space_memberships membership
  ON membership.space_id = assignment.space_id
 AND membership.status = 'active'
 AND membership.role <> 'owner';

ALTER TABLE answer_sessions
  ADD COLUMN space_id TEXT REFERENCES spaces(id) ON DELETE RESTRICT,
  ADD COLUMN membership_id TEXT REFERENCES space_memberships(id) ON DELETE RESTRICT,
  ADD COLUMN assignment_id TEXT REFERENCES space_assignments(id) ON DELETE RESTRICT,
  ADD COLUMN space_policy_version INTEGER;
ALTER TABLE practice_sessions
  ADD COLUMN space_id TEXT REFERENCES spaces(id) ON DELETE RESTRICT,
  ADD COLUMN membership_id TEXT REFERENCES space_memberships(id) ON DELETE RESTRICT,
  ADD COLUMN assignment_id TEXT REFERENCES space_assignments(id) ON DELETE RESTRICT,
  ADD COLUMN space_policy_version INTEGER;
ALTER TABLE learning_events
  ADD COLUMN space_id TEXT REFERENCES spaces(id) ON DELETE RESTRICT,
  ADD COLUMN membership_id TEXT REFERENCES space_memberships(id) ON DELETE RESTRICT,
  ADD COLUMN space_policy_version INTEGER;
ALTER TABLE learning_events
  ADD CONSTRAINT learning_events_assignment_fk
  FOREIGN KEY (assignment_id) REFERENCES space_assignments(id) ON DELETE RESTRICT;
ALTER TABLE lesson_completion_events
  ADD COLUMN space_id TEXT REFERENCES spaces(id) ON DELETE RESTRICT,
  ADD COLUMN membership_id TEXT REFERENCES space_memberships(id) ON DELETE RESTRICT,
  ADD COLUMN assignment_id TEXT REFERENCES space_assignments(id) ON DELETE RESTRICT,
  ADD COLUMN space_policy_version INTEGER;
CREATE INDEX idx_learning_events_space_time ON learning_events(space_id, recorded_at);
CREATE INDEX idx_learning_events_assignment_time ON learning_events(assignment_id, recorded_at);
`;

const COURSE_STUDIO_FOUNDATION_SQL = `
CREATE TABLE recipes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owning_space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN (
    'private', 'space', 'unlisted', 'public'
  )),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  forked_from_recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  forked_from_version INTEGER,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX idx_recipes_space_visibility ON recipes(owning_space_id, visibility, updated_at);

CREATE TABLE recipe_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  audience_json TEXT NOT NULL DEFAULT '{}',
  objectives_json TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT 'adaptive',
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  lesson_size_minutes INTEGER CHECK (lesson_size_minutes IS NULL OR lesson_size_minutes > 0),
  teaching_style TEXT NOT NULL DEFAULT 'clear',
  tone TEXT NOT NULL DEFAULT 'supportive',
  language TEXT NOT NULL DEFAULT 'en',
  reading_level TEXT NOT NULL DEFAULT 'general',
  block_mix_json TEXT NOT NULL DEFAULT '{}',
  assessment_json TEXT NOT NULL DEFAULT '{}',
  completion_rule_json TEXT NOT NULL DEFAULT '{}',
  credential_json TEXT NOT NULL DEFAULT '{}',
  expiry_json TEXT NOT NULL DEFAULT '{}',
  delivery_json TEXT NOT NULL DEFAULT '{}',
  accessibility_json TEXT NOT NULL DEFAULT '{}',
  source_trace_policy TEXT NOT NULL DEFAULT 'required' CHECK (source_trace_policy IN (
    'required', 'recommended', 'manual_only'
  )),
  safety_boundaries_json TEXT NOT NULL DEFAULT '[]',
  content_hash TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  published_at TEXT,
  UNIQUE (recipe_id, version)
);
CREATE INDEX idx_recipe_versions_recipe ON recipe_versions(recipe_id, version DESC);

CREATE TABLE source_assets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owning_space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN (
    'pdf', 'docx', 'markdown', 'text', 'pptx', 'webpage', 'transcript', 'manual'
  )),
  title TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN (
    'active', 'replaced', 'archived', 'deletion_scheduled'
  )),
  access_policy TEXT NOT NULL DEFAULT 'editors' CHECK (access_policy IN (
    'owner', 'editors', 'members'
  )),
  retention_policy_json TEXT NOT NULL DEFAULT '{}',
  current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  replaced_by_source_id TEXT REFERENCES source_assets(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  deletion_scheduled_at TEXT
);
CREATE INDEX idx_source_assets_space_status
  ON source_assets(owning_space_id, lifecycle_status, updated_at);

CREATE TABLE source_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_id TEXT NOT NULL REFERENCES source_assets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  content_hash TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  raw_storage_key TEXT,
  extracted_content_json TEXT,
  extraction_model TEXT,
  extractor_version TEXT,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  UNIQUE (source_id, version)
);
CREATE INDEX idx_source_versions_source ON source_versions(source_id, version DESC);

CREATE TABLE source_collections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owning_space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN (
    'active', 'archived'
  )),
  current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX idx_source_collections_space ON source_collections(owning_space_id, updated_at);

CREATE TABLE source_collection_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  collection_id TEXT NOT NULL REFERENCES source_collections(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  published_at TEXT,
  UNIQUE (collection_id, version)
);

CREATE TABLE source_collection_version_items (
  collection_version_id TEXT NOT NULL REFERENCES source_collection_versions(id) ON DELETE CASCADE,
  source_version_id TEXT NOT NULL REFERENCES source_versions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  usage_policy TEXT NOT NULL DEFAULT 'primary' CHECK (usage_policy IN (
    'primary', 'supporting', 'reference', 'excluded'
  )),
  PRIMARY KEY (collection_version_id, source_version_id),
  UNIQUE (collection_version_id, position)
);

CREATE TABLE course_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  parent_version_id TEXT REFERENCES course_versions(id) ON DELETE SET NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle_status IN (
    'draft', 'review', 'approved', 'published', 'superseded', 'archived'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_collection_version_id TEXT REFERENCES source_collection_versions(id) ON DELETE SET NULL,
  recipe_version_id TEXT REFERENCES recipe_versions(id) ON DELETE SET NULL,
  outline_json TEXT NOT NULL DEFAULT '{}',
  content_json TEXT NOT NULL DEFAULT '{"modules":[]}',
  content_hash TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  submitted_at TEXT,
  approved_at TEXT,
  published_at TEXT,
  superseded_at TEXT,
  UNIQUE (course_id, version_number)
);
CREATE INDEX idx_course_versions_course_status
  ON course_versions(course_id, lifecycle_status, version_number DESC);

ALTER TABLE courses
  ADD COLUMN authoring_status TEXT NOT NULL DEFAULT 'draft' CHECK (authoring_status IN (
    'draft', 'review', 'approved', 'published', 'superseded', 'archived'
  )),
  ADD COLUMN current_draft_version_id TEXT REFERENCES course_versions(id) ON DELETE SET NULL,
  ADD COLUMN published_version_id TEXT REFERENCES course_versions(id) ON DELETE SET NULL,
  ADD COLUMN source_collection_id TEXT REFERENCES source_collections(id) ON DELETE SET NULL;
ALTER TABLE modules ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version > 0);
ALTER TABLE lessons ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version > 0);
UPDATE modules m SET content_version = c.content_version
  FROM courses c WHERE c.id = m.course_id;
UPDATE lessons l SET content_version = m.content_version
  FROM modules m WHERE m.id = l.module_id;
CREATE INDEX idx_modules_course_content_version
  ON modules(course_id, content_version, position);
CREATE INDEX idx_lessons_module_content_version
  ON lessons(module_id, content_version, position);

CREATE TABLE course_version_sources (
  course_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  source_version_id TEXT NOT NULL REFERENCES source_versions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  coverage_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (course_version_id, source_version_id),
  UNIQUE (course_version_id, position)
);

CREATE TABLE course_source_assets (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source_assets(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (course_id, source_id),
  UNIQUE (course_id, position)
);

CREATE TABLE block_types (
  key TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  category TEXT NOT NULL CHECK (category IN (
    'instruction', 'media', 'assessment', 'activity', 'reflection', 'completion'
  )),
  supports_offline SMALLINT NOT NULL CHECK (supports_offline IN (0, 1)),
  supports_chat SMALLINT NOT NULL CHECK (supports_chat IN (0, 1)),
  fallback_type TEXT,
  accessibility_requirements_json TEXT NOT NULL DEFAULT '{}',
  active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT INTO block_types
  (key, category, supports_offline, supports_chat, fallback_type, accessibility_requirements_json)
VALUES
  ('explanation', 'instruction', 1, 1, NULL, '{"heading":true,"plain_text":true}'),
  ('image', 'media', 1, 0, 'explanation', '{"alt_text":true,"decorative_flag":true}'),
  ('audio_video', 'media', 0, 0, 'explanation', '{"captions":true,"transcript":true}'),
  ('story', 'instruction', 1, 1, 'explanation', '{"heading":true}'),
  ('worked_example', 'instruction', 1, 1, 'explanation', '{"steps":true}'),
  ('flashcard', 'assessment', 1, 1, 'explanation', '{"front_label":true,"back_label":true}'),
  ('multiple_choice', 'assessment', 1, 1, NULL, '{"prompt":true,"option_labels":true}'),
  ('true_false', 'assessment', 1, 1, NULL, '{"prompt":true}'),
  ('fill_in', 'assessment', 1, 1, NULL, '{"prompt":true,"answer_format":true}'),
  ('scenario', 'activity', 1, 1, 'explanation', '{"context":true,"decision_prompt":true}'),
  ('practical_task', 'activity', 1, 0, 'explanation', '{"instructions":true,"submission_alternative":true}'),
  ('discussion', 'reflection', 1, 1, 'explanation', '{"prompt":true,"private_alternative":true}'),
  ('survey', 'reflection', 1, 1, 'explanation', '{"question_labels":true}'),
  ('attestation', 'completion', 1, 1, 'explanation', '{"statement":true,"consent_label":true}'),
  ('recap', 'instruction', 1, 1, 'explanation', '{"heading":true,"list_semantics":true}');

CREATE TABLE course_blocks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  lineage_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  module_title TEXT NOT NULL DEFAULT '',
  module_summary TEXT NOT NULL DEFAULT '',
  lesson_key TEXT NOT NULL,
  lesson_title TEXT NOT NULL DEFAULT '',
  module_position INTEGER NOT NULL DEFAULT 0 CHECK (module_position >= 0),
  lesson_position INTEGER NOT NULL DEFAULT 0 CHECK (lesson_position >= 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  block_type TEXT NOT NULL REFERENCES block_types(key) ON DELETE RESTRICT,
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  updated_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  UNIQUE (course_version_id, lesson_key, position)
);
CREATE INDEX idx_course_blocks_version_lesson
  ON course_blocks(course_version_id, module_position, lesson_position, position);
CREATE INDEX idx_course_blocks_lineage ON course_blocks(lineage_id, course_version_id);

CREATE TABLE course_block_revisions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  block_id TEXT NOT NULL REFERENCES course_blocks(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  content_json TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  accessibility_json TEXT NOT NULL DEFAULT '{}',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  edit_origin TEXT NOT NULL CHECK (edit_origin IN (
    'generated', 'manual', 'regenerated', 'imported'
  )),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  UNIQUE (block_id, revision)
);
CREATE INDEX idx_course_block_revisions_block ON course_block_revisions(block_id, revision DESC);

CREATE TABLE course_version_reviews (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  reviewer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('commented', 'changes_requested', 'approved')),
  summary TEXT NOT NULL DEFAULT '',
  checklist_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW}
);
CREATE INDEX idx_course_version_reviews_version
  ON course_version_reviews(course_version_id, created_at);

CREATE TABLE course_version_comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  block_lineage_id TEXT,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  resolved_at TEXT,
  resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE course_generation_jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('full', 'outline', 'module', 'lesson', 'block')),
  scope_key TEXT,
  base_revision INTEGER,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'complete', 'error', 'stale'
  )),
  model TEXT,
  prompt_version TEXT,
  requested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT ${ISO_NOW},
  started_at TEXT,
  completed_at TEXT,
  error TEXT
);
CREATE INDEX idx_course_generation_jobs_version_status
  ON course_generation_jobs(course_version_id, status, created_at);

-- Backfill every legacy course into a Space-owned source and collection.
INSERT INTO source_assets
  (id, owning_space_id, created_by_user_id, kind, title, current_version, created_at, updated_at)
SELECT
  substr(md5('bookquest:source:' || c.id::text), 1, 8) || '-' ||
  substr(md5('bookquest:source:' || c.id::text), 9, 4) || '-' ||
  substr(md5('bookquest:source:' || c.id::text), 13, 4) || '-' ||
  substr(md5('bookquest:source:' || c.id::text), 17, 4) || '-' ||
  substr(md5('bookquest:source:' || c.id::text), 21, 12),
  c.owning_space_id,
  c.owner_id,
  CASE
    WHEN lower(c.source_filename) LIKE '%.pdf' THEN 'pdf'
    WHEN lower(c.source_filename) LIKE '%.docx' THEN 'docx'
    WHEN lower(c.source_filename) LIKE '%.md' OR lower(c.source_filename) LIKE '%.markdown' THEN 'markdown'
    WHEN lower(c.source_filename) LIKE '%.pptx' THEN 'pptx'
    ELSE 'text'
  END,
  c.source_filename,
  1,
  c.created_at,
  c.created_at
FROM courses c;

INSERT INTO source_versions
  (id, source_id, version, content_hash, original_filename, extracted_content_json,
   extraction_model, extractor_version, provenance_json, created_by_user_id, created_at)
SELECT
  substr(md5('bookquest:source-version:' || c.id::text || ':1'), 1, 8) || '-' ||
  substr(md5('bookquest:source-version:' || c.id::text || ':1'), 9, 4) || '-' ||
  substr(md5('bookquest:source-version:' || c.id::text || ':1'), 13, 4) || '-' ||
  substr(md5('bookquest:source-version:' || c.id::text || ':1'), 17, 4) || '-' ||
  substr(md5('bookquest:source-version:' || c.id::text || ':1'), 21, 12),
  s.id,
  1,
  md5(COALESCE(c.source_json, '')),
  c.source_filename,
  c.source_json,
  'legacy-import',
  'phase2-migration-v1',
  jsonb_build_object('legacy_course_id', c.id, 'migrated', true)::text,
  c.owner_id,
  c.created_at
FROM courses c
JOIN source_assets s
  ON s.id = substr(md5('bookquest:source:' || c.id::text), 1, 8) || '-' ||
            substr(md5('bookquest:source:' || c.id::text), 9, 4) || '-' ||
            substr(md5('bookquest:source:' || c.id::text), 13, 4) || '-' ||
            substr(md5('bookquest:source:' || c.id::text), 17, 4) || '-' ||
            substr(md5('bookquest:source:' || c.id::text), 21, 12);

INSERT INTO source_collections
  (id, owning_space_id, name, current_version, created_by_user_id, created_at, updated_at)
SELECT
  substr(md5('bookquest:source-collection:' || c.id::text), 1, 8) || '-' ||
  substr(md5('bookquest:source-collection:' || c.id::text), 9, 4) || '-' ||
  substr(md5('bookquest:source-collection:' || c.id::text), 13, 4) || '-' ||
  substr(md5('bookquest:source-collection:' || c.id::text), 17, 4) || '-' ||
  substr(md5('bookquest:source-collection:' || c.id::text), 21, 12),
  c.owning_space_id,
  c.title || ' sources',
  1,
  c.owner_id,
  c.created_at,
  c.created_at
FROM courses c;

INSERT INTO source_collection_versions
  (id, collection_id, version, status, created_by_user_id, created_at, published_at)
SELECT
  substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 1, 8) || '-' ||
  substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 9, 4) || '-' ||
  substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 13, 4) || '-' ||
  substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 17, 4) || '-' ||
  substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 21, 12),
  sc.id,
  1,
  CASE WHEN c.published = 1 THEN 'published' ELSE 'draft' END,
  c.owner_id,
  c.created_at,
  CASE WHEN c.published = 1 THEN c.created_at ELSE NULL END
FROM courses c
JOIN source_collections sc
  ON sc.id = substr(md5('bookquest:source-collection:' || c.id::text), 1, 8) || '-' ||
             substr(md5('bookquest:source-collection:' || c.id::text), 9, 4) || '-' ||
             substr(md5('bookquest:source-collection:' || c.id::text), 13, 4) || '-' ||
             substr(md5('bookquest:source-collection:' || c.id::text), 17, 4) || '-' ||
             substr(md5('bookquest:source-collection:' || c.id::text), 21, 12);

INSERT INTO source_collection_version_items
  (collection_version_id, source_version_id, position, usage_policy)
SELECT scv.id, sv.id, 0, 'primary'
FROM courses c
JOIN source_collection_versions scv
  ON scv.id = substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 1, 8) || '-' ||
              substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 9, 4) || '-' ||
              substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 13, 4) || '-' ||
              substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 17, 4) || '-' ||
              substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 21, 12)
JOIN source_versions sv
  ON sv.id = substr(md5('bookquest:source-version:' || c.id::text || ':1'), 1, 8) || '-' ||
             substr(md5('bookquest:source-version:' || c.id::text || ':1'), 9, 4) || '-' ||
             substr(md5('bookquest:source-version:' || c.id::text || ':1'), 13, 4) || '-' ||
             substr(md5('bookquest:source-version:' || c.id::text || ':1'), 17, 4) || '-' ||
             substr(md5('bookquest:source-version:' || c.id::text || ':1'), 21, 12);

INSERT INTO course_source_assets (course_id, source_id, position)
SELECT c.id, s.id, 0
FROM courses c
JOIN source_assets s
  ON s.id = substr(md5('bookquest:source:' || c.id::text), 1, 8) || '-' ||
            substr(md5('bookquest:source:' || c.id::text), 9, 4) || '-' ||
            substr(md5('bookquest:source:' || c.id::text), 13, 4) || '-' ||
            substr(md5('bookquest:source:' || c.id::text), 17, 4) || '-' ||
            substr(md5('bookquest:source:' || c.id::text), 21, 12);

WITH course_snapshots AS (
  SELECT c.*,
    jsonb_build_object(
      'modules', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'legacyModuleId', m.id,
            'title', m.title,
            'summary', m.summary,
            'position', m.position,
            'chapterIndexes', COALESCE(m.chapter_indexes, '[]'),
            'lessons', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'legacyLessonId', l.id,
                  'title', l.title,
                  'position', l.position,
                  'cards', l.cards::jsonb,
                  'generatorModel', l.generator_model,
                  'promptVersion', l.prompt_version
                ) ORDER BY l.position, l.id
              ) FROM lessons l WHERE l.module_id = m.id
            ), '[]'::jsonb)
          ) ORDER BY m.position, m.id
        ) FROM modules m WHERE m.course_id = c.id
      ), '[]'::jsonb)
    ) AS snapshot
  FROM courses c
)
INSERT INTO course_versions
  (id, course_id, version_number, lifecycle_status, title, description,
   source_collection_version_id, outline_json, content_json, content_hash,
   created_by_user_id, created_at, updated_at, published_at)
SELECT
  substr(md5('bookquest:course-version:' || c.id::text || ':' || c.content_version::text), 1, 8) || '-' ||
  substr(md5('bookquest:course-version:' || c.id::text || ':' || c.content_version::text), 9, 4) || '-' ||
  substr(md5('bookquest:course-version:' || c.id::text || ':' || c.content_version::text), 13, 4) || '-' ||
  substr(md5('bookquest:course-version:' || c.id::text || ':' || c.content_version::text), 17, 4) || '-' ||
  substr(md5('bookquest:course-version:' || c.id::text || ':' || c.content_version::text), 21, 12),
  c.id,
  c.content_version,
  CASE WHEN c.published = 1 THEN 'published' ELSE 'draft' END,
  c.title,
  c.description,
  scv.id,
  jsonb_build_object('legacy', true)::text,
  c.snapshot::text,
  md5(c.title || c.description || c.snapshot::text),
  c.owner_id,
  c.created_at,
  c.created_at,
  CASE WHEN c.published = 1 THEN c.created_at ELSE NULL END
FROM course_snapshots c
JOIN source_collection_versions scv
  ON scv.id = substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 1, 8) || '-' ||
              substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 9, 4) || '-' ||
              substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 13, 4) || '-' ||
              substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 17, 4) || '-' ||
              substr(md5('bookquest:source-collection-version:' || c.id::text || ':1'), 21, 12);

INSERT INTO course_version_sources (course_version_id, source_version_id, position, coverage_json)
SELECT cv.id, sv.id, 0, '{"status":"legacy_needs_review"}'
FROM courses c
JOIN course_versions cv ON cv.course_id = c.id AND cv.version_number = c.content_version
JOIN source_versions sv
  ON sv.id = substr(md5('bookquest:source-version:' || c.id::text || ':1'), 1, 8) || '-' ||
             substr(md5('bookquest:source-version:' || c.id::text || ':1'), 9, 4) || '-' ||
             substr(md5('bookquest:source-version:' || c.id::text || ':1'), 13, 4) || '-' ||
             substr(md5('bookquest:source-version:' || c.id::text || ':1'), 17, 4) || '-' ||
             substr(md5('bookquest:source-version:' || c.id::text || ':1'), 21, 12);

UPDATE courses c SET
  authoring_status = CASE WHEN c.published = 1 THEN 'published' ELSE 'draft' END,
  current_draft_version_id = CASE WHEN c.published = 0 THEN cv.id ELSE NULL END,
  published_version_id = CASE WHEN c.published = 1 THEN cv.id ELSE NULL END,
  source_collection_id = sc.collection_id
FROM course_versions cv
LEFT JOIN source_collection_versions sc ON sc.id = cv.source_collection_version_id
WHERE cv.course_id = c.id AND cv.version_number = c.content_version;

WITH legacy_cards AS (
  SELECT cv.id AS course_version_id, c.id AS course_id, m.id AS module_id,
    m.position AS module_position, m.chapter_indexes,
    l.id AS lesson_id, l.title AS lesson_title, l.position AS lesson_position,
    l.generator_model, l.prompt_version,
    (card.ordinality - 1)::int AS card_position, card.value AS content
  FROM course_versions cv
  JOIN courses c ON c.id = cv.course_id
  JOIN modules m ON m.course_id = c.id
  JOIN lessons l ON l.module_id = m.id
  CROSS JOIN LATERAL jsonb_array_elements(l.cards::jsonb) WITH ORDINALITY AS card(value, ordinality)
)
INSERT INTO course_blocks
  (id, course_version_id, lineage_id, lesson_key, lesson_title, module_position,
   lesson_position, position, block_type, current_revision, created_at, updated_at,
   module_key, module_title, module_summary)
SELECT
  substr(md5('bookquest:block:' || lc.course_version_id || ':' || lc.lesson_id::text || ':' || lc.card_position::text), 1, 8) || '-' ||
  substr(md5('bookquest:block:' || lc.course_version_id || ':' || lc.lesson_id::text || ':' || lc.card_position::text), 9, 4) || '-' ||
  substr(md5('bookquest:block:' || lc.course_version_id || ':' || lc.lesson_id::text || ':' || lc.card_position::text), 13, 4) || '-' ||
  substr(md5('bookquest:block:' || lc.course_version_id || ':' || lc.lesson_id::text || ':' || lc.card_position::text), 17, 4) || '-' ||
  substr(md5('bookquest:block:' || lc.course_version_id || ':' || lc.lesson_id::text || ':' || lc.card_position::text), 21, 12),
  lc.course_version_id,
  'course:' || lc.course_id::text || ':lesson:' || lc.lesson_id::text || ':card:' || lc.card_position::text,
  'legacy:' || lc.lesson_id::text,
  lc.lesson_title,
  lc.module_position,
  lc.lesson_position,
  lc.card_position,
  CASE lc.content ->> 'type'
    WHEN 'concept' THEN 'explanation'
    WHEN 'example' THEN 'worked_example'
    WHEN 'quiz_mcq' THEN 'multiple_choice'
    WHEN 'quiz_truefalse' THEN 'true_false'
    WHEN 'quiz_fillblank' THEN 'fill_in'
    WHEN 'recap' THEN 'recap'
    ELSE 'explanation'
  END,
  1,
  cv.created_at,
  cv.created_at,
  'legacy:' || lc.module_id::text,
  (SELECT title FROM modules WHERE id = lc.module_id),
  (SELECT summary FROM modules WHERE id = lc.module_id)
FROM legacy_cards lc
JOIN course_versions cv ON cv.id = lc.course_version_id;

WITH legacy_cards AS (
  SELECT cv.id AS course_version_id, m.chapter_indexes,
    l.id AS lesson_id, l.generator_model, l.prompt_version,
    (card.ordinality - 1)::int AS card_position, card.value AS content
  FROM course_versions cv
  JOIN courses c ON c.id = cv.course_id
  JOIN modules m ON m.course_id = c.id
  JOIN lessons l ON l.module_id = m.id
  CROSS JOIN LATERAL jsonb_array_elements(l.cards::jsonb) WITH ORDINALITY AS card(value, ordinality)
)
INSERT INTO course_block_revisions
  (block_id, revision, content_json, source_refs_json, accessibility_json,
   provenance_json, edit_origin, created_by_user_id, created_at)
SELECT cb.id, 1, lc.content::text,
  jsonb_build_array(jsonb_build_object('legacy_chapter_indexes', COALESCE(lc.chapter_indexes, '[]')))::text,
  '{"status":"legacy_needs_review"}',
  jsonb_build_object(
    'generator_model', lc.generator_model,
    'prompt_version', lc.prompt_version,
    'migration', 'phase2-v1'
  )::text,
  CASE WHEN lc.generator_model IS NULL THEN 'imported' ELSE 'generated' END,
  NULL,
  cv.created_at
FROM legacy_cards lc
JOIN course_blocks cb
  ON cb.course_version_id = lc.course_version_id
 AND cb.lesson_key = 'legacy:' || lc.lesson_id::text
 AND cb.position = lc.card_position
JOIN course_versions cv ON cv.id = lc.course_version_id;

CREATE OR REPLACE FUNCTION phase2_immutable_row_block_write() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Phase 2 history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER source_versions_no_update
  BEFORE UPDATE OR DELETE ON source_versions
  FOR EACH ROW EXECUTE FUNCTION phase2_immutable_row_block_write();
CREATE TRIGGER course_block_revisions_no_update
  BEFORE UPDATE OR DELETE ON course_block_revisions
  FOR EACH ROW EXECUTE FUNCTION phase2_immutable_row_block_write();
CREATE TRIGGER course_version_reviews_no_update
  BEFORE UPDATE OR DELETE ON course_version_reviews
  FOR EACH ROW EXECUTE FUNCTION phase2_immutable_row_block_write();

CREATE OR REPLACE FUNCTION phase2_version_lifecycle_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.lifecycle_status IN ('published', 'superseded', 'archived') THEN
    RAISE EXCEPTION 'Published course versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER course_versions_locked_lifecycle
  BEFORE UPDATE OR DELETE ON course_versions
  FOR EACH ROW EXECUTE FUNCTION phase2_version_lifecycle_guard();

CREATE OR REPLACE FUNCTION phase2_recipe_version_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('published', 'archived') THEN
    RAISE EXCEPTION 'Published recipe versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER recipe_versions_locked_lifecycle
  BEFORE UPDATE OR DELETE ON recipe_versions
  FOR EACH ROW EXECUTE FUNCTION phase2_recipe_version_guard();
CREATE TRIGGER source_collection_versions_locked_lifecycle
  BEFORE UPDATE OR DELETE ON source_collection_versions
  FOR EACH ROW EXECUTE FUNCTION phase2_recipe_version_guard();

CREATE OR REPLACE FUNCTION phase2_course_block_guard() RETURNS trigger AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT lifecycle_status INTO old_status
      FROM course_versions WHERE id = OLD.course_version_id;
    IF old_status IN ('published', 'superseded', 'archived') THEN
      RAISE EXCEPTION 'Published course content is immutable';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT lifecycle_status INTO new_status
      FROM course_versions WHERE id = NEW.course_version_id;
    IF new_status IN ('published', 'superseded', 'archived') THEN
      RAISE EXCEPTION 'Published course content is immutable';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER course_blocks_version_guard
  BEFORE INSERT OR UPDATE OR DELETE ON course_blocks
  FOR EACH ROW EXECUTE FUNCTION phase2_course_block_guard();

CREATE OR REPLACE FUNCTION phase2_block_revision_insert_guard() RETURNS trigger AS $$
DECLARE
  version_status TEXT;
BEGIN
  SELECT cv.lifecycle_status INTO version_status
    FROM course_blocks cb JOIN course_versions cv ON cv.id = cb.course_version_id
    WHERE cb.id = NEW.block_id;
  IF version_status IN ('published', 'superseded', 'archived') THEN
    RAISE EXCEPTION 'Published course content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER course_block_revisions_version_guard
  BEFORE INSERT ON course_block_revisions
  FOR EACH ROW EXECUTE FUNCTION phase2_block_revision_insert_guard();
`;

// Migration 4 reached production before published -> superseded was introduced.
// Keep the shipped migration byte-stable and replace the guard in a new migration.
const PHASE2_LIFECYCLE_HARDENING_SQL = `
CREATE OR REPLACE FUNCTION phase2_version_lifecycle_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.lifecycle_status IN ('published', 'superseded', 'archived') THEN
    IF TG_OP = 'UPDATE'
       AND OLD.lifecycle_status = 'published'
       AND NEW.lifecycle_status = 'superseded'
       AND NEW.superseded_at IS NOT NULL
       AND ROW(NEW.id, NEW.course_id, NEW.version_number, NEW.parent_version_id,
               NEW.title, NEW.description, NEW.source_collection_version_id,
               NEW.recipe_version_id, NEW.outline_json, NEW.content_json,
               NEW.content_hash, NEW.created_by_user_id, NEW.created_at,
               NEW.updated_at, NEW.submitted_at, NEW.approved_at, NEW.published_at)
           IS NOT DISTINCT FROM
           ROW(OLD.id, OLD.course_id, OLD.version_number, OLD.parent_version_id,
               OLD.title, OLD.description, OLD.source_collection_version_id,
               OLD.recipe_version_id, OLD.outline_json, OLD.content_json,
               OLD.content_hash, OLD.created_by_user_id, OLD.created_at,
               OLD.updated_at, OLD.submitted_at, OLD.approved_at, OLD.published_at)
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Published course versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

/**
 * Ordered migration list. Append new migrations; never edit or reorder shipped
 * ones (see the rules at the top of this file).
 */
export const MIGRATIONS: readonly Migration[] = [
  { id: 1, name: "baseline_schema", sql: BASELINE_SQL },
  { id: 2, name: "privacy_lifecycle", sql: PRIVACY_LIFECYCLE_SQL },
  { id: 3, name: "spaces_tenancy", sql: SPACES_TENANCY_SQL },
  { id: 4, name: "course_studio_foundation", sql: COURSE_STUDIO_FOUNDATION_SQL },
  { id: 5, name: "phase2_lifecycle_hardening", sql: PHASE2_LIFECYCLE_HARDENING_SQL },
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
