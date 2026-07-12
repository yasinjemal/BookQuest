-- Realistic "old production database" snapshot: BookQuest's earliest Postgres
-- schema (commit 1c07fd6, the SQLite -> Postgres cutover), *before* the columns
-- and tables that later work layered on via lazy ALTERs. The upgrade test applies
-- this, seeds rows, then runs the real migration runner and asserts the baseline
-- adopts it without data loss.
--
-- Deliberately missing versus the current baseline (these are what the upgrade
-- must add / backfill):
--   * courses.generation_run_id / generation_heartbeat / generation_attempts
--   * modules.chapter_indexes / attempts / generation_run_id
--   * lessons.generation_run_id
--   * users.email_verified_at
--   * tables: account_tokens, rate_limit_buckets, operational_events, and the
--     whole learning-evidence ledger (learning_identities, concepts,
--     question_versions, practice_sessions, answer_sessions, learning_events,
--     lesson_completion_events)
--
-- created_at columns take explicit values from the seed step, so the exact
-- default expression here does not matter; now()::text keeps the fixture simple.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE courses (
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
  created_at TEXT NOT NULL DEFAULT now()::text
);

CREATE TABLE modules (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  cards TEXT NOT NULL,
  generator_model TEXT,
  prompt_version TEXT
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email CITEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  credits INTEGER NOT NULL DEFAULT 3,
  premium_until TEXT,
  created_at TEXT NOT NULL DEFAULT now()::text
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE enrollments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT now()::text,
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE concept_mastery (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  mastery DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  updated_at TEXT NOT NULL DEFAULT now()::text,
  PRIMARY KEY (user_id, course_id, concept)
);

CREATE TABLE classrooms (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT now()::text
);

CREATE TABLE classroom_members (
  classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT now()::text,
  PRIMARY KEY (classroom_id, user_id)
);

CREATE TABLE classroom_assignments (
  classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT now()::text,
  PRIMARY KEY (classroom_id, course_id)
);

CREATE TABLE certificates (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  score_pct INTEGER NOT NULL,
  issued_at TEXT NOT NULL DEFAULT now()::text,
  UNIQUE (user_id, course_id)
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_ref TEXT NOT NULL UNIQUE,
  product TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL DEFAULT 'flutterwave',
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT now()::text
);

CREATE TABLE progress (
  user_id INTEGER NOT NULL DEFAULT 0,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT now()::text,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  xp_earned INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE user_stats (
  user_id INTEGER PRIMARY KEY,
  total_xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT
);

CREATE TABLE review_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 0,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  card_index INTEGER NOT NULL,
  next_due TEXT NOT NULL,
  interval_days DOUBLE PRECISION NOT NULL DEFAULT 1,
  lapses INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, lesson_id, card_index)
);
