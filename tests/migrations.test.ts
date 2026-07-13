import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertMigrationsWellFormed,
  MIGRATIONS,
  type Migration,
} from "../lib/migrations";

describe("migration list", () => {
  it("is well-formed: ids are 1..N, strictly increasing, named, non-empty", () => {
    expect(() => assertMigrationsWellFormed()).not.toThrow();
    MIGRATIONS.forEach((migration, index) => {
      expect(migration.id).toBe(index + 1);
      expect(migration.name.trim().length).toBeGreaterThan(0);
      expect(migration.sql.trim().length).toBeGreaterThan(0);
    });
  });

  it("starts from the baseline schema", () => {
    expect(MIGRATIONS[0]).toMatchObject({ id: 1, name: "baseline_schema" });
    // The baseline must still stand up the core tables the app depends on.
    expect(MIGRATIONS[0].sql).toContain("CREATE TABLE IF NOT EXISTS courses");
    expect(MIGRATIONS[0].sql).toContain("CREATE TABLE IF NOT EXISTS learning_events");
  });

  it("adds versioned course appearance without rewriting shipped migrations", () => {
    const migration = MIGRATIONS.find((item) => item.name === "versioned_course_appearance");
    expect(migration).toMatchObject({ id: 10 });
    expect(migration?.sql).toContain("ALTER TABLE courses");
    expect(migration?.sql).toContain("ALTER TABLE course_versions");
    expect(migration?.sql).toContain("appearance_json");
  });

  it("rejects a gap in migration ids", () => {
    const gapped: Migration[] = [
      { id: 1, name: "baseline", sql: "SELECT 1" },
      { id: 3, name: "skips_two", sql: "SELECT 1" },
    ];
    expect(() => assertMigrationsWellFormed(gapped)).toThrow(/no gaps/);
  });

  it("rejects a duplicate migration id", () => {
    const duplicated: Migration[] = [
      { id: 1, name: "baseline", sql: "SELECT 1" },
      { id: 1, name: "again", sql: "SELECT 1" },
    ];
    expect(() => assertMigrationsWellFormed(duplicated)).toThrow();
  });

  it("rejects an empty name or empty SQL", () => {
    expect(() =>
      assertMigrationsWellFormed([{ id: 1, name: "  ", sql: "SELECT 1" }])
    ).toThrow(/empty name/);
    expect(() =>
      assertMigrationsWellFormed([{ id: 1, name: "baseline", sql: "  " }])
    ).toThrow(/empty SQL/);
  });
});

// Database integration: runs only against a dedicated scratch Postgres set via
// TEST_DATABASE_URL, skipped by default so it never touches the real database.
//   TEST_DATABASE_URL=postgres://... npm test
const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("migration runner", () => {
  let pg: typeof import("../lib/pg");

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    await pg.ready();
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("records every migration exactly once", async () => {
    const rows = (await pg.many(
      "SELECT id, name, applied_at FROM schema_migrations ORDER BY id"
    )) as { id: number; name: string; applied_at: string }[];

    // The primary key on id makes duplicate rows impossible, so an exact-length
    // match plus id coverage proves each migration applied once and only once.
    expect(rows).toHaveLength(MIGRATIONS.length);
    const recorded = rows.map((row) => Number(row.id));
    for (const migration of MIGRATIONS) {
      expect(recorded).toContain(migration.id);
    }
    expect(rows.every((row) => /^\d{4}-\d{2}-\d{2}T/.test(row.applied_at))).toBe(true);
  });

  it("actually applied the baseline (core tables exist)", async () => {
    const present = (await pg.one(
      `SELECT
         to_regclass('public.courses') IS NOT NULL AS courses,
         to_regclass('public.learning_events') IS NOT NULL AS events`
    )) as { courses: boolean; events: boolean };
    expect(present).toEqual({ courses: true, events: true });
  });

  it("releases the transaction-scoped schema lock after initialization", async () => {
    const row = (await pg.one(
      `SELECT COUNT(*)::int AS count FROM pg_locks
       WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted`
    )) as { count: number };
    expect(row.count).toBe(0);
  });
});
