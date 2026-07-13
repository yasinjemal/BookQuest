// Read-only production gate for the Phase 3 institutional evidence migrations.
// Usage: DATABASE_URL=<production pooled URL> node scripts/phase3-readiness.mjs
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 15_000,
});
const client = await pool.connect();
const scalar = async (sql, params = []) =>
  Number((await client.query(sql, params)).rows[0]?.count ?? 0);

try {
  await client.query("BEGIN READ ONLY");
  const migration = (
    await client.query("SELECT name, applied_at FROM schema_migrations WHERE id = 6")
  ).rows[0];
  if (!migration || migration.name !== "institutional_evidence_foundation") {
    throw new Error("Migration 6 (institutional_evidence_foundation) is not applied");
  }
  const securityMigration = (
    await client.query("SELECT name, applied_at FROM schema_migrations WHERE id = 7")
  ).rows[0];
  if (!securityMigration || securityMigration.name !== "institutional_policy_and_mfa") {
    throw new Error("Migration 7 (institutional_policy_and_mfa) is not applied");
  }
  const pilotMigration = (
    await client.query("SELECT name, applied_at FROM schema_migrations WHERE id = 8")
  ).rows[0];
  if (!pilotMigration || pilotMigration.name !== "institutional_pilot_evidence") {
    throw new Error("Migration 8 (institutional_pilot_evidence) is not applied");
  }
  const signInMigration = (
    await client.query("SELECT name, applied_at FROM schema_migrations WHERE id = 9")
  ).rows[0];
  if (!signInMigration || signInMigration.name !== "pilot_password_sign_in") {
    throw new Error("Migration 9 (pilot_password_sign_in) is not applied");
  }

  const requiredTables = [
    "completion_rule_versions",
    "assignment_versions",
    "assignment_targets",
    "assignment_audience_events",
    "assignment_participations",
    "assignment_participation_events",
    "assignment_delivery_events",
    "attestation_events",
    "assignment_lesson_completion_events",
    "practical_task_submissions",
    "practical_task_reviews",
    "assignment_completion_events",
    "credential_records",
    "credential_status_events",
    "audit_packs",
    "space_policy_versions",
    "space_legal_holds",
    "user_mfa_methods",
    "user_mfa_recovery_codes",
    "user_mfa_challenges",
    "space_identity_providers",
    "institutional_pilots",
    "institutional_pilot_plan_versions",
    "institutional_pilot_observations",
    "institutional_pilot_gate_attestations",
    "institutional_pilot_status_events",
  ];
  const tableRows = (
    await client.query(
      `SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
       FROM unnest($1::text[]) AS required(name)`,
      [requiredTables],
    )
  ).rows;
  const missingTables = tableRows.filter((row) => !row.present).map((row) => row.name);

  const requiredTriggers = [
    "completion_rule_versions_no_delete",
    "completion_rule_versions_locked",
    "assignment_versions_locked",
    "assignment_audience_events_no_write",
    "assignment_participation_events_no_write",
    "attestation_events_no_write",
    "assignment_lesson_completion_events_no_write",
    "practical_task_submissions_no_write",
    "practical_task_reviews_no_write",
    "assignment_completion_events_no_write",
    "credential_status_events_no_write",
    "audit_packs_no_write",
    "space_policy_versions_locked",
    "institutional_pilot_plan_versions_no_write",
    "institutional_pilot_observations_no_write",
    "institutional_pilot_gate_attestations_no_write",
    "institutional_pilot_status_events_no_write",
    "institutional_pilots_lifecycle_guard",
  ];
  const presentTriggers = (
    await client.query(
      "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])",
      [requiredTriggers],
    )
  ).rows.map((row) => row.tgname);
  const missingTriggers = requiredTriggers.filter((name) => !presentTriggers.includes(name));

  const metrics = {
    organizationSpaces: await scalar("SELECT COUNT(*) AS count FROM spaces WHERE type = 'organization'"),
    policyVersions: await scalar("SELECT COUNT(*) AS count FROM space_policy_versions"),
    assignments: await scalar("SELECT COUNT(*) AS count FROM space_assignments"),
    assignmentVersions: await scalar("SELECT COUNT(*) AS count FROM assignment_versions"),
    participations: await scalar("SELECT COUNT(*) AS count FROM assignment_participations"),
    completionEvents: await scalar("SELECT COUNT(*) AS count FROM assignment_completion_events"),
    credentials: await scalar("SELECT COUNT(*) AS count FROM credential_records"),
    auditPacks: await scalar("SELECT COUNT(*) AS count FROM audit_packs"),
    activeMfaMethods: await scalar("SELECT COUNT(*) AS count FROM user_mfa_methods WHERE status = 'active'"),
    activeIdentityProviders: await scalar("SELECT COUNT(*) AS count FROM space_identity_providers WHERE status = 'active'"),
    activePilots: await scalar("SELECT COUNT(*) AS count FROM institutional_pilots WHERE status = 'active'"),
    completedPilots: await scalar("SELECT COUNT(*) AS count FROM institutional_pilots WHERE status = 'completed'"),
    pilotObservations: await scalar("SELECT COUNT(*) AS count FROM institutional_pilot_observations"),
    pilotGateAttestations: await scalar("SELECT COUNT(*) AS count FROM institutional_pilot_gate_attestations"),
  };

  const failures = {
    organizationSpacesWithoutPolicy: await scalar(
      `SELECT COUNT(*) AS count FROM spaces space
       LEFT JOIN space_policy_versions policy ON policy.id = space.current_policy_version_id
       WHERE space.type = 'organization'
         AND (policy.id IS NULL OR policy.space_id <> space.id OR policy.status <> 'published')`,
    ),
    assignmentsWithoutCurrentVersion: await scalar(
      `SELECT COUNT(*) AS count FROM space_assignments assignment
       LEFT JOIN assignment_versions version ON version.id = assignment.current_version_id
       WHERE version.id IS NULL OR version.assignment_id <> assignment.id`,
    ),
    assignmentRuleOrCourseMismatch: await scalar(
      `SELECT COUNT(*) AS count FROM assignment_versions version
       JOIN space_assignments assignment ON assignment.id = version.assignment_id
       JOIN completion_rule_versions rule ON rule.id = version.completion_rule_version_id
       WHERE rule.space_id <> assignment.space_id
          OR rule.course_id <> assignment.course_id`,
    ),
    crossSpaceAssignmentTargets: await scalar(
      `SELECT COUNT(*) AS count FROM assignment_targets target
       JOIN assignment_versions version ON version.id = target.assignment_version_id
       JOIN space_assignments assignment ON assignment.id = version.assignment_id
       LEFT JOIN space_teams team ON team.id = target.team_id
       LEFT JOIN space_memberships membership ON membership.id = target.membership_id
       WHERE (target.target_type = 'team' AND team.space_id <> assignment.space_id)
          OR (target.target_type = 'membership' AND membership.space_id <> assignment.space_id)`,
    ),
    crossSpaceParticipations: await scalar(
      `SELECT COUNT(*) AS count FROM assignment_participations participation
       JOIN assignment_versions version ON version.id = participation.assignment_version_id
       JOIN space_assignments assignment ON assignment.id = version.assignment_id
       JOIN space_memberships membership ON membership.id = participation.membership_id
       WHERE membership.space_id <> assignment.space_id`,
    ),
    completionBindingMismatch: await scalar(
      `SELECT COUNT(*) AS count FROM assignment_completion_events completion
       JOIN assignment_participations participation ON participation.id = completion.participation_id
       JOIN assignment_versions version ON version.id = completion.assignment_version_id
       WHERE completion.assignment_version_id <> participation.assignment_version_id
          OR completion.completion_rule_version_id <> version.completion_rule_version_id`,
    ),
    credentialBindingMismatch: await scalar(
      `SELECT COUNT(*) AS count FROM credential_records credential
       LEFT JOIN assignment_participations participation ON participation.id = credential.participation_id
       LEFT JOIN assignment_completion_events completion ON completion.id = credential.completion_event_id
       WHERE credential.assignment_version_id IS NOT NULL
         AND (participation.id IS NULL
           OR completion.id IS NULL
           OR participation.assignment_version_id <> credential.assignment_version_id
           OR completion.assignment_version_id <> credential.assignment_version_id
           OR completion.participation_id <> credential.participation_id
           OR completion.completion_rule_version_id <> credential.completion_rule_version_id
           OR completion.evidence_hash <> credential.evidence_hash)`,
    ),
    activeExpiredCredentials: await scalar(
      `SELECT COUNT(*) AS count FROM credential_records
       WHERE status = 'active' AND expires_at IS NOT NULL
         AND expires_at::timestamptz <= CURRENT_TIMESTAMP`,
    ),
    pilotsWithoutCurrentPlan: await scalar(
      `SELECT COUNT(*) AS count FROM institutional_pilots pilot
       LEFT JOIN institutional_pilot_plan_versions plan ON plan.id=pilot.current_plan_version_id
       WHERE plan.id IS NULL OR plan.pilot_id<>pilot.id`,
    ),
    completedPilotsWithoutStatusEvent: await scalar(
      `SELECT COUNT(*) AS count FROM institutional_pilots pilot
       WHERE pilot.status='completed' AND NOT EXISTS (
         SELECT 1 FROM institutional_pilot_status_events event
         WHERE event.pilot_id=pilot.id AND event.status='completed'
       )`,
    ),
  };

  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    migration: { id: 6, name: migration.name, appliedAt: migration.applied_at },
    securityMigration: {
      id: 7,
      name: securityMigration.name,
      appliedAt: securityMigration.applied_at,
    },
    pilotMigration: {
      id: 8,
      name: pilotMigration.name,
      appliedAt: pilotMigration.applied_at,
    },
    signInMigration: {
      id: 9,
      name: signInMigration.name,
      appliedAt: signInMigration.applied_at,
    },
    requiredTables,
    missingTables,
    requiredTriggers,
    missingTriggers,
    metrics,
    failures,
  };
  report.healthy =
    missingTables.length === 0 &&
    missingTriggers.length === 0 &&
    Object.values(failures).every((count) => count === 0);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.healthy ? 0 : 1;
  await client.query("ROLLBACK");
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Cleanup follows.
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}
