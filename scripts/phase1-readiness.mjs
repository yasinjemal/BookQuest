// Read-only production gate for the Phase 1 Spaces migration.
// Usage: DATABASE_URL=<production pooled URL> node scripts/phase1-readiness.mjs
import { readFileSync } from "fs";
import pg from "pg";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // No local environment file; rely on the process environment.
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 15_000,
});
const client = await pool.connect();

const scalar = async (sql, params = []) => {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.count ?? 0);
};

try {
  await client.query("BEGIN READ ONLY");
  const migration = (
    await client.query(
      "SELECT name, applied_at FROM schema_migrations WHERE id = 3"
    )
  ).rows[0];
  if (!migration || migration.name !== "spaces_tenancy") {
    throw new Error("Migration 3 (spaces_tenancy) is not applied");
  }

  const requiredTables = [
    "spaces",
    "space_memberships",
    "space_invitations",
    "space_teams",
    "space_team_members",
    "space_courses",
    "space_assignments",
    "space_assignment_members",
    "space_audit_events",
    "legacy_classroom_spaces",
  ];
  const tableRows = (
    await client.query(
      `SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
       FROM unnest($1::text[]) AS required(name)`,
      [requiredTables]
    )
  ).rows;
  const missingTables = tableRows.filter((row) => !row.present).map((row) => row.name);

  const metrics = {
    users: await scalar("SELECT COUNT(*) AS count FROM users"),
    spaces: await scalar("SELECT COUNT(*) AS count FROM spaces"),
    personalSpaces: await scalar("SELECT COUNT(*) AS count FROM spaces WHERE type = 'personal'"),
    classrooms: await scalar("SELECT COUNT(*) AS count FROM classrooms"),
    courses: await scalar("SELECT COUNT(*) AS count FROM courses"),
    postMigrationAnswers: await scalar(
      `SELECT COUNT(*) AS count FROM learning_events
       WHERE recorded_at::timestamptz >= $1::timestamptz`,
      [migration.applied_at]
    ),
    postMigrationCompletions: await scalar(
      `SELECT COUNT(*) AS count FROM lesson_completion_events
       WHERE completed_at::timestamptz >= $1::timestamptz`,
      [migration.applied_at]
    ),
  };

  const failures = {
    missingTables: missingTables.length,
    usersWithoutPersonalSpace: await scalar(
      `SELECT COUNT(*) AS count FROM users u
       LEFT JOIN spaces s ON s.personal_owner_user_id = u.id AND s.type = 'personal'
       LEFT JOIN space_memberships m
         ON m.space_id = s.id AND m.user_id = u.id
        AND m.status = 'active' AND m.role = 'owner'
       WHERE s.id IS NULL OR m.id IS NULL`
    ),
    coursesWithoutOwnerSpace: await scalar(
      `SELECT COUNT(*) AS count FROM courses c
       LEFT JOIN spaces s ON s.id = c.owning_space_id
       WHERE c.owning_space_id IS NULL OR s.id IS NULL`
    ),
    classroomsWithoutClassSpace: await scalar(
      `SELECT COUNT(*) AS count FROM classrooms c
       LEFT JOIN legacy_classroom_spaces legacy ON legacy.classroom_id = c.id
       LEFT JOIN spaces s ON s.id = legacy.space_id AND s.preset = 'class'
       WHERE s.id IS NULL`
    ),
    classroomOwnersWithoutMembership: await scalar(
      `SELECT COUNT(*) AS count FROM classrooms c
       JOIN legacy_classroom_spaces legacy ON legacy.classroom_id = c.id
       LEFT JOIN space_memberships m
         ON m.space_id = legacy.space_id AND m.user_id = c.owner_id
        AND m.status = 'active' AND m.role = 'owner'
       WHERE m.id IS NULL`
    ),
    classroomMembersWithoutMembership: await scalar(
      `SELECT COUNT(*) AS count FROM classroom_members cm
       JOIN legacy_classroom_spaces legacy ON legacy.classroom_id = cm.classroom_id
       LEFT JOIN space_memberships m
         ON m.space_id = legacy.space_id AND m.user_id = cm.user_id
        AND m.status = 'active'
       WHERE m.id IS NULL`
    ),
    classroomCoursesWithoutSpaceLink: await scalar(
      `SELECT COUNT(*) AS count FROM classroom_assignments ca
       JOIN legacy_classroom_spaces legacy ON legacy.classroom_id = ca.classroom_id
       LEFT JOIN space_courses sc
         ON sc.space_id = legacy.space_id AND sc.course_id = ca.course_id
       WHERE sc.course_id IS NULL`
    ),
    activeAssignmentsWithoutAudience: await scalar(
      `SELECT COUNT(*) AS count FROM (
         SELECT a.id FROM space_assignments a
         LEFT JOIN space_assignment_members am ON am.assignment_id = a.id
         WHERE a.status = 'active'
         GROUP BY a.id HAVING COUNT(am.membership_id) = 0
       ) empty_assignments`
    ),
    postMigrationAnswersWithoutContext: await scalar(
      `SELECT COUNT(*) AS count FROM learning_events
       WHERE recorded_at::timestamptz >= $1::timestamptz
         AND (space_id IS NULL OR membership_id IS NULL OR space_policy_version IS NULL)`,
      [migration.applied_at]
    ),
    postMigrationCompletionsWithoutContext: await scalar(
      `SELECT COUNT(*) AS count FROM lesson_completion_events
       WHERE completed_at::timestamptz >= $1::timestamptz
         AND (space_id IS NULL OR membership_id IS NULL OR space_policy_version IS NULL)`,
      [migration.applied_at]
    ),
  };

  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    migration: { id: 3, name: migration.name, appliedAt: migration.applied_at },
    requiredTables,
    missingTables,
    metrics,
    failures,
  };
  report.healthy = Object.values(failures).every((count) => count === 0);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.healthy ? 0 : 1;
  await client.query("ROLLBACK");
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Connection cleanup follows.
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}
