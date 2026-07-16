import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { applyPendingMigrations, MIGRATIONS } from "../lib/migrations";

// Upgrade test: prove the migration runner turns a realistic *old* production
// database (the earliest Postgres schema, before the columns/tables later work
// layered on) into the current schema without losing data. It owns the scratch
// database (it resets `public`), so it is skipped unless TEST_DATABASE_URL is set:
//   TEST_DATABASE_URL=postgres://…scratch-branch… npm test
const TEST_DB = process.env.TEST_DATABASE_URL;

const OLD_SCHEMA_SQL = readFileSync(
  fileURLToPath(new URL("./fixtures/pre-ledger-schema.sql", import.meta.url)),
  "utf8"
);

// A distinctive stored timestamp so the email_verified_at backfill is verifiable.
const USER_CREATED_AT = "2026-01-02T03:04:05.000Z";

describe.skipIf(!TEST_DB)("upgrading a realistic pre-ledger database", () => {
  let raw: Pool;
  let courseRunId: string;

  beforeAll(async () => {
    raw = new Pool({ connectionString: TEST_DB });

    // Reset the scratch database to the old schema, then seed pre-migration rows.
    await raw.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await raw.query(OLD_SCHEMA_SQL);

    await raw.query(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES
         (1, 'legacy@example.com', 'Legacy Learner', 'hash', 'admin', $1),
         (2, 'member@example.com', 'Legacy Member', 'hash', 'user', $1)`,
      [USER_CREATED_AT]
    );
    await raw.query(
      `INSERT INTO courses (id, owner_id, title, source_filename, status, content_version)
       VALUES (1, 1, 'Legacy Course', 'legacy.pdf', 'ready', 2)`
    );
    await raw.query(
      `INSERT INTO modules (id, course_id, title, summary, position, status)
       VALUES (1, 1, 'Module A', 'first', 0, 'ready'),
              (2, 1, 'Module B', 'second', 1, 'ready')`
    );
    await raw.query(
      `INSERT INTO lessons (id, module_id, title, position, cards, generator_model, prompt_version)
       VALUES (1, 1, 'Lesson A1', 0, '[{"type":"concept","title":"Legacy","body":"Preserved"}]', 'legacy-model', 'legacy-prompt'),
              (2, 2, 'Lesson B1', 0, '[]', 'legacy-model', 'legacy-prompt')`
    );
    await raw.query(
      `INSERT INTO progress (user_id, lesson_id, score, total, xp_earned)
       VALUES (1, 1, 3, 4, 20)`
    );
    await raw.query("INSERT INTO enrollments (user_id, course_id) VALUES (1, 1)");
    await raw.query(
      `INSERT INTO concept_mastery (user_id, course_id, concept, correct, wrong, mastery)
       VALUES (1, 1, 'legacy concept', 2, 1, 0.6)`
    );
    await raw.query(
      `INSERT INTO classrooms (id, owner_id, name, code, created_at)
       VALUES (1, 1, 'Legacy Class', 'LEGACY1', $1)`,
      [USER_CREATED_AT]
    );
    await raw.query(
      `INSERT INTO classroom_members (classroom_id, user_id, joined_at)
       VALUES (1, 2, $1)`,
      [USER_CREATED_AT]
    );
    await raw.query(
      `INSERT INTO classroom_assignments (classroom_id, course_id, assigned_at)
       VALUES (1, 1, $1)`,
      [USER_CREATED_AT]
    );

    // Run the real migration path against the old database.
    const client: PoolClient = await raw.connect();
    try {
      const applied = await applyPendingMigrations(client);
      expect(applied).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
        13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
      ]);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await raw?.end();
  });

  it("records the baseline in the migration ledger", async () => {
    const rows = (
      await raw.query("SELECT id, name FROM schema_migrations ORDER BY id")
    ).rows;
    expect(rows).toEqual([
      { id: 1, name: "baseline_schema" },
      { id: 2, name: "privacy_lifecycle" },
      { id: 3, name: "spaces_tenancy" },
      { id: 4, name: "course_studio_foundation" },
      { id: 5, name: "phase2_lifecycle_hardening" },
      { id: 6, name: "institutional_evidence_foundation" },
      { id: 7, name: "institutional_policy_and_mfa" },
      { id: 8, name: "institutional_pilot_evidence" },
      { id: 9, name: "pilot_password_sign_in" },
      { id: 10, name: "versioned_course_appearance" },
      { id: 11, name: "studio_reversible_authoring" },
      { id: 12, name: "skill_passport_foundation" },
      { id: 13, name: "passport_access_history" },
      { id: 14, name: "passport_claim_corrections" },
      { id: 15, name: "open_badge_issuance" },
      { id: 16, name: "competency_frameworks" },
      { id: 17, name: "platform_integrations" },
      { id: 18, name: "lti_tool_foundation" },
      { id: 19, name: "public_launch_productization" },
      { id: 20, name: "portable_course_archives" },
      { id: 21, name: "portable_recipe_archives" },
      { id: 22, name: "learning_genome_foundation" },
      { id: 23, name: "multi_channel_offline_foundation" },
      { id: 24, name: "deep_summaries_foundation" },
      { id: 25, name: "summary_generation_recovery" },
    ]);
  });

  it("adds and backfills the generation-run columns", async () => {
    const course = (
      await raw.query(
        `SELECT generation_run_id, generation_attempts, generation_heartbeat
         FROM courses WHERE id = 1`
      )
    ).rows[0] as {
      generation_run_id: string;
      generation_attempts: number;
      generation_heartbeat: string | null;
    };
    // The ADD COLUMN default (md5 hex) gives each existing course a run id.
    expect(course.generation_run_id).toMatch(/^[0-9a-f]{32}$/);
    expect(course.generation_attempts).toBe(0);
    expect(course.generation_heartbeat).toBeNull();
    courseRunId = course.generation_run_id;

    const modules = (
      await raw.query(
        "SELECT generation_run_id, attempts, chapter_indexes FROM modules ORDER BY id"
      )
    ).rows as {
      generation_run_id: string;
      attempts: number;
      chapter_indexes: string | null;
    }[];
    expect(modules).toHaveLength(2);
    for (const m of modules) {
      // Backfilled from the parent course.
      expect(m.generation_run_id).toBe(courseRunId);
      expect(m.attempts).toBe(0);
      expect(m.chapter_indexes).toBeNull();
    }

    const lessons = (
      await raw.query("SELECT generation_run_id FROM lessons ORDER BY id")
    ).rows as { generation_run_id: string }[];
    expect(lessons).toHaveLength(2);
    // Backfilled course -> module -> lesson.
    for (const l of lessons) expect(l.generation_run_id).toBe(courseRunId);
  });

  it("adds and backfills users.email_verified_at from created_at", async () => {
    const user = (
      await raw.query(
        "SELECT created_at, email_verified_at FROM users WHERE id = 1"
      )
    ).rows[0] as { created_at: string; email_verified_at: string | null };
    expect(user.created_at).toBe(USER_CREATED_AT);
    expect(user.email_verified_at).toBe(USER_CREATED_AT);
  });

  it("creates the tables added after the old snapshot", async () => {
    const present = (
      await raw.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      )
    ).rows.map((r) => (r as { table_name: string }).table_name);
    const expected = [
      "account_tokens",
      "rate_limit_buckets",
      "operational_events",
      "learning_identities",
      "concepts",
      "question_versions",
      "practice_sessions",
      "answer_sessions",
      "learning_events",
      "lesson_completion_events",
      "consent_records",
      "privacy_actions",
      "spaces",
      "space_memberships",
      "space_teams",
      "space_team_members",
      "space_invitations",
      "space_courses",
      "space_assignments",
      "space_assignment_members",
      "space_audit_events",
      "legacy_classroom_spaces",
      "source_assets",
      "source_versions",
      "source_collections",
      "source_collection_versions",
      "source_collection_version_items",
      "recipes",
      "recipe_versions",
      "course_versions",
      "course_version_sources",
      "course_source_assets",
      "block_types",
      "course_blocks",
      "course_block_revisions",
      "summaries",
      "summary_sections",
      "course_version_reviews",
      "course_version_comments",
      "course_generation_jobs",
      "institutional_pilots",
      "institutional_pilot_plan_versions",
      "institutional_pilot_observations",
      "institutional_pilot_gate_attestations",
      "institutional_pilot_status_events",
      "learning_analysis_versions",
      "question_quality_snapshots",
      "question_review_decisions",
      "concept_mapping_proposals",
      "concept_mapping_events",
      "prerequisite_candidates",
      "learning_feature_flags",
      "course_placement_preferences",
      "explanation_experiment_versions",
      "channel_identity_links",
      "channel_consent_events",
      "channel_inbound_events",
      "channel_delivery_events",
      "channel_resume_points",
      "channel_resume_links",
    ];
    for (const table of expected) expect(present).toContain(table);
  });

  it("backfills personal and classroom Spaces without losing relationships", async () => {
    const personal = (
      await raw.query(
        `SELECT s.id, s.type, m.role, m.status
         FROM spaces s
         JOIN space_memberships m ON m.space_id = s.id
         WHERE s.personal_owner_user_id = 1 AND m.user_id = 1`
      )
    ).rows[0];
    expect(personal).toMatchObject({
      type: "personal",
      role: "owner",
      status: "active",
    });

    const course = (
      await raw.query("SELECT owning_space_id FROM courses WHERE id = 1")
    ).rows[0] as { owning_space_id: string };
    expect(course.owning_space_id).toBe(personal.id);

    const migratedClass = (
      await raw.query(
        `SELECT s.id, s.type, s.preset, s.join_code_enabled,
          (SELECT role FROM space_memberships WHERE space_id = s.id AND user_id = 1) AS owner_role,
          (SELECT role FROM space_memberships WHERE space_id = s.id AND user_id = 2) AS member_role,
          (SELECT COUNT(*)::int FROM space_courses WHERE space_id = s.id AND course_id = 1) AS courses,
          (SELECT COUNT(*)::int FROM space_assignments WHERE space_id = s.id AND course_id = 1) AS assignments,
          (SELECT COUNT(*)::int FROM space_assignment_members sam
             JOIN space_assignments sa ON sa.id = sam.assignment_id
            WHERE sa.space_id = s.id) AS assignees
         FROM legacy_classroom_spaces legacy
         JOIN spaces s ON s.id = legacy.space_id
         WHERE legacy.classroom_id = 1`
      )
    ).rows[0];
    expect(migratedClass).toEqual({
      id: expect.any(String),
      type: "private",
      preset: "class",
      join_code_enabled: 1,
      owner_role: "owner",
      member_role: "learner",
      courses: 1,
      assignments: 1,
      assignees: 1,
    });
  });

  it("backfills the service consent and active lifecycle state", async () => {
    const user = (
      await raw.query(
        "SELECT account_status, deletion_scheduled_at, erased_at FROM users WHERE id = 1"
      )
    ).rows[0];
    expect(user).toEqual({
      account_status: "active",
      deletion_scheduled_at: null,
      erased_at: null,
    });
    const consent = (
      await raw.query(
        "SELECT purpose, version, decision, source, recorded_at FROM consent_records WHERE user_id = 1"
      )
    ).rows[0];
    expect(consent).toEqual({
      purpose: "service",
      version: "service-v1",
      decision: "granted",
      source: "legacy_migration",
      recorded_at: USER_CREATED_AT,
    });
  });

  it("preserves every pre-existing row and value", async () => {
    const course = (
      await raw.query("SELECT title, content_version FROM courses WHERE id = 1")
    ).rows[0] as { title: string; content_version: number };
    expect(course).toEqual({ title: "Legacy Course", content_version: 2 });

    const counts = (
      await raw.query(
        `SELECT
           (SELECT count(*)::int FROM modules) AS modules,
           (SELECT count(*)::int FROM lessons) AS lessons,
           (SELECT count(*)::int FROM enrollments) AS enrollments`
      )
    ).rows[0] as { modules: number; lessons: number; enrollments: number };
    expect(counts).toEqual({ modules: 2, lessons: 2, enrollments: 1 });

    const progress = (
      await raw.query(
        "SELECT score, total, xp_earned FROM progress WHERE user_id = 1 AND lesson_id = 1"
      )
    ).rows[0] as { score: number; total: number; xp_earned: number };
    expect(progress).toEqual({ score: 3, total: 4, xp_earned: 20 });

    const mastery = (
      await raw.query(
        "SELECT mastery FROM concept_mastery WHERE user_id = 1 AND course_id = 1"
      )
    ).rows[0] as { mastery: number };
    expect(mastery.mastery).toBeCloseTo(0.6);
  });

  it("backfills versioned sources, course snapshots and block lineage", async () => {
    const result = (
      await raw.query(
        `SELECT sa.owning_space_id, sa.kind, sv.version AS source_version,
                scv.version AS collection_version, cv.version_number,
                cv.lifecycle_status, c.current_draft_version_id,
                c.published_version_id, cv.content_json
         FROM courses c
         JOIN source_assets sa ON sa.created_by_user_id = c.owner_id
         JOIN source_versions sv ON sv.source_id = sa.id
         JOIN source_collection_version_items item ON item.source_version_id = sv.id
         JOIN source_collection_versions scv ON scv.id = item.collection_version_id
         JOIN course_versions cv
           ON cv.course_id = c.id AND cv.source_collection_version_id = scv.id
         WHERE c.id = 1`
      )
    ).rows[0] as Record<string, unknown>;
    expect(result).toMatchObject({
      owning_space_id: expect.any(String),
      kind: "pdf",
      source_version: 1,
      collection_version: 1,
      version_number: 2,
      lifecycle_status: "draft",
      current_draft_version_id: expect.any(String),
      published_version_id: null,
    });
    expect(String(result.content_json)).toContain("Lesson A1");
    expect(String(result.content_json)).toContain("Preserved");

    const block = (
      await raw.query(
        `SELECT cb.lineage_id, cb.block_type, cb.current_revision,
                revision.content_json, revision.edit_origin,
                revision.accessibility_json
         FROM course_blocks cb
         JOIN course_block_revisions revision
           ON revision.block_id = cb.id AND revision.revision = cb.current_revision`
      )
    ).rows[0];
    expect(block).toMatchObject({
      lineage_id: "course:1:lesson:1:card:0",
      block_type: "explanation",
      current_revision: 1,
      edit_origin: "generated",
      accessibility_json: '{"status":"legacy_needs_review"}',
    });
    expect(block.content_json).toContain("Preserved");
  });

  it("protects source history and published course content from mutation", async () => {
    await expect(
      raw.query("UPDATE source_versions SET content_hash = 'tampered'")
    ).rejects.toThrow(/append-only/);

    const client = await raw.connect();
    try {
      await client.query("BEGIN");
      const version = (
        await client.query(
          `UPDATE course_versions SET lifecycle_status = 'published', published_at = $1
           WHERE course_id = 1 RETURNING id`,
          [new Date().toISOString()]
        )
      ).rows[0] as { id: string };
      await expect(
        client.query("UPDATE course_versions SET title = 'tampered' WHERE id = $1", [version.id])
      ).rejects.toThrow(/immutable/);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("installs the append-only ledger guards", async () => {
    const triggers = (
      await raw.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")
    ).rows.map((r) => (r as { tgname: string }).tgname);
    expect(triggers).toEqual(
      expect.arrayContaining([
        "learning_events_no_update",
        "learning_events_no_delete",
        "question_versions_no_content_update",
        "question_versions_no_delete",
        "question_quality_snapshots_no_update",
        "question_review_decisions_no_update",
        "concept_mapping_events_no_update",
        "channel_consent_events_no_write",
        "channel_delivery_events_no_write",
      ])
    );
  });

  it("is idempotent: a second run applies and changes nothing", async () => {
    const client = await raw.connect();
    try {
      expect(await applyPendingMigrations(client)).toEqual([]);
    } finally {
      client.release();
    }
    const count = (
      await raw.query("SELECT count(*)::int AS n FROM schema_migrations")
    ).rows[0] as { n: number };
    expect(count.n).toBe(MIGRATIONS.length);
  });
});
