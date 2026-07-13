// Read-only production gate for the Phase 2 Course Studio migration.
// Usage: DATABASE_URL=<production pooled URL> node scripts/phase2-readiness.mjs
import { readFileSync } from "fs";
import pg from "pg";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // Rely on the process environment.
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 15_000 });
const client = await pool.connect();
const scalar = async (sql, params = []) => Number((await client.query(sql, params)).rows[0]?.count ?? 0);

try {
  await client.query("BEGIN READ ONLY");
  const migration = (await client.query("SELECT name, applied_at FROM schema_migrations WHERE id = 4")).rows[0];
  if (!migration || migration.name !== "course_studio_foundation") {
    throw new Error("Migration 4 (course_studio_foundation) is not applied");
  }
  const hardening = (await client.query("SELECT name, applied_at FROM schema_migrations WHERE id = 5")).rows[0];
  if (!hardening || hardening.name !== "phase2_lifecycle_hardening") {
    throw new Error("Migration 5 (phase2_lifecycle_hardening) is not applied");
  }
  const requiredTables = [
    "recipes", "recipe_versions", "source_assets", "source_versions",
    "source_collections", "source_collection_versions", "course_versions",
    "course_version_sources", "course_blocks", "course_block_revisions",
    "course_version_reviews", "course_version_comments", "course_generation_jobs",
  ];
  const tableRows = (await client.query(
    `SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
     FROM unnest($1::text[]) AS required(name)`, [requiredTables]
  )).rows;
  const missingTables = tableRows.filter((row) => !row.present).map((row) => row.name);
  const requiredTriggers = [
    "source_versions_no_update", "course_block_revisions_no_update",
    "course_version_reviews_no_update", "course_versions_locked_lifecycle",
    "course_blocks_version_guard", "course_block_revisions_version_guard",
  ];
  const presentTriggers = (await client.query(
    "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])",
    [requiredTriggers]
  )).rows.map((row) => row.tgname);
  const missingTriggers = requiredTriggers.filter((name) => !presentTriggers.includes(name));

  const metrics = {
    courses: await scalar("SELECT COUNT(*) AS count FROM courses"),
    courseVersions: await scalar("SELECT COUNT(*) AS count FROM course_versions"),
    sources: await scalar("SELECT COUNT(*) AS count FROM source_assets"),
    sourceVersions: await scalar("SELECT COUNT(*) AS count FROM source_versions"),
    blocks: await scalar("SELECT COUNT(*) AS count FROM course_blocks"),
    recipes: await scalar("SELECT COUNT(*) AS count FROM recipes"),
    publishedVersions: await scalar("SELECT COUNT(*) AS count FROM course_versions WHERE lifecycle_status = 'published'"),
    postMigrationEvidence: await scalar(
      "SELECT COUNT(*) AS count FROM learning_events WHERE recorded_at::timestamptz >= $1::timestamptz",
      [migration.applied_at]
    ),
  };
  const failures = {
    missingTables: missingTables.length,
    missingTriggers: missingTriggers.length,
    lifecycleGuardNotHardened: await scalar(
      `SELECT CASE WHEN
         position('OLD.lifecycle_status = ''published''' in pg_get_functiondef('phase2_version_lifecycle_guard()'::regprocedure)) > 0
         AND position('NEW.lifecycle_status = ''superseded''' in pg_get_functiondef('phase2_version_lifecycle_guard()'::regprocedure)) > 0
       THEN 0 ELSE 1 END AS count`
    ),
    sourcesWithoutSpace: await scalar(
      "SELECT COUNT(*) AS count FROM source_assets source LEFT JOIN spaces space ON space.id = source.owning_space_id WHERE space.id IS NULL"
    ),
    sourcesWithoutCurrentVersion: await scalar(
      `SELECT COUNT(*) AS count FROM source_assets source
       WHERE source.current_version > 0 AND NOT EXISTS (
         SELECT 1 FROM source_versions version
         WHERE version.source_id = source.id AND version.version = source.current_version)`
    ),
    coursesWithoutWorkingVersion: await scalar(
      `SELECT COUNT(*) AS count FROM courses
       WHERE authoring_status IN ('draft','review','approved') AND current_draft_version_id IS NULL`
    ),
    publishedCoursesWithoutVersion: await scalar(
      "SELECT COUNT(*) AS count FROM courses WHERE authoring_status = 'published' AND published_version_id IS NULL"
    ),
    coursePointerMismatch: await scalar(
      `SELECT COUNT(*) AS count FROM courses course
       LEFT JOIN course_versions draft ON draft.id = course.current_draft_version_id
       LEFT JOIN course_versions published ON published.id = course.published_version_id
       WHERE (draft.id IS NOT NULL AND draft.course_id <> course.id)
          OR (published.id IS NOT NULL AND published.course_id <> course.id)`
    ),
    publishedVersionMismatch: await scalar(
      `SELECT COUNT(*) AS count FROM courses course
       JOIN course_versions version ON version.id = course.published_version_id
       WHERE version.lifecycle_status <> 'published'
          OR version.version_number <> course.content_version`
    ),
    crossSpaceRecipeLinks: await scalar(
      `SELECT COUNT(*) AS count FROM course_versions version
       JOIN courses course ON course.id = version.course_id
       JOIN recipe_versions recipe_version ON recipe_version.id = version.recipe_version_id
       JOIN recipes recipe ON recipe.id = recipe_version.recipe_id
       WHERE recipe.owning_space_id <> course.owning_space_id`
    ),
    crossSpaceSourceLinks: await scalar(
      `SELECT COUNT(*) AS count FROM course_version_sources link
       JOIN course_versions version ON version.id = link.course_version_id
       JOIN courses course ON course.id = version.course_id
       JOIN source_versions source_version ON source_version.id = link.source_version_id
       JOIN source_assets source ON source.id = source_version.source_id
       WHERE source.owning_space_id <> course.owning_space_id`
    ),
    blocksWithoutCurrentRevision: await scalar(
      `SELECT COUNT(*) AS count FROM course_blocks block
       LEFT JOIN course_block_revisions revision
         ON revision.block_id = block.id AND revision.revision = block.current_revision
       WHERE revision.id IS NULL`
    ),
    publishedCoursesWithoutLearnerProjection: await scalar(
      `SELECT COUNT(*) AS count FROM courses course
       WHERE course.published = 1 AND NOT EXISTS (
         SELECT 1 FROM modules module
         WHERE module.course_id = course.id AND module.content_version = course.content_version)`
    ),
    postMigrationEvidenceVersionMismatch: await scalar(
      `SELECT COUNT(*) AS count FROM learning_events event
       JOIN question_versions question ON question.id = event.question_version_id
       WHERE event.recorded_at::timestamptz >= $1::timestamptz
         AND (event.course_id <> question.course_id OR event.course_version <> question.course_version)`,
      [migration.applied_at]
    ),
  };
  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    migration: { id: 4, name: migration.name, appliedAt: migration.applied_at },
    hardeningMigration: { id: 5, name: hardening.name, appliedAt: hardening.applied_at },
    requiredTables,
    missingTables,
    requiredTriggers,
    missingTriggers,
    metrics,
    failures,
  };
  report.healthy = Object.values(failures).every((count) => count === 0);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.healthy ? 0 : 1;
  await client.query("ROLLBACK");
} catch (error) {
  try { await client.query("ROLLBACK"); } catch { /* cleanup follows */ }
  throw error;
} finally {
  client.release();
  await pool.end();
}
