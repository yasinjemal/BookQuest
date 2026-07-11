import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { CourseRow, CourseStatus, LessonRow, ModuleRow } from "./schemas";

const DATA_DIR = path.join(process.cwd(), "data");
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

/** Owner or enrolled → full access. Published → auto-enroll on first use. */
export function canAccessCourse(userId: number, courseId: number): boolean {
  const course = getCourse(courseId);
  if (!course) return false;
  if (course.owner_id === userId) return true;
  if (isEnrolled(userId, courseId)) return true;
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
  cardsJson: string
): number {
  const r = db
    .prepare(
      "INSERT INTO lessons (module_id, title, position, cards) VALUES (?, ?, ?, ?)"
    )
    .run(moduleId, title, position, cardsJson);
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
) {
  db.prepare(
    `INSERT INTO progress (user_id, lesson_id, score, total, xp_earned, completed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       score = MAX(score, excluded.score),
       total = excluded.total,
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
  ).run(xp, streak, today, userId);
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
): { id: number; lesson_id: number; card_index: number }[] {
  return db
    .prepare(
      "SELECT id, lesson_id, card_index FROM review_items WHERE user_id = ? AND next_due <= datetime('now') ORDER BY next_due LIMIT ?"
    )
    .all(userId, limit) as { id: number; lesson_id: number; card_index: number }[];
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
