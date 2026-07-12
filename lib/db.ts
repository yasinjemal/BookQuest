import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Card, CourseRow, CourseStatus, LessonRow, ModuleRow } from "./schemas";
import type { PracticeSessionItem, QuizAnswerValue, QuizCard } from "./learning-types";
import {
  answerEvidence,
  describeQuestionVersion,
  EVIDENCE_SCHEMA_VERSION,
  gradeQuizCard,
  isQuizAnswerCompatible,
  makeConceptId,
  MASTERY_ALGORITHM_VERSION,
  normalizeConcept,
} from "./learning";

const DATA_DIR = process.env.BOOKQUEST_DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });

const globalForDb = globalThis as unknown as { __db?: Database.Database };

function columnExists(db: Database.Database, table: string, col: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === col);
}
function tableExists(db: Database.Database, table: string) {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
}

function createDb(): Database.Database {
  const db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON"); // required for ON DELETE CASCADE to work

  // ---------- Base tables (v1) ----------
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_filename TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'extracting',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL,
      cards TEXT NOT NULL
    );
  `);

  // ---------- Platform tables (v2) ----------
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      credits INTEGER NOT NULL DEFAULT 3,
      premium_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS concept_mastery (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      concept TEXT NOT NULL,
      correct INTEGER NOT NULL DEFAULT 0,
      wrong INTEGER NOT NULL DEFAULT 0,
      mastery REAL NOT NULL DEFAULT 0.5,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, course_id, concept)
    );
    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS classroom_members (
      classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (classroom_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS classroom_assignments (
      classroom_id INTEGER NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (classroom_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      score_pct INTEGER NOT NULL,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tx_ref TEXT NOT NULL UNIQUE,
      product TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      provider TEXT NOT NULL DEFAULT 'flutterwave',
      provider_ref TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Course columns for platform + future marketplace
  if (!columnExists(db, "courses", "owner_id")) {
    db.exec(`ALTER TABLE courses ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists(db, "courses", "published")) {
    db.exec(`ALTER TABLE courses ADD COLUMN published INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists(db, "courses", "category")) {
    db.exec(`ALTER TABLE courses ADD COLUMN category TEXT NOT NULL DEFAULT 'General'`);
  }
  if (!columnExists(db, "courses", "price_cents")) {
    // 0 = free. Paid courses arrive with the marketplace phase.
    db.exec(`ALTER TABLE courses ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists(db, "courses", "content_version")) {
    db.exec(`ALTER TABLE courses ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1`);
  }
  if (!columnExists(db, "lessons", "generator_model")) {
    db.exec(`ALTER TABLE lessons ADD COLUMN generator_model TEXT`);
  }
  if (!columnExists(db, "lessons", "prompt_version")) {
    db.exec(`ALTER TABLE lessons ADD COLUMN prompt_version TEXT`);
  }

  // progress: single-user v1 shape → per-user
  if (tableExists(db, "progress") && !columnExists(db, "progress", "user_id")) {
    db.exec(`
      CREATE TABLE progress_v2 (
        user_id INTEGER NOT NULL DEFAULT 0,
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        completed_at TEXT NOT NULL DEFAULT (datetime('now')),
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        xp_earned INTEGER NOT NULL,
        PRIMARY KEY (user_id, lesson_id)
      );
      INSERT INTO progress_v2 (user_id, lesson_id, completed_at, score, total, xp_earned)
        SELECT 0, lesson_id, completed_at, score, total, xp_earned FROM progress;
      DROP TABLE progress;
      ALTER TABLE progress_v2 RENAME TO progress;
    `);
  } else if (!tableExists(db, "progress")) {
    db.exec(`
      CREATE TABLE progress (
        user_id INTEGER NOT NULL DEFAULT 0,
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        completed_at TEXT NOT NULL DEFAULT (datetime('now')),
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        xp_earned INTEGER NOT NULL,
        PRIMARY KEY (user_id, lesson_id)
      );
    `);
  }

  // stats (single row) → user_stats
  if (!tableExists(db, "user_stats")) {
    db.exec(`
      CREATE TABLE user_stats (
        user_id INTEGER PRIMARY KEY,
        total_xp INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        last_active_date TEXT
      );
    `);
    if (tableExists(db, "stats")) {
      db.exec(`
        INSERT OR IGNORE INTO user_stats (user_id, total_xp, streak, last_active_date)
          SELECT 0, total_xp, streak, last_active_date FROM stats WHERE id = 1;
        DROP TABLE stats;
      `);
    }
  }

  // review_items → per-user
  if (tableExists(db, "review_items") && !columnExists(db, "review_items", "user_id")) {
    db.exec(`
      CREATE TABLE review_items_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 0,
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        card_index INTEGER NOT NULL,
        next_due TEXT NOT NULL,
        interval_days REAL NOT NULL DEFAULT 1,
        lapses INTEGER NOT NULL DEFAULT 0,
        UNIQUE (user_id, lesson_id, card_index)
      );
      INSERT INTO review_items_v2 (user_id, lesson_id, card_index, next_due, interval_days, lapses)
        SELECT 0, lesson_id, card_index, next_due, interval_days, lapses FROM review_items;
      DROP TABLE review_items;
      ALTER TABLE review_items_v2 RENAME TO review_items;
    `);
  } else if (!tableExists(db, "review_items")) {
    db.exec(`
      CREATE TABLE review_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 0,
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        card_index INTEGER NOT NULL,
        next_due TEXT NOT NULL,
        interval_days REAL NOT NULL DEFAULT 1,
        lapses INTEGER NOT NULL DEFAULT 0,
        UNIQUE (user_id, lesson_id, card_index)
      );
    `);
  }

  // ---------- Learning evidence ledger (v3) ----------
  // Identity is deliberately separated from events. Erasing the mapping can
  // anonymize a learner without destroying aggregate calibration evidence.
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_identities (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      learner_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      course_id INTEGER,
      label TEXT NOT NULL,
      normalized_label TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'course',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_practice_sessions_user
      ON practice_sessions(user_id, created_at);

    CREATE TABLE IF NOT EXISTS answer_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('lesson', 'review')),
      items_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_answer_sessions_user
      ON answer_sessions(user_id, kind, created_at);

    CREATE TABLE IF NOT EXISTS learning_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      mastery_before REAL NOT NULL,
      mastery_after REAL NOT NULL,
      mastery_algorithm_version TEXT NOT NULL,
      consent_version TEXT NOT NULL DEFAULT 'service-v1',
      retention_class TEXT NOT NULL DEFAULT 'learning-evidence',
      privacy_scope TEXT NOT NULL DEFAULT 'private_course',
      occurred_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
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
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TRIGGER IF NOT EXISTS learning_events_no_update
      BEFORE UPDATE ON learning_events
      BEGIN SELECT RAISE(ABORT, 'learning_events are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS learning_events_no_delete
      BEFORE DELETE ON learning_events
      BEGIN SELECT RAISE(ABORT, 'learning_events are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS question_versions_no_content_update
      BEFORE UPDATE OF
        question_id, content_hash, course_version, lesson_id, card_index,
        concept_id, concept_label, question_type, content_json,
        generator_model, prompt_version, privacy_scope, created_at
      ON question_versions
      BEGIN SELECT RAISE(ABORT, 'question version content is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS question_versions_no_delete
      BEFORE DELETE ON question_versions
      BEGIN SELECT RAISE(ABORT, 'question versions are immutable'); END;
  `);

  return db;
}

export const db = globalForDb.__db ?? (globalForDb.__db = createDb());

// ---------- Users ----------

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: "user" | "admin";
  credits: number;
  premium_until: string | null;
  created_at: string;
}

export function createUser(
  email: string,
  name: string,
  passwordHash: string
): UserRow {
  const isFirst =
    (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n === 0;
  const r = db
    .prepare(
      "INSERT INTO users (email, name, password_hash, role, credits) VALUES (?, ?, ?, ?, ?)"
    )
    .run(email.trim(), name.trim(), passwordHash, isFirst ? "admin" : "user", 3);
  const id = Number(r.lastInsertRowid);
  if (isFirst) {
    // The first account (the platform owner) adopts all pre-platform data
    db.prepare("UPDATE courses SET owner_id = ? WHERE owner_id = 0").run(id);
    db.prepare("UPDATE progress SET user_id = ? WHERE user_id = 0").run(id);
    db.prepare("UPDATE review_items SET user_id = ? WHERE user_id = 0").run(id);
    db.prepare("UPDATE OR IGNORE user_stats SET user_id = ? WHERE user_id = 0").run(id);
  }
  db.prepare("INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)").run(id);
  return getUserById(id)!;
}

export function getUserByEmail(email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as
    | UserRow
    | undefined;
}

export function getUserById(id: number): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
}

export function isPremium(user: UserRow): boolean {
  return !!user.premium_until && user.premium_until > new Date().toISOString();
}

export function adjustCredits(userId: number, delta: number) {
  db.prepare("UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ?").run(
    delta,
    userId
  );
}

export function grantPremium(userId: number, days: number) {
  const user = getUserById(userId);
  if (!user) return;
  const base =
    user.premium_until && user.premium_until > new Date().toISOString()
      ? new Date(user.premium_until)
      : new Date();
  base.setDate(base.getDate() + days);
  db.prepare("UPDATE users SET premium_until = ? WHERE id = ?").run(
    base.toISOString(),
    userId
  );
}

export function listUsers(): UserRow[] {
  return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as UserRow[];
}

// ---------- Sessions ----------

export function createSession(userId: number, token: string, days = 30) {
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))"
  ).run(token, userId, `+${days} days`);
}

export function getSessionUser(token: string): UserRow | undefined {
  const row = db
    .prepare(
      "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')"
    )
    .get(token) as { user_id: number } | undefined;
  return row ? getUserById(row.user_id) : undefined;
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ---------- Courses ----------

export function createCourse(ownerId: number, sourceFilename: string): number {
  const r = db
    .prepare(
      "INSERT INTO courses (owner_id, title, source_filename, status) VALUES (?, ?, ?, 'extracting')"
    )
    .run(ownerId, sourceFilename, sourceFilename);
  return Number(r.lastInsertRowid);
}

export function setCourseStatus(id: number, status: CourseStatus, error?: string) {
  db.prepare("UPDATE courses SET status = ?, error = ? WHERE id = ?").run(
    status,
    error ?? null,
    id
  );
}

export function setCourseMeta(id: number, title: string, description: string) {
  db.prepare("UPDATE courses SET title = ?, description = ? WHERE id = ?").run(
    title,
    description,
    id
  );
}

export function setCoursePublished(
  id: number,
  published: boolean,
  category: string
) {
  db.prepare("UPDATE courses SET published = ?, category = ? WHERE id = ?").run(
    published ? 1 : 0,
    category,
    id
  );
}

export function getCourse(id: number): (CourseRow & PlatformCourseCols) | undefined {
  return db.prepare("SELECT * FROM courses WHERE id = ?").get(id) as
    | (CourseRow & PlatformCourseCols)
    | undefined;
}

export interface PlatformCourseCols {
  owner_id: number;
  published: number;
  category: string;
  price_cents: number;
  content_version: number;
}

export function listOwnedCourses(userId: number): (CourseRow & PlatformCourseCols)[] {
  return db
    .prepare("SELECT * FROM courses WHERE owner_id = ? ORDER BY created_at DESC")
    .all(userId) as (CourseRow & PlatformCourseCols)[];
}

export function listEnrolledCourses(userId: number): (CourseRow & PlatformCourseCols)[] {
  return db
    .prepare(
      `SELECT c.* FROM courses c
       JOIN enrollments e ON e.course_id = c.id
       WHERE e.user_id = ? AND c.owner_id != ?
       ORDER BY e.created_at DESC`
    )
    .all(userId, userId) as (CourseRow & PlatformCourseCols)[];
}

export function listPublishedCourses(q?: string, category?: string) {
  let sql = `
    SELECT c.*, u.name AS owner_name,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enroll_count
    FROM courses c JOIN users u ON u.id = c.owner_id
    WHERE c.published = 1 AND c.status = 'ready'`;
  const args: string[] = [];
  if (q) {
    sql += " AND (c.title LIKE ? OR c.description LIKE ?)";
    args.push(`%${q}%`, `%${q}%`);
  }
  if (category && category !== "All") {
    sql += " AND c.category = ?";
    args.push(category);
  }
  sql += " ORDER BY enroll_count DESC, c.created_at DESC LIMIT 100";
  return db.prepare(sql).all(...args) as (CourseRow &
    PlatformCourseCols & { owner_name: string; enroll_count: number })[];
}

export function deleteCourse(id: number) {
  db.prepare("DELETE FROM courses WHERE id = ?").run(id);
}

/** Claim a failed course for one retry and clear old generated content atomically. */
export function prepareCourseRetry(id: number): boolean {
  return db.transaction(() => {
    const claimed = db
      .prepare(
        `UPDATE courses
         SET content_version = content_version + 1,
             status = 'extracting', error = NULL
         WHERE id = ? AND status = 'error'`
      )
      .run(id);
    if (claimed.changes !== 1) return false;
    db.prepare("DELETE FROM modules WHERE course_id = ?").run(id);
    return true;
  })();
}

// ---------- Enrollment & access ----------

export function enroll(userId: number, courseId: number) {
  db.prepare(
    "INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)"
  ).run(userId, courseId);
}

export function isEnrolled(userId: number, courseId: number): boolean {
  return !!db
    .prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?")
    .get(userId, courseId);
}

/** Owner, enrolled, or classroom-assigned → full access.
    Published → auto-enroll on first use. */
export function canAccessCourse(userId: number, courseId: number): boolean {
  const course = getCourse(courseId);
  if (!course) return false;
  if (course.owner_id === userId) return true;
  if (isEnrolled(userId, courseId)) return true;
  if (hasAssignmentAccess(userId, courseId)) return true;
  if (course.published) {
    enroll(userId, courseId);
    return true;
  }
  return false;
}

// ---------- Modules / lessons ----------

export function createModule(
  courseId: number,
  title: string,
  summary: string,
  position: number
): number {
  const r = db
    .prepare(
      "INSERT INTO modules (course_id, title, summary, position) VALUES (?, ?, ?, ?)"
    )
    .run(courseId, title, summary, position);
  return Number(r.lastInsertRowid);
}

export function setModuleStatus(id: number, status: ModuleRow["status"]) {
  db.prepare("UPDATE modules SET status = ? WHERE id = ?").run(status, id);
}

export function listModules(courseId: number): ModuleRow[] {
  return db
    .prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY position")
    .all(courseId) as ModuleRow[];
}

export function createLesson(
  moduleId: number,
  title: string,
  position: number,
  cardsJson: string,
  provenance?: { generatorModel?: string; promptVersion?: string }
): number {
  const r = db
    .prepare(
      `INSERT INTO lessons
        (module_id, title, position, cards, generator_model, prompt_version)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      moduleId,
      title,
      position,
      cardsJson,
      provenance?.generatorModel ?? null,
      provenance?.promptVersion ?? null
    );
  return Number(r.lastInsertRowid);
}

export function listLessons(moduleId: number): LessonRow[] {
  return db
    .prepare("SELECT * FROM lessons WHERE module_id = ? ORDER BY position")
    .all(moduleId) as LessonRow[];
}

export function getLesson(id: number): (LessonRow & { course_id: number }) | undefined {
  return db
    .prepare(
      `SELECT l.*, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?`
    )
    .get(id) as (LessonRow & { course_id: number }) | undefined;
}

// ---------- Progress / stats ----------

export function completeLesson(
  userId: number,
  lessonId: number,
  score: number,
  total: number,
  xp: number
): number {
  const previous = db
    .prepare("SELECT xp_earned FROM progress WHERE user_id = ? AND lesson_id = ?")
    .get(userId, lessonId) as { xp_earned: number } | undefined;
  const awardedXp = Math.max(0, xp - (previous?.xp_earned ?? 0));
  db.prepare(
    `INSERT INTO progress (user_id, lesson_id, score, total, xp_earned, completed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       score = MAX(score, excluded.score),
       total = excluded.total,
       xp_earned = MAX(xp_earned, excluded.xp_earned),
       completed_at = excluded.completed_at`
  ).run(userId, lessonId, score, total, xp);

  const today = new Date().toISOString().slice(0, 10);
  const stats = getStats(userId);
  let streak = stats.streak;
  if (stats.last_active_date !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = stats.last_active_date === yesterday ? streak + 1 : 1;
  }
  db.prepare(
    "UPDATE user_stats SET total_xp = total_xp + ?, streak = ?, last_active_date = ? WHERE user_id = ?"
  ).run(awardedXp, streak, today, userId);
  return awardedXp;
}

export function getCompletedLessonIds(userId: number): Set<number> {
  const rows = db
    .prepare("SELECT lesson_id FROM progress WHERE user_id = ?")
    .all(userId) as { lesson_id: number }[];
  return new Set(rows.map((r) => r.lesson_id));
}

export function getStats(userId: number): {
  total_xp: number;
  streak: number;
  last_active_date: string | null;
} {
  db.prepare("INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)").run(userId);
  return db
    .prepare("SELECT total_xp, streak, last_active_date FROM user_stats WHERE user_id = ?")
    .get(userId) as {
    total_xp: number;
    streak: number;
    last_active_date: string | null;
  };
}

export function weeklyLeaderboard(limit = 20): {
  name: string;
  xp: number;
  user_id: number;
}[] {
  return db
    .prepare(
      `SELECT u.id AS user_id, u.name, SUM(p.xp_earned) AS xp
       FROM progress p JOIN users u ON u.id = p.user_id
       WHERE p.completed_at >= datetime('now', '-7 days')
       GROUP BY u.id ORDER BY xp DESC LIMIT ?`
    )
    .all(limit) as { name: string; xp: number; user_id: number }[];
}

// ---------- Review (SM-2 lite) ----------

export function addReviewItem(userId: number, lessonId: number, cardIndex: number) {
  db.prepare(
    `INSERT INTO review_items (user_id, lesson_id, card_index, next_due, interval_days, lapses)
     VALUES (?, ?, ?, datetime('now', '+1 day'), 1, 0)
     ON CONFLICT (user_id, lesson_id, card_index) DO UPDATE SET
       next_due = datetime('now', '+1 day'),
       interval_days = 1,
       lapses = lapses + 1`
  ).run(userId, lessonId, cardIndex);
}

export function getDueReviewItems(
  userId: number,
  limit = 20
): { id: number; lesson_id: number; card_index: number; next_due: string }[] {
  return db
    .prepare(
      "SELECT id, lesson_id, card_index, next_due FROM review_items WHERE user_id = ? AND next_due <= datetime('now') ORDER BY next_due LIMIT ?"
    )
    .all(userId, limit) as {
    id: number;
    lesson_id: number;
    card_index: number;
    next_due: string;
  }[];
}

export function answerReviewItem(userId: number, id: number, correct: boolean) {
  if (correct) {
    const row = db
      .prepare("SELECT interval_days FROM review_items WHERE id = ? AND user_id = ?")
      .get(id, userId) as { interval_days: number } | undefined;
    if (!row) return;
    const next = Math.min(row.interval_days * 2.2, 60);
    db.prepare(
      "UPDATE review_items SET interval_days = ?, next_due = datetime('now', ?) WHERE id = ? AND user_id = ?"
    ).run(next, `+${Math.round(next * 24)} hours`, id, userId);
  } else {
    db.prepare(
      "UPDATE review_items SET interval_days = 1, lapses = lapses + 1, next_due = datetime('now', '+4 hours') WHERE id = ? AND user_id = ?"
    ).run(id, userId);
  }
}

export function countDueReviews(userId: number): number {
  const r = db
    .prepare(
      "SELECT COUNT(*) AS n FROM review_items WHERE user_id = ? AND next_due <= datetime('now')"
    )
    .get(userId) as { n: number };
  return r.n;
}

// ---------- Concept mastery (the adaptive engine) ----------

/** EWMA mastery update: recent answers weigh more, old knowledge decays. */
export function recordConceptAnswer(
  userId: number,
  courseId: number,
  concept: string,
  correct: boolean
) {
  const key = concept.trim().toLowerCase().slice(0, 60);
  if (!key) return;
  const row = db
    .prepare(
      "SELECT mastery FROM concept_mastery WHERE user_id = ? AND course_id = ? AND concept = ?"
    )
    .get(userId, courseId, key) as { mastery: number } | undefined;
  const prev = row?.mastery ?? 0.5;
  const next = 0.7 * prev + 0.3 * (correct ? 1 : 0);
  db.prepare(
    `INSERT INTO concept_mastery (user_id, course_id, concept, correct, wrong, mastery, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, course_id, concept) DO UPDATE SET
       correct = correct + excluded.correct,
       wrong = wrong + excluded.wrong,
       mastery = ?,
       updated_at = datetime('now')`
  ).run(userId, courseId, key, correct ? 1 : 0, correct ? 0 : 1, next, next);
}

export interface MasteryRow {
  concept: string;
  correct: number;
  wrong: number;
  mastery: number;
}

export function getCourseMastery(userId: number, courseId: number): MasteryRow[] {
  return db
    .prepare(
      "SELECT concept, correct, wrong, mastery FROM concept_mastery WHERE user_id = ? AND course_id = ? ORDER BY mastery ASC"
    )
    .all(userId, courseId) as MasteryRow[];
}

/** Class-level weak spots: average mastery per concept across members. */
export function classWeakConcepts(
  memberIds: number[],
  courseIds: number[],
  limit = 6
): { concept: string; avg_mastery: number; learners: number }[] {
  if (memberIds.length === 0 || courseIds.length === 0) return [];
  const mPh = memberIds.map(() => "?").join(",");
  const cPh = courseIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT concept, AVG(mastery) AS avg_mastery, COUNT(DISTINCT user_id) AS learners
       FROM concept_mastery
       WHERE user_id IN (${mPh}) AND course_id IN (${cPh})
       GROUP BY concept HAVING learners >= 1
       ORDER BY avg_mastery ASC LIMIT ?`
    )
    .all(...memberIds, ...courseIds, limit) as {
    concept: string;
    avg_mastery: number;
    learners: number;
  }[];
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

export function getLearnerKey(userId: number): string {
  const existing = db
    .prepare("SELECT learner_key FROM learning_identities WHERE user_id = ?")
    .get(userId) as { learner_key: string } | undefined;
  if (existing) return existing.learner_key;

  const learnerKey = `learner_${crypto.randomUUID()}`;
  db.prepare(
    "INSERT OR IGNORE INTO learning_identities (user_id, learner_key) VALUES (?, ?)"
  ).run(userId, learnerKey);
  return (
    db
      .prepare("SELECT learner_key FROM learning_identities WHERE user_id = ?")
      .get(userId) as { learner_key: string }
  ).learner_key;
}

interface QuestionContext {
  courseId: number;
  lessonId?: number;
  cardIndex?: number;
  questionId: string;
  concept: string;
  card: QuizCard;
  generatorModel?: string | null;
  promptVersion?: string | null;
}

function ensureQuestionVersion(context: QuestionContext) {
  const conceptLabel = normalizeConcept(context.concept);
  if (!conceptLabel) throw new Error("Question has no concept");
  const conceptId = makeConceptId(context.courseId, conceptLabel);
  const version = describeQuestionVersion(context.questionId, context.card);
  const persisted = db
    .prepare(
      `SELECT concept_id, concept_label, course_version, privacy_scope
       FROM question_versions WHERE id = ?`
    )
    .get(version.id) as
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

  const course = getCourse(context.courseId);
  if (!course) throw new Error("Course not found");
  const privacyScope = course.published ? "public_course" : "private_course";

  db.prepare(
    `INSERT OR IGNORE INTO concepts
      (id, course_id, label, normalized_label, scope)
     VALUES (?, ?, ?, ?, 'course')`
  ).run(conceptId, context.courseId, conceptLabel, conceptLabel);

  db.prepare(
    `INSERT OR IGNORE INTO question_versions
      (id, question_id, content_hash, course_id, course_version, lesson_id,
       card_index, concept_id, concept_label, question_type, content_json,
       generator_model, prompt_version, privacy_scope)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    version.id,
    version.questionId,
    version.contentHash,
    context.courseId,
    course.content_version,
    context.lessonId ?? null,
    context.cardIndex ?? null,
    conceptId,
    conceptLabel,
    context.card.type,
    version.contentJson,
    context.generatorModel ?? null,
    context.promptVersion ?? null,
    privacyScope
  );

  return {
    questionVersionId: version.id,
    conceptId,
    conceptLabel,
    courseVersion: course.content_version,
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
  organizationId?: string;
  enrollmentId?: string;
  assignmentId?: string;
}

export interface AnswerEvidenceResult {
  eventId: string;
  inserted: boolean;
  correct: boolean;
  masteryBefore: number;
  masteryAfter: number;
  questionVersionId: string;
}

/** Append one answer and update the current mastery projection atomically. */
export function recordAnswerEvidence(
  input: AnswerEvidenceInput
): AnswerEvidenceResult {
  return db.transaction(() => {
    if (!isQuizAnswerCompatible(input.card, input.answer)) {
      throw new InvalidAnswerError();
    }
    const learnerKey = getLearnerKey(input.userId);
    const question = ensureQuestionVersion(input);
    const canProjectMastery = !!getCourse(input.courseId);
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
    };
    const byEventId = db
      .prepare(
        `SELECT event_id, learner_key, question_version_id, response_data,
                session_kind, session_id, attempt_number, is_correct,
                mastery_before, mastery_after
         FROM learning_events WHERE event_id = ?`
      )
      .get(input.eventId) as ExistingEvidence | undefined;
    const bySemanticAttempt = input.sessionId
      ? (db
          .prepare(
            `SELECT event_id, learner_key, question_version_id, response_data,
                    session_kind, session_id, attempt_number, is_correct,
                    mastery_before, mastery_after
             FROM learning_events
             WHERE learner_key = ? AND session_kind = ? AND session_id = ?
               AND question_version_id = ? AND attempt_number = ?`
          )
          .get(
            learnerKey,
            input.sessionKind,
            input.sessionId,
            question.questionVersionId,
            attemptNumber
          ) as ExistingEvidence | undefined)
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
        existing.attempt_number !== attemptNumber
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
      ? (db
          .prepare(
            `SELECT mastery FROM concept_mastery
             WHERE user_id = ? AND course_id = ? AND concept = ?`
          )
          .get(input.userId, input.courseId, question.conceptLabel) as
          | { mastery: number }
          | undefined)
      : undefined;
    const masteryBefore = current?.mastery ?? 0.5;
    const masteryAfter =
      input.answer === null
        ? masteryBefore
        : 0.7 * masteryBefore + 0.3 * (correct ? 1 : 0);
    const responseTimeMs = Math.max(
      0,
      Math.min(86_400_000, Math.trunc(input.responseTimeMs))
    );

    db.prepare(
      `INSERT INTO learning_events
        (event_id, learner_key, organization_id, enrollment_id, assignment_id,
         course_id, course_version, lesson_id, card_index, question_version_id,
         concept_id, concept_label, session_id, session_kind, delivery_channel,
         response_data, is_correct, was_skipped, response_time_ms,
         attempt_number, hint_count, mastery_before, mastery_after,
         mastery_algorithm_version, privacy_scope, occurred_at, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.eventId,
      learnerKey,
      input.organizationId ?? null,
      input.enrollmentId ?? null,
      input.assignmentId ?? null,
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
      EVIDENCE_SCHEMA_VERSION
    );

    if (canProjectMastery) {
      db.prepare(
        `INSERT INTO concept_mastery
          (user_id, course_id, concept, correct, wrong, mastery, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (user_id, course_id, concept) DO UPDATE SET
           correct = correct + excluded.correct,
           wrong = wrong + excluded.wrong,
           mastery = excluded.mastery,
           updated_at = datetime('now')`
      ).run(
        input.userId,
        input.courseId,
        question.conceptLabel,
        input.answer === null ? 0 : correct ? 1 : 0,
        input.answer === null ? 0 : correct ? 0 : 1,
        masteryAfter
      );
    }

    return {
      eventId: input.eventId,
      inserted: true,
      correct,
      masteryBefore,
      masteryAfter,
      questionVersionId: question.questionVersionId,
    };
  })();
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
}

function createAnswerSession(
  userId: number,
  kind: AnswerSessionRow["kind"],
  items: AnswerSessionItem[]
): AnswerSessionRow {
  const id = `${kind}_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  db.transaction(() => {
    for (const item of items) {
      ensureQuestionVersion({
        courseId: item.courseId,
        lessonId: item.lessonId,
        cardIndex: item.cardIndex,
        questionId: item.questionId,
        concept: item.concept,
        card: item.card,
        generatorModel: item.generatorModel,
        promptVersion: item.promptVersion,
      });
    }
    db.prepare(
      `INSERT INTO answer_sessions
        (id, user_id, kind, items_json, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, userId, kind, JSON.stringify(items), expiresAt);
  })();
  return {
    id,
    user_id: userId,
    kind,
    items,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  };
}

export function createLessonAnswerSession(
  userId: number,
  lessonId: number
): AnswerSessionRow | undefined {
  const lesson = getLesson(lessonId);
  if (!lesson) return undefined;
  const cards = JSON.parse(lesson.cards) as Card[];
  const items: AnswerSessionItem[] = [];
  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex];
    if (!card.type.startsWith("quiz_")) continue;
    const quizCard = card as QuizCard;
    items.push({
      courseId: lesson.course_id,
      lessonId: lesson.id,
      cardIndex,
      questionId: `lesson:${lesson.id}:card:${cardIndex}`,
      concept: quizCard.concept || lesson.title,
      card: quizCard,
      generatorModel: lesson.generator_model,
      promptVersion: lesson.prompt_version,
    });
  }
  return createAnswerSession(userId, "lesson", items);
}

export function createReviewAnswerSession(
  userId: number,
  items: AnswerSessionItem[]
): AnswerSessionRow {
  return createAnswerSession(userId, "review", items);
}

export function getAnswerSession(
  userId: number,
  sessionId: string,
  kind: AnswerSessionRow["kind"]
): AnswerSessionRow | undefined {
  const row = db
    .prepare(
      `SELECT * FROM answer_sessions
       WHERE id = ? AND user_id = ? AND kind = ?`
    )
    .get(sessionId, userId, kind) as
    | (Omit<AnswerSessionRow, "items"> & { items_json: string })
    | undefined;
  return row
    ? { ...row, items: JSON.parse(row.items_json) as AnswerSessionItem[] }
    : undefined;
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
}

export function createPracticeSession(
  userId: number,
  courseId: number,
  items: (Omit<PracticeSessionItem, "questionId"> & { questionId?: string })[],
  fresh: boolean,
  provenance?: { generatorModel?: string; promptVersion?: string }
): PracticeSessionRow {
  const id = `practice_${crypto.randomUUID()}`;
  const sessionItems: PracticeSessionItem[] = items.map((item, index) => ({
    ...item,
    courseId,
    questionId: item.questionId ?? `${id}:question:${index}`,
  }));
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO practice_sessions
        (id, user_id, course_id, fresh, items_json, generator_model,
         prompt_version, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      courseId,
      fresh ? 1 : 0,
      JSON.stringify(sessionItems),
      provenance?.generatorModel ?? null,
      provenance?.promptVersion ?? null,
      expiresAt
    );
    for (const item of sessionItems) {
      ensureQuestionVersion({
        courseId,
        lessonId: item.lessonId,
        cardIndex: item.cardIndex,
        questionId: item.questionId,
        concept: item.concept,
        card: item.card,
        generatorModel: item.generatorModel ?? provenance?.generatorModel,
        promptVersion: item.promptVersion ?? provenance?.promptVersion,
      });
    }
  })();

  return {
    id,
    user_id: userId,
    course_id: courseId,
    fresh: fresh ? 1 : 0,
    items: sessionItems,
    generator_model: provenance?.generatorModel ?? null,
    prompt_version: provenance?.promptVersion ?? null,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  };
}

export function getPracticeSession(
  userId: number,
  sessionId: string
): PracticeSessionRow | undefined {
  const row = db
    .prepare(
      `SELECT * FROM practice_sessions
       WHERE id = ? AND user_id = ?`
    )
    .get(sessionId, userId) as
    | (Omit<PracticeSessionRow, "items"> & { items_json: string })
    | undefined;
  if (!row) return undefined;
  return { ...row, items: JSON.parse(row.items_json) as PracticeSessionItem[] };
}

export function getReviewItemForUser(
  userId: number,
  reviewId: number
): { id: number; lesson_id: number; card_index: number; next_due: string } | undefined {
  return db
    .prepare(
      `SELECT id, lesson_id, card_index, next_due FROM review_items
       WHERE id = ? AND user_id = ?`
    )
    .get(reviewId, userId) as
    | { id: number; lesson_id: number; card_index: number; next_due: string }
    | undefined;
}

export function getLessonEvidenceSummary(
  userId: number,
  lessonId: number,
  answerSessionId: string
): { score: number; total: number; wrongCardIndexes: number[] } | undefined {
  const session = getAnswerSession(userId, answerSessionId, "lesson");
  if (!session) return undefined;
  const expected = session.items.filter((item) => item.lessonId === lessonId);
  if (expected.length === 0) return undefined;
  const learnerKey = getLearnerKey(userId);
  const rows = db
    .prepare(
      `SELECT question_version_id, is_correct, card_index FROM learning_events
       WHERE learner_key = ? AND lesson_id = ?
         AND session_kind = 'lesson' AND session_id = ?`
    )
    .all(learnerKey, lessonId, answerSessionId) as {
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

export function learningLedgerHealth(): {
  events: number;
  events_24h: number;
  learners: number;
  question_versions: number;
  malformed: number;
} {
  return db
    .prepare(
      `SELECT
        COUNT(*) AS events,
        COALESCE(SUM(CASE WHEN recorded_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END), 0) AS events_24h,
        COUNT(DISTINCT learner_key) AS learners,
        COUNT(DISTINCT question_version_id) AS question_versions,
        COALESCE(SUM(CASE WHEN concept_id = '' OR question_version_id = '' THEN 1 ELSE 0 END), 0) AS malformed
       FROM learning_events`
    )
    .get() as {
    events: number;
    events_24h: number;
    learners: number;
    question_versions: number;
    malformed: number;
  };
}

export function questionCalibration(limit = 100): {
  question_version_id: string;
  attempts: number;
  unique_learners: number;
  correct_rate: number;
  avg_response_time_ms: number;
}[] {
  return db
    .prepare(
      `SELECT question_version_id,
              COUNT(*) AS attempts,
              COUNT(DISTINCT learner_key) AS unique_learners,
              AVG(is_correct) AS correct_rate,
              AVG(response_time_ms) AS avg_response_time_ms
       FROM learning_events
       WHERE was_skipped = 0
       GROUP BY question_version_id
       ORDER BY attempts DESC
       LIMIT ?`
    )
    .all(limit) as {
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

export function createClassroom(ownerId: number, name: string): ClassroomRow {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makeClassCode();
    try {
      const r = db
        .prepare("INSERT INTO classrooms (owner_id, name, code) VALUES (?, ?, ?)")
        .run(ownerId, name.trim().slice(0, 80), code);
      return getClassroom(Number(r.lastInsertRowid))!;
    } catch {
      /* code collision — retry */
    }
  }
  throw new Error("Could not generate a class code");
}

export function getClassroom(id: number): ClassroomRow | undefined {
  return db.prepare("SELECT * FROM classrooms WHERE id = ?").get(id) as
    | ClassroomRow
    | undefined;
}

export function getClassroomByCode(code: string): ClassroomRow | undefined {
  return db
    .prepare("SELECT * FROM classrooms WHERE code = ?")
    .get(code.trim().toUpperCase()) as ClassroomRow | undefined;
}

export function joinClassroom(classroomId: number, userId: number) {
  db.prepare(
    "INSERT OR IGNORE INTO classroom_members (classroom_id, user_id) VALUES (?, ?)"
  ).run(classroomId, userId);
}

export function listMyClassrooms(userId: number): (ClassroomRow & {
  member_count: number;
  is_owner: number;
})[] {
  return db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM classroom_members m WHERE m.classroom_id = c.id) AS member_count,
        (c.owner_id = ?) AS is_owner
       FROM classrooms c
       WHERE c.owner_id = ?
          OR c.id IN (SELECT classroom_id FROM classroom_members WHERE user_id = ?)
       ORDER BY c.created_at DESC`
    )
    .all(userId, userId, userId) as (ClassroomRow & {
    member_count: number;
    is_owner: number;
  })[];
}

export function classroomMembers(classroomId: number): {
  user_id: number;
  name: string;
  joined_at: string;
}[] {
  return db
    .prepare(
      `SELECT m.user_id, u.name, m.joined_at
       FROM classroom_members m JOIN users u ON u.id = m.user_id
       WHERE m.classroom_id = ? ORDER BY m.joined_at`
    )
    .all(classroomId) as { user_id: number; name: string; joined_at: string }[];
}

export function isClassroomMember(classroomId: number, userId: number): boolean {
  return !!db
    .prepare(
      "SELECT 1 FROM classroom_members WHERE classroom_id = ? AND user_id = ?"
    )
    .get(classroomId, userId);
}

export function assignCourse(classroomId: number, courseId: number) {
  db.prepare(
    "INSERT OR IGNORE INTO classroom_assignments (classroom_id, course_id) VALUES (?, ?)"
  ).run(classroomId, courseId);
}

export function unassignCourse(classroomId: number, courseId: number) {
  db.prepare(
    "DELETE FROM classroom_assignments WHERE classroom_id = ? AND course_id = ?"
  ).run(classroomId, courseId);
}

export function classroomAssignments(classroomId: number): (CourseRow &
  PlatformCourseCols)[] {
  return db
    .prepare(
      `SELECT c.* FROM courses c
       JOIN classroom_assignments a ON a.course_id = c.id
       WHERE a.classroom_id = ? ORDER BY a.assigned_at DESC`
    )
    .all(classroomId) as (CourseRow & PlatformCourseCols)[];
}

/** Is this course assigned to any classroom the user belongs to? */
export function hasAssignmentAccess(userId: number, courseId: number): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM classroom_assignments a
       JOIN classroom_members m ON m.classroom_id = a.classroom_id
       WHERE a.course_id = ? AND m.user_id = ?
       UNION
       SELECT 1 FROM classroom_assignments a2
       JOIN classrooms c2 ON c2.id = a2.classroom_id
       WHERE a2.course_id = ? AND c2.owner_id = ?`
    )
    .get(courseId, userId, courseId, userId);
}

/** Average quiz score (0-100) across a learner's completed lessons in a course. */
export function courseAverageScore(userId: number, courseId: number): number {
  const r = db
    .prepare(
      `SELECT AVG(p.score * 100.0 / p.total) AS pct
       FROM progress p
       JOIN lessons l ON l.id = p.lesson_id
       JOIN modules m ON m.id = l.module_id
       WHERE p.user_id = ? AND m.course_id = ? AND p.total > 0`
    )
    .get(userId, courseId) as { pct: number | null };
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

export function issueCertificate(
  id: string,
  userId: number,
  courseId: number,
  scorePct: number
): CertificateRow {
  db.prepare(
    "INSERT OR IGNORE INTO certificates (id, user_id, course_id, score_pct) VALUES (?, ?, ?, ?)"
  ).run(id, userId, courseId, scorePct);
  return db
    .prepare("SELECT * FROM certificates WHERE user_id = ? AND course_id = ?")
    .get(userId, courseId) as CertificateRow;
}

export function getCertificate(id: string):
  | (CertificateRow & { user_name: string; course_title: string })
  | undefined {
  return db
    .prepare(
      `SELECT ct.*, u.name AS user_name, c.title AS course_title
       FROM certificates ct
       JOIN users u ON u.id = ct.user_id
       JOIN courses c ON c.id = ct.course_id
       WHERE ct.id = ?`
    )
    .get(id) as
    | (CertificateRow & { user_name: string; course_title: string })
    | undefined;
}

export function listCertificates(userId: number): (CertificateRow & {
  course_title: string;
})[] {
  return db
    .prepare(
      `SELECT ct.*, c.title AS course_title FROM certificates ct
       JOIN courses c ON c.id = ct.course_id
       WHERE ct.user_id = ? ORDER BY ct.issued_at DESC`
    )
    .all(userId) as (CertificateRow & { course_title: string })[];
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

export function createTransaction(
  userId: number,
  txRef: string,
  product: string,
  amountCents: number,
  currency: string
) {
  db.prepare(
    "INSERT INTO transactions (user_id, tx_ref, product, amount_cents, currency) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, txRef, product, amountCents, currency);
}

export function getTransaction(txRef: string): TxRow | undefined {
  return db.prepare("SELECT * FROM transactions WHERE tx_ref = ?").get(txRef) as
    | TxRow
    | undefined;
}

export function markTransaction(
  txRef: string,
  status: "successful" | "failed",
  providerRef?: string
) {
  db.prepare(
    "UPDATE transactions SET status = ?, provider_ref = ? WHERE tx_ref = ?"
  ).run(status, providerRef ?? null, txRef);
}

export function platformCounts() {
  const users = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  const courses = (db.prepare("SELECT COUNT(*) AS n FROM courses").get() as { n: number }).n;
  const published = (
    db.prepare("SELECT COUNT(*) AS n FROM courses WHERE published = 1").get() as { n: number }
  ).n;
  const revenue = (
    db
      .prepare(
        "SELECT COALESCE(SUM(amount_cents),0) AS n FROM transactions WHERE status = 'successful'"
      )
      .get() as { n: number }
  ).n;
  return { users, courses, published, revenue_cents: revenue };
}
