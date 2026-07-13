import crypto from "crypto";
import { pool, tx, type Queryable } from "./pg";
import { getLearnerKey } from "./db";
import { authorizeStoredMembership } from "./spaces";
import { sendTransactionalEmail, type TransactionalEmailInput } from "./email";

const nowIso = () => new Date().toISOString();
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)])
  );
  return value;
};
const digest = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const secretDigest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

export class InstitutionalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstitutionalConflictError";
  }
}

export interface CompletionRuleDefinition {
  requiredLessons: "all" | string[];
  minimumScorePercent: number;
  requiredAttestationLineageIds: string[];
  requiredPracticalReviewLineageIds: string[];
  allowManagerOverride?: boolean;
  credential?: { enabled: boolean; expiresAfterDays?: number | null };
}

function validateCompletionRule(rule: CompletionRuleDefinition) {
  if (!Number.isFinite(rule.minimumScorePercent) || rule.minimumScorePercent < 0 || rule.minimumScorePercent > 100) {
    throw new InstitutionalConflictError("Minimum score must be between 0 and 100");
  }
  if (rule.requiredLessons !== "all" && (!Array.isArray(rule.requiredLessons) || rule.requiredLessons.some((key) => typeof key !== "string" || !key.trim()))) {
    throw new InstitutionalConflictError("Required lessons must be 'all' or lesson keys");
  }
  return {
    required_lessons: rule.requiredLessons === "all"
      ? "all" as const
      : [...new Set(rule.requiredLessons.map((key) => key.trim()))],
    minimum_score_percent: rule.minimumScorePercent,
    required_attestations: [...new Set(rule.requiredAttestationLineageIds)],
    required_practical_reviews: [...new Set(rule.requiredPracticalReviewLineageIds)],
    allow_manager_override: rule.allowManagerOverride === true,
    credential: rule.credential ?? { enabled: false },
  };
}

export async function createCompletionRuleVersion(
  actorUserId: number,
  spaceId: string,
  courseId: number,
  definition: CompletionRuleDefinition
) {
  const rule = validateCompletionRule(definition);
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    const attached = await client.query(
      `SELECT 1 FROM space_courses link JOIN courses course ON course.id = link.course_id
       WHERE link.space_id = $1 AND link.course_id = $2 AND course.published = 1`,
      [spaceId, courseId]
    );
    if (attached.rowCount !== 1) throw new InstitutionalConflictError("Attach and publish the course before defining completion");
    if (rule.required_lessons !== "all") {
      for (const lessonKey of rule.required_lessons) {
        const lesson = await client.query(
          `SELECT 1 FROM courses course
           JOIN course_versions version ON version.id=course.published_version_id
           JOIN course_blocks block ON block.course_version_id=version.id
           WHERE course.id=$1 AND block.lesson_key=$2 LIMIT 1`,
          [courseId, lessonKey]
        );
        if (lesson.rowCount !== 1) throw new InstitutionalConflictError("Required lesson is outside the published course version");
      }
    }
    const requiredLineages = [
      ...rule.required_attestations.map((lineageId) => ({ lineageId, blockType: "attestation" })),
      ...rule.required_practical_reviews.map((lineageId) => ({ lineageId, blockType: "practical_task" })),
    ];
    for (const required of requiredLineages) {
      const block = await client.query(
        `SELECT 1 FROM courses course
         JOIN course_versions version ON version.id = course.published_version_id
         JOIN course_blocks block ON block.course_version_id = version.id
         WHERE course.id = $1 AND block.lineage_id = $2 AND block.block_type = $3`,
        [courseId, required.lineageId, required.blockType]
      );
      if (block.rowCount !== 1) throw new InstitutionalConflictError("Completion requirement is outside the published course version");
    }
    await client.query("SELECT id FROM spaces WHERE id = $1 FOR UPDATE", [spaceId]);
    const version = Number((await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(version),0) + 1 AS version
       FROM completion_rule_versions WHERE space_id = $1 AND course_id = $2`,
      [spaceId, courseId]
    )).rows[0].version);
    const at = nowIso();
    const row = (await client.query(
      `INSERT INTO completion_rule_versions
        (space_id, course_id, version, status, rule_json, content_hash,
         created_by_user_id, created_at, published_at)
       VALUES ($1,$2,$3,'published',$4,$5,$6,$7,$7) RETURNING *`,
      [spaceId, courseId, version, JSON.stringify(rule), digest(rule), actorUserId, at]
    )).rows[0];
    return row;
  });
}

export async function listCompletionRuleVersions(
  actorUserId: number,
  spaceId: string,
  courseId?: number
) {
  await authorizeStoredMembership(actorUserId, spaceId, "evidence.read_members", pool);
  return (await pool.query(
    `SELECT rule.id, rule.course_id, course.title AS course_title, rule.version,
            rule.status, rule.rule_json, rule.content_hash, rule.created_at,
            rule.published_at
     FROM completion_rule_versions rule
     JOIN courses course ON course.id=rule.course_id
     WHERE rule.space_id=$1 AND ($2::int IS NULL OR rule.course_id=$2)
     ORDER BY course.title, rule.version DESC`,
    [spaceId, courseId ?? null]
  )).rows;
}

export type AssignmentAudience = {
  wholeSpace?: boolean;
  teamIds?: string[];
  membershipIds?: string[];
};

export interface InstitutionalAssignmentInput {
  completionRuleVersionId: string;
  audience: AssignmentAudience;
  startAt?: string | null;
  dueAt?: string | null;
  expiresAt?: string | null;
  maxAttempts?: number | null;
  reminderHoursBeforeDue?: number[];
  escalationHoursAfterDue?: number[];
}

function validateTimeline(input: InstitutionalAssignmentInput) {
  const values = [input.startAt, input.dueAt, input.expiresAt].map((value) => value ? Date.parse(value) : null);
  if (values.some((value) => value !== null && Number.isNaN(value))) throw new InstitutionalConflictError("Assignment dates are invalid");
  const [start, due, expiry] = values;
  if (start !== null && due !== null && start >= due) throw new InstitutionalConflictError("Start must be before due date");
  if (due !== null && expiry !== null && due > expiry) throw new InstitutionalConflictError("Expiry cannot be before due date");
  if (input.maxAttempts !== null && input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1)) {
    throw new InstitutionalConflictError("Maximum attempts must be a positive integer");
  }
}

async function resolveAudience(
  exec: Queryable,
  spaceId: string,
  audience: AssignmentAudience
) {
  const ids = new Set(audience.membershipIds ?? []);
  const teamIds = [...new Set(audience.teamIds ?? [])];
  if (audience.wholeSpace) {
    const rows = await exec.query<{ id: string }>(
      `SELECT id FROM space_memberships
       WHERE space_id = $1 AND status = 'active' AND role = 'learner'`,
      [spaceId]
    );
    rows.rows.forEach((row) => ids.add(row.id));
  }
  if (teamIds.length > 0) {
    const teams = await exec.query<{ team_id: string; membership_id: string }>(
      `SELECT team.id AS team_id, member.membership_id
       FROM space_teams team JOIN space_team_members member ON member.team_id = team.id
       JOIN space_memberships membership ON membership.id = member.membership_id
       WHERE team.space_id = $1 AND team.status = 'active'
         AND membership.status = 'active' AND team.id = ANY($2::text[])`,
      [spaceId, teamIds]
    );
    if (new Set(teams.rows.map((row) => row.team_id)).size !== teamIds.length) {
      throw new InstitutionalConflictError("One or more audience teams are unavailable");
    }
    teams.rows.forEach((row) => ids.add(row.membership_id));
  }
  if (ids.size > 0) {
    const valid = await exec.query<{ id: string }>(
      `SELECT id FROM space_memberships
       WHERE space_id = $1 AND status = 'active' AND id = ANY($2::text[])`,
      [spaceId, [...ids]]
    );
    if (valid.rowCount !== ids.size) throw new InstitutionalConflictError("One or more audience members are unavailable");
  }
  if (ids.size === 0) throw new InstitutionalConflictError("Assignment audience cannot be empty");
  return { membershipIds: [...ids], teamIds };
}

export async function createInstitutionalAssignment(
  actorUserId: number,
  spaceId: string,
  courseId: number,
  input: InstitutionalAssignmentInput
) {
  validateTimeline(input);
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    const rule = (await client.query<{
      id: string;
      course_id: number;
      status: string;
    }>(
      `SELECT id, course_id, status FROM completion_rule_versions
       WHERE id = $1 AND space_id = $2`,
      [input.completionRuleVersionId, spaceId]
    )).rows[0];
    if (!rule || rule.course_id !== courseId || rule.status !== "published") {
      throw new InstitutionalConflictError("Published completion rule does not match this course");
    }
    const course = (await client.query<{
      content_version: number;
      published_version_id: string | null;
    }>(
      `SELECT course.content_version, course.published_version_id
       FROM courses course JOIN space_courses link ON link.course_id = course.id
       WHERE link.space_id = $1 AND course.id = $2 AND course.published = 1`,
      [spaceId, courseId]
    )).rows[0];
    if (!course?.published_version_id) throw new InstitutionalConflictError("Attach and publish the course before assigning it");
    const audience = await resolveAudience(client, spaceId, input.audience);
    const at = nowIso();
    const assignment = (await client.query<{ id: string }>(
      `INSERT INTO space_assignments
        (space_id, course_id, course_version, status, assigned_by_user_id,
         policy_version, start_at, due_at, expires_at, created_at, updated_at)
       VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
      [spaceId, courseId, course.content_version, actorUserId, space.policy_version,
       input.startAt ?? null, input.dueAt ?? null, input.expiresAt ?? null, at]
    )).rows[0];
    const version = (await client.query<{ id: string }>(
      `INSERT INTO assignment_versions
        (assignment_id, version, status, course_version, completion_rule_version_id,
         start_at, due_at, expires_at, attempt_policy_json, reminder_policy_json,
         escalation_policy_json, created_by_user_id, created_at, activated_at)
       VALUES ($1,1,'active',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
      [
        assignment.id, course.content_version, rule.id, input.startAt ?? null,
        input.dueAt ?? null, input.expiresAt ?? null,
        JSON.stringify({ max_attempts: input.maxAttempts ?? null }),
        JSON.stringify({ hours_before_due: input.reminderHoursBeforeDue ?? [] }),
        JSON.stringify({ hours_after_due: input.escalationHoursAfterDue ?? [] }),
        actorUserId, at,
      ]
    )).rows[0];
    await client.query("UPDATE space_assignments SET current_version_id = $2 WHERE id = $1", [assignment.id, version.id]);
    if (input.audience.wholeSpace) {
      await client.query("INSERT INTO assignment_targets (assignment_version_id,target_type) VALUES ($1,'space')", [version.id]);
    }
    for (const teamId of audience.teamIds) {
      await client.query("INSERT INTO assignment_targets (assignment_version_id,target_type,team_id) VALUES ($1,'team',$2)", [version.id, teamId]);
    }
    for (const membershipId of [...new Set(input.audience.membershipIds ?? [])]) {
      await client.query("INSERT INTO assignment_targets (assignment_version_id,target_type,membership_id) VALUES ($1,'membership',$2)", [version.id, membershipId]);
    }
    const participations: Array<{ id: string; membershipId: string }> = [];
    for (const membershipId of audience.membershipIds) {
      await client.query(
        `INSERT INTO space_assignment_members (assignment_id,membership_id,assigned_at)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [assignment.id, membershipId, at]
      );
      await client.query(
        `INSERT INTO assignment_audience_events
          (assignment_version_id,membership_id,event_type,actor_user_id,occurred_at)
         VALUES ($1,$2,'assigned',$3,$4)`,
        [version.id, membershipId, actorUserId, at]
      );
      const participation = (await client.query<{ id: string }>(
        `INSERT INTO assignment_participations
          (assignment_version_id,membership_id,status,assigned_at)
         VALUES ($1,$2,'assigned',$3) RETURNING id`,
        [version.id, membershipId, at]
      )).rows[0];
      participations.push({ id: participation.id, membershipId });
      await client.query(
        `INSERT INTO assignment_participation_events
          (participation_id,event_type,actor_user_id,occurred_at)
         VALUES ($1,'assigned',$2,$3)`,
        [participation.id, actorUserId, at]
      );
      if (input.dueAt) {
        for (const [index, hours] of (input.reminderHoursBeforeDue ?? []).entries()) {
          if (!Number.isFinite(hours) || hours < 0) continue;
          await client.query(
            `INSERT INTO assignment_delivery_events
              (participation_id,kind,sequence,scheduled_at)
             VALUES ($1,'reminder',$2,$3)`,
            [participation.id, index + 1, new Date(Date.parse(input.dueAt) - hours * 3_600_000).toISOString()]
          );
        }
        for (const [index, hours] of (input.escalationHoursAfterDue ?? []).entries()) {
          if (!Number.isFinite(hours) || hours < 0) continue;
          await client.query(
            `INSERT INTO assignment_delivery_events
              (participation_id,kind,sequence,scheduled_at)
             VALUES ($1,'escalation',$2,$3)`,
            [participation.id, index + 1, new Date(Date.parse(input.dueAt) + hours * 3_600_000).toISOString()]
          );
        }
      }
    }
    return { assignmentId: assignment.id, assignmentVersionId: version.id, participations };
  });
}

export async function reviseInstitutionalAssignment(
  actorUserId: number,
  assignmentId: string,
  input: InstitutionalAssignmentInput
) {
  validateTimeline(input);
  return tx(async (client) => {
    const assignment = (await client.query<{
      id: string;
      space_id: string;
      course_id: number;
      current_version_id: string;
      current_version: number;
    }>(
      `SELECT assignment.id, assignment.space_id, assignment.course_id,
              assignment.current_version_id, version.version AS current_version
       FROM space_assignments assignment
       JOIN assignment_versions version ON version.id=assignment.current_version_id
       WHERE assignment.id=$1 AND assignment.status='active'
       FOR UPDATE OF assignment`,
      [assignmentId]
    )).rows[0];
    if (!assignment) throw new InstitutionalConflictError("Active assignment not found");
    const { space } = await authorizeStoredMembership(actorUserId, assignment.space_id, "assignments.manage", client);
    const rule = (await client.query<{ id: string; course_id: number; status: string }>(
      `SELECT id,course_id,status FROM completion_rule_versions
       WHERE id=$1 AND space_id=$2`,
      [input.completionRuleVersionId, assignment.space_id]
    )).rows[0];
    if (!rule || rule.course_id !== assignment.course_id || rule.status !== "published") {
      throw new InstitutionalConflictError("Published completion rule does not match this course");
    }
    const course = (await client.query<{ content_version: number; published_version_id: string | null }>(
      `SELECT course.content_version,course.published_version_id FROM courses course
       JOIN space_courses link ON link.course_id=course.id
       WHERE link.space_id=$1 AND course.id=$2 AND course.published=1`,
      [assignment.space_id, assignment.course_id]
    )).rows[0];
    if (!course?.published_version_id) throw new InstitutionalConflictError("Attach and publish the course before revising the assignment");
    const audience = await resolveAudience(client, assignment.space_id, input.audience);
    const at = nowIso();
    await client.query(
      `UPDATE assignment_versions SET status='superseded',superseded_at=$2
       WHERE id=$1 AND status='active'`,
      [assignment.current_version_id, at]
    );
    const version = (await client.query<{ id: string }>(
      `INSERT INTO assignment_versions
        (assignment_id,version,status,course_version,completion_rule_version_id,
         start_at,due_at,expires_at,attempt_policy_json,reminder_policy_json,
         escalation_policy_json,created_by_user_id,created_at,activated_at)
       VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id`,
      [assignment.id, assignment.current_version + 1, course.content_version, rule.id,
       input.startAt ?? null, input.dueAt ?? null, input.expiresAt ?? null,
       JSON.stringify({ max_attempts: input.maxAttempts ?? null }),
       JSON.stringify({ hours_before_due: input.reminderHoursBeforeDue ?? [] }),
       JSON.stringify({ hours_after_due: input.escalationHoursAfterDue ?? [] }),
       actorUserId, at]
    )).rows[0];
    await client.query(
      `UPDATE space_assignments SET current_version_id=$2,course_version=$3,
              start_at=$4,due_at=$5,expires_at=$6,policy_version=$7,updated_at=$8
       WHERE id=$1`,
      [assignment.id, version.id, course.content_version, input.startAt ?? null,
       input.dueAt ?? null, input.expiresAt ?? null, space.policy_version, at]
    );
    await client.query("DELETE FROM space_assignment_members WHERE assignment_id=$1", [assignment.id]);
    if (input.audience.wholeSpace) await client.query(
      "INSERT INTO assignment_targets (assignment_version_id,target_type) VALUES ($1,'space')",
      [version.id]
    );
    for (const teamId of audience.teamIds) await client.query(
      "INSERT INTO assignment_targets (assignment_version_id,target_type,team_id) VALUES ($1,'team',$2)",
      [version.id, teamId]
    );
    for (const membershipId of [...new Set(input.audience.membershipIds ?? [])]) await client.query(
      "INSERT INTO assignment_targets (assignment_version_id,target_type,membership_id) VALUES ($1,'membership',$2)",
      [version.id, membershipId]
    );
    const participations: Array<{ id: string; membershipId: string }> = [];
    for (const membershipId of audience.membershipIds) {
      await client.query(
        `INSERT INTO space_assignment_members (assignment_id,membership_id,assigned_at)
         VALUES ($1,$2,$3)`,
        [assignment.id, membershipId, at]
      );
      await client.query(
        `INSERT INTO assignment_audience_events
          (assignment_version_id,membership_id,event_type,reason,actor_user_id,occurred_at)
         VALUES ($1,$2,'assigned','Assignment version activated',$3,$4)`,
        [version.id, membershipId, actorUserId, at]
      );
      const participation = (await client.query<{ id: string }>(
        `INSERT INTO assignment_participations
          (assignment_version_id,membership_id,status,assigned_at)
         VALUES ($1,$2,'assigned',$3) RETURNING id`,
        [version.id, membershipId, at]
      )).rows[0];
      participations.push({ id: participation.id, membershipId });
      await client.query(
        `INSERT INTO assignment_participation_events
          (participation_id,event_type,actor_user_id,metadata_json,occurred_at)
         VALUES ($1,'assigned',$2,$3,$4)`,
        [participation.id, actorUserId, JSON.stringify({ assignmentVersion: assignment.current_version + 1 }), at]
      );
      if (input.dueAt) {
        for (const [index, hours] of (input.reminderHoursBeforeDue ?? []).entries()) await client.query(
          `INSERT INTO assignment_delivery_events (participation_id,kind,sequence,scheduled_at)
           VALUES ($1,'reminder',$2,$3)`,
          [participation.id, index + 1, new Date(Date.parse(input.dueAt) - hours * 3_600_000).toISOString()]
        );
        for (const [index, hours] of (input.escalationHoursAfterDue ?? []).entries()) await client.query(
          `INSERT INTO assignment_delivery_events (participation_id,kind,sequence,scheduled_at)
           VALUES ($1,'escalation',$2,$3)`,
          [participation.id, index + 1, new Date(Date.parse(input.dueAt) + hours * 3_600_000).toISOString()]
        );
      }
    }
    return { assignmentId: assignment.id, assignmentVersionId: version.id, assignmentVersion: assignment.current_version + 1, participations };
  });
}

async function participationForUser(
  exec: Queryable,
  userId: number,
  assignmentId: string
) {
  const row = (await exec.query<{
    id: string;
    status: string;
    assignment_version_id: string;
    membership_id: string;
    start_at: string | null;
    expires_at: string | null;
    course_id: number;
    course_version: number;
    completion_rule_version_id: string;
  }>(
    `SELECT participation.id, participation.status, participation.assignment_version_id,
            participation.membership_id, version.start_at, version.expires_at,
            assignment.course_id, version.course_version, version.completion_rule_version_id
     FROM space_assignments assignment
     JOIN assignment_versions version ON version.id = assignment.current_version_id
     JOIN assignment_participations participation ON participation.assignment_version_id = version.id
     JOIN space_memberships membership ON membership.id = participation.membership_id
     WHERE assignment.id = $1 AND membership.user_id = $2 AND membership.status = 'active'
     FOR UPDATE OF participation`,
    [assignmentId, userId]
  )).rows[0];
  if (!row) throw new InstitutionalConflictError("Assignment participation not found");
  return row;
}

export async function startAssignmentParticipation(userId: number, assignmentId: string) {
  return tx(async (client) => {
    const participation = await participationForUser(client, userId, assignmentId);
    const now = Date.now();
    if (participation.start_at && Date.parse(participation.start_at) > now) throw new InstitutionalConflictError("Assignment has not started");
    if (participation.expires_at && Date.parse(participation.expires_at) <= now) throw new InstitutionalConflictError("Assignment has expired");
    if (participation.status === "assigned") {
      const at = nowIso();
      await client.query("UPDATE assignment_participations SET status='started',started_at=$2 WHERE id=$1", [participation.id, at]);
      await client.query(
        `INSERT INTO assignment_participation_events
          (participation_id,event_type,actor_user_id,occurred_at)
         VALUES ($1,'started',$2,$3)`,
        [participation.id, userId, at]
      );
    }
    return { ...participation, status: participation.status === "assigned" ? "started" : participation.status };
  });
}

export async function recordAssignmentAttestation(
  userId: number,
  assignmentId: string,
  input: { blockLineageId: string; statement: string; accepted: boolean; occurredAt?: string }
) {
  const statement = input.statement.trim();
  if (!statement) throw new InstitutionalConflictError("Attestation statement is required");
  return tx(async (client) => {
    const participation = await participationForUser(client, userId, assignmentId);
    if (!["started", "submitted"].includes(participation.status)) throw new InstitutionalConflictError("Start the assignment before attesting");
    const block = await client.query<{ content_json: string }>(
      `SELECT revision.content_json FROM course_versions version
       JOIN course_blocks block ON block.course_version_id = version.id
       JOIN course_block_revisions revision
         ON revision.block_id = block.id AND revision.revision = block.current_revision
       WHERE version.course_id = $1 AND version.version_number = $2
         AND block.lineage_id = $3 AND block.block_type = 'attestation'`,
      [participation.course_id, participation.course_version, input.blockLineageId]
    );
    if (block.rowCount !== 1) throw new InstitutionalConflictError("Attestation block is outside the assigned course version");
    const publishedStatement = String((JSON.parse(block.rows[0].content_json) as { statement?: unknown }).statement ?? "").trim();
    if (!publishedStatement || publishedStatement !== statement) {
      throw new InstitutionalConflictError("Attestation statement does not match the assigned version");
    }
    const learnerKey = await getLearnerKey(userId, client);
    return (await client.query(
      `INSERT INTO attestation_events
        (participation_id,assignment_version_id,learner_key,block_lineage_id,
         statement_hash,accepted,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [participation.id, participation.assignment_version_id, learnerKey,
       input.blockLineageId, digest(statement), input.accepted ? 1 : 0,
       input.occurredAt ?? nowIso()]
    )).rows[0];
  });
}

export async function recordAssignmentLessonCompletion(
  userId: number,
  assignmentId: string,
  input: {
    lessonKey: string;
    score: number;
    total: number;
    sourceCompletionEventId?: string | null;
    completedAt?: string;
  }
) {
  const lessonKey = input.lessonKey.trim();
  if (!lessonKey) throw new InstitutionalConflictError("Lesson key is required");
  if (!Number.isInteger(input.score) || !Number.isInteger(input.total) || input.total < 1 || input.score < 0 || input.score > input.total) {
    throw new InstitutionalConflictError("Lesson score is invalid");
  }
  return tx(async (client) => {
    const participation = await participationForUser(client, userId, assignmentId);
    if (!["started", "submitted"].includes(participation.status)) throw new InstitutionalConflictError("Start the assignment before completing lessons");
    const lesson = await client.query(
      `SELECT 1 FROM course_versions version
       JOIN course_blocks block ON block.course_version_id = version.id
       WHERE version.course_id=$1 AND version.version_number=$2 AND block.lesson_key=$3
       LIMIT 1`,
      [participation.course_id, participation.course_version, lessonKey]
    );
    if (lesson.rowCount !== 1) throw new InstitutionalConflictError("Lesson is outside the assigned course version");
    if (input.sourceCompletionEventId) {
      const source = await client.query(
        `SELECT 1 FROM lesson_completion_events
         WHERE answer_session_id=$1 AND learner_key=$2 AND course_id=$3`,
        [input.sourceCompletionEventId, await getLearnerKey(userId, client), participation.course_id]
      );
      if (source.rowCount !== 1) throw new InstitutionalConflictError("Source lesson completion does not belong to this learner and course");
    }
    const learnerKey = await getLearnerKey(userId, client);
    return (await client.query(
      `INSERT INTO assignment_lesson_completion_events
        (participation_id,assignment_version_id,learner_key,lesson_key,score,total,
         source_completion_event_id,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [participation.id, participation.assignment_version_id, learnerKey, lessonKey,
       input.score, input.total, input.sourceCompletionEventId ?? null,
       input.completedAt ?? nowIso()]
    )).rows[0];
  });
}

export async function submitPracticalTask(
  userId: number,
  assignmentId: string,
  input: { blockLineageId: string; response: Record<string, unknown>; artifactHash?: string | null }
) {
  return tx(async (client) => {
    const participation = await participationForUser(client, userId, assignmentId);
    if (!["started", "submitted"].includes(participation.status)) throw new InstitutionalConflictError("Start the assignment before submitting work");
    const block = await client.query(
      `SELECT 1 FROM course_versions version JOIN course_blocks block ON block.course_version_id = version.id
       WHERE version.course_id = $1 AND version.version_number = $2
         AND block.lineage_id = $3 AND block.block_type = 'practical_task'`,
      [participation.course_id, participation.course_version, input.blockLineageId]
    );
    if (block.rowCount !== 1) throw new InstitutionalConflictError("Practical task is outside the assigned course version");
    const nextVersion = Number((await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(submission_version),0)+1 AS version FROM practical_task_submissions
       WHERE participation_id=$1 AND block_lineage_id=$2`,
      [participation.id, input.blockLineageId]
    )).rows[0].version);
    const submission = (await client.query(
      `INSERT INTO practical_task_submissions
        (participation_id,assignment_version_id,block_lineage_id,submission_version,
         response_json,artifact_hash,submitted_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [participation.id, participation.assignment_version_id, input.blockLineageId,
       nextVersion, JSON.stringify(input.response), input.artifactHash ?? null, userId]
    )).rows[0];
    if (participation.status === "started") {
      await client.query("UPDATE assignment_participations SET status='submitted',submitted_at=$2 WHERE id=$1", [participation.id, nowIso()]);
      await client.query(
        "INSERT INTO assignment_participation_events (participation_id,event_type,actor_user_id) VALUES ($1,'submitted',$2)",
        [participation.id, userId]
      );
    }
    return submission;
  });
}

export async function reviewPracticalTask(
  reviewerUserId: number,
  submissionId: string,
  input: { decision: "approved" | "changes_requested" | "rejected"; rubric?: Record<string, unknown>; summary?: string }
) {
  return tx(async (client) => {
    const submission = (await client.query<{ space_id: string }>(
      `SELECT assignment.space_id FROM practical_task_submissions submission
       JOIN assignment_versions version ON version.id = submission.assignment_version_id
       JOIN space_assignments assignment ON assignment.id = version.assignment_id
       WHERE submission.id = $1`,
      [submissionId]
    )).rows[0];
    if (!submission) throw new InstitutionalConflictError("Practical submission not found");
    await authorizeStoredMembership(reviewerUserId, submission.space_id, "assignments.manage", client);
    return (await client.query(
      `INSERT INTO practical_task_reviews
        (submission_id,reviewer_user_id,decision,rubric_json,summary)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [submissionId, reviewerUserId, input.decision,
       JSON.stringify(input.rubric ?? {}), input.summary?.trim() ?? ""]
    )).rows[0];
  });
}

type StoredCompletionRule = {
  required_lessons: "all" | string[];
  minimum_score_percent: number;
  required_attestations: string[];
  required_practical_reviews: string[];
  credential?: { enabled?: boolean; expiresAfterDays?: number | null; expires_after_days?: number | null };
};

export async function evaluateAssignmentCompletion(userId: number, assignmentId: string) {
  return tx(async (client) => {
    const participation = await participationForUser(client, userId, assignmentId);
    const existing = (await client.query(
      `SELECT completion.*, credential.id AS credential_id
       FROM assignment_completion_events completion
       LEFT JOIN credential_records credential ON credential.completion_event_id=completion.id
       WHERE completion.participation_id=$1 AND completion.decision='completed'
       ORDER BY completion.evaluated_at DESC LIMIT 1`,
      [participation.id]
    )).rows[0];
    if (existing) return { completed: true, completion: existing, credentialId: existing.credential_id ?? null };

    const ruleRow = (await client.query<{ rule_json: string }>(
      `SELECT rule_json FROM completion_rule_versions
       WHERE id=$1 AND status='published'`,
      [participation.completion_rule_version_id]
    )).rows[0];
    if (!ruleRow) throw new InstitutionalConflictError("Published completion rule not found");
    const rule = JSON.parse(ruleRow.rule_json) as StoredCompletionRule;
    const allLessonRows = (await client.query<{ lesson_key: string }>(
      `SELECT DISTINCT block.lesson_key FROM course_versions version
       JOIN course_blocks block ON block.course_version_id=version.id
       WHERE version.course_id=$1 AND version.version_number=$2
       ORDER BY block.lesson_key`,
      [participation.course_id, participation.course_version]
    )).rows;
    const requiredLessons = rule.required_lessons === "all"
      ? allLessonRows.map((row) => row.lesson_key)
      : [...new Set(rule.required_lessons)];
    const lessonEvidence = (await client.query<{
      id: string; lesson_key: string; score: number; total: number; completed_at: string;
    }>(
      `SELECT DISTINCT ON (lesson_key) id, lesson_key, score, total, completed_at
       FROM assignment_lesson_completion_events
       WHERE participation_id=$1
       ORDER BY lesson_key, completed_at DESC, recorded_at DESC`,
      [participation.id]
    )).rows.filter((row) => requiredLessons.includes(row.lesson_key));
    const lessonByKey = new Map(lessonEvidence.map((row) => [row.lesson_key, row]));
    const missingLessons = requiredLessons.filter((key) => !lessonByKey.has(key));
    const scoreTotal = lessonEvidence.reduce((sum, row) => sum + row.total, 0);
    const scoreEarned = lessonEvidence.reduce((sum, row) => sum + row.score, 0);
    const scorePercent = scoreTotal > 0 ? Math.round((scoreEarned / scoreTotal) * 10_000) / 100 : 100;

    const attestations = (await client.query<{
      id: string; block_lineage_id: string; accepted: number; occurred_at: string;
    }>(
      `SELECT DISTINCT ON (block_lineage_id) id, block_lineage_id, accepted, occurred_at
       FROM attestation_events WHERE participation_id=$1
       ORDER BY block_lineage_id, occurred_at DESC, recorded_at DESC`,
      [participation.id]
    )).rows;
    const acceptedByLineage = new Map(attestations.map((row) => [row.block_lineage_id, row]));
    const missingAttestations = rule.required_attestations.filter((lineageId) => acceptedByLineage.get(lineageId)?.accepted !== 1);

    const practicalEvidence: Array<{ lineageId: string; submissionId: string | null; reviewId: string | null; decision: string | null }> = [];
    for (const lineageId of rule.required_practical_reviews) {
      const evidence = (await client.query<{ submission_id: string; review_id: string | null; decision: string | null }>(
        `SELECT submission.id AS submission_id, review.id AS review_id, review.decision
         FROM practical_task_submissions submission
         LEFT JOIN LATERAL (
           SELECT id, decision FROM practical_task_reviews
           WHERE submission_id=submission.id ORDER BY reviewed_at DESC, id DESC LIMIT 1
         ) review ON true
         WHERE submission.participation_id=$1 AND submission.block_lineage_id=$2
         ORDER BY submission.submission_version DESC LIMIT 1`,
        [participation.id, lineageId]
      )).rows[0];
      practicalEvidence.push({
        lineageId,
        submissionId: evidence?.submission_id ?? null,
        reviewId: evidence?.review_id ?? null,
        decision: evidence?.decision ?? null,
      });
    }
    const missingPracticalReviews = practicalEvidence.filter((item) => item.decision !== "approved").map((item) => item.lineageId);
    const completed = missingLessons.length === 0
      && scorePercent >= rule.minimum_score_percent
      && missingAttestations.length === 0
      && missingPracticalReviews.length === 0;
    const evaluation = {
      requiredLessons,
      missingLessons,
      minimumScorePercent: rule.minimum_score_percent,
      scorePercent,
      missingAttestations,
      missingPracticalReviews,
    };
    const manifest = {
      lessonCompletions: lessonEvidence.map((row) => ({ id: row.id, lessonKey: row.lesson_key, completedAt: row.completed_at })),
      attestations: attestations.filter((row) => rule.required_attestations.includes(row.block_lineage_id)).map((row) => ({ id: row.id, lineageId: row.block_lineage_id, occurredAt: row.occurred_at })),
      practicalReviews: practicalEvidence,
    };
    const evidenceHash = digest({
      participationId: participation.id,
      assignmentVersionId: participation.assignment_version_id,
      completionRuleVersionId: participation.completion_rule_version_id,
      decision: completed ? "completed" : "not_met",
      evaluation,
      manifest,
    });
    const learnerKey = await getLearnerKey(userId, client);
    const completion = (await client.query(
      `INSERT INTO assignment_completion_events
        (participation_id,assignment_version_id,completion_rule_version_id,learner_key,
         decision,score_percent,rule_evaluation_json,evidence_manifest_json,evidence_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [participation.id, participation.assignment_version_id,
       participation.completion_rule_version_id, learnerKey,
       completed ? "completed" : "not_met", scorePercent,
       JSON.stringify(evaluation), JSON.stringify(manifest), evidenceHash]
    )).rows[0];
    if (!completed) return { completed: false, completion, evaluation, credentialId: null };

    const at = nowIso();
    await client.query(
      `UPDATE assignment_participations SET status='completed',completed_at=$2
       WHERE id=$1`,
      [participation.id, at]
    );
    await client.query(
      `INSERT INTO assignment_participation_events
        (participation_id,event_type,actor_user_id,metadata_json,occurred_at)
       VALUES ($1,'completed',$2,$3,$4)`,
      [participation.id, userId, JSON.stringify({ completionEventId: completion.id, evidenceHash }), at]
    );
    let credentialId: string | null = null;
    let credentialVerificationToken: string | null = null;
    if (rule.credential?.enabled) {
      const expiryDays = rule.credential.expiresAfterDays ?? rule.credential.expires_after_days ?? null;
      const expiresAt = expiryDays === null ? null : new Date(Date.parse(at) + expiryDays * 86_400_000).toISOString();
      credentialVerificationToken = crypto.randomBytes(32).toString("base64url");
      const displayCode = `BQ-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
      const credential = (await client.query<{ id: string }>(
        `INSERT INTO credential_records
          (user_id,learner_key,assignment_version_id,participation_id,course_id,
           course_version,completion_rule_version_id,completion_event_id,evidence_hash,
           verification_token_hash,display_code,issued_at,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [userId, learnerKey, participation.assignment_version_id, participation.id,
         participation.course_id, participation.course_version,
         participation.completion_rule_version_id, completion.id, evidenceHash,
         secretDigest(credentialVerificationToken), displayCode, at, expiresAt]
      )).rows[0];
      credentialId = credential.id;
      await client.query(
        `INSERT INTO credential_status_events (credential_id,event_type,actor_user_id,occurred_at)
         VALUES ($1,'issued',$2,$3)`,
        [credentialId, userId, at]
      );
    }
    return { completed: true, completion, evaluation, credentialId, credentialVerificationToken };
  });
}

export async function verifyCredential(verificationToken: string) {
  if (!verificationToken || verificationToken.length < 32) return null;
  const credential = (await pool.query<{
    id: string;
    display_code: string;
    status: "active" | "revoked" | "expired";
    course_id: number;
    course_version: number;
    course_title: string;
    learner_name: string;
    evidence_hash: string;
    issued_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    revocation_reason: string | null;
  }>(
    `SELECT credential.id, credential.display_code, credential.status,
            credential.course_id, credential.course_version, course.title AS course_title,
            users.name AS learner_name, credential.evidence_hash, credential.issued_at,
            credential.expires_at, credential.revoked_at, credential.revocation_reason
     FROM credential_records credential
     JOIN courses course ON course.id=credential.course_id
     JOIN users ON users.id=credential.user_id
     WHERE credential.verification_token_hash=$1`,
    [secretDigest(verificationToken)]
  )).rows[0];
  if (!credential) return null;
  const effectiveStatus = credential.status === "active" && credential.expires_at
    && Date.parse(credential.expires_at) <= Date.now() ? "expired" : credential.status;
  return {
    id: credential.id,
    displayCode: credential.display_code,
    status: effectiveStatus,
    course: { id: credential.course_id, title: credential.course_title, version: credential.course_version },
    learnerName: credential.learner_name,
    evidenceHash: credential.evidence_hash,
    issuedAt: credential.issued_at,
    expiresAt: credential.expires_at,
    revokedAt: credential.revoked_at,
    revocationReason: credential.revocation_reason,
  };
}

async function authorizeCredentialManager(
  exec: Queryable,
  actorUserId: number,
  credentialId: string
) {
  const credential = (await exec.query<{ id: string; space_id: string; status: string; expires_at: string | null }>(
    `SELECT credential.id, assignment.space_id, credential.status, credential.expires_at
     FROM credential_records credential
     JOIN assignment_versions version ON version.id=credential.assignment_version_id
     JOIN space_assignments assignment ON assignment.id=version.assignment_id
     WHERE credential.id=$1 FOR UPDATE OF credential`,
    [credentialId]
  )).rows[0];
  if (!credential) throw new InstitutionalConflictError("Credential not found");
  await authorizeStoredMembership(actorUserId, credential.space_id, "assignments.manage", exec);
  return credential;
}

export async function revokeCredential(
  actorUserId: number,
  credentialId: string,
  reason: string
) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new InstitutionalConflictError("Revocation reason is required");
  return tx(async (client) => {
    const credential = await authorizeCredentialManager(client, actorUserId, credentialId);
    if (credential.status !== "active") throw new InstitutionalConflictError("Only active credentials can be revoked");
    const at = nowIso();
    const updated = (await client.query(
      `UPDATE credential_records SET status='revoked',revoked_at=$2,revocation_reason=$3
       WHERE id=$1 RETURNING *`,
      [credentialId, at, normalizedReason]
    )).rows[0];
    await client.query(
      `INSERT INTO credential_status_events (credential_id,event_type,actor_user_id,reason,occurred_at)
       VALUES ($1,'revoked',$2,$3,$4)`,
      [credentialId, actorUserId, normalizedReason, at]
    );
    return updated;
  });
}

export async function renewCredential(
  actorUserId: number,
  credentialId: string,
  expiresAt: string
) {
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed) || parsed <= Date.now()) throw new InstitutionalConflictError("Renewal expiry must be in the future");
  return tx(async (client) => {
    const credential = await authorizeCredentialManager(client, actorUserId, credentialId);
    if (credential.status === "revoked") throw new InstitutionalConflictError("Revoked credentials cannot be renewed");
    if (credential.expires_at && parsed <= Date.parse(credential.expires_at)) {
      throw new InstitutionalConflictError("Renewal must extend the credential expiry");
    }
    const at = nowIso();
    const updated = (await client.query(
      `UPDATE credential_records SET status='active',expires_at=$2,revoked_at=NULL,revocation_reason=NULL
       WHERE id=$1 RETURNING *`,
      [credentialId, expiresAt]
    )).rows[0];
    await client.query(
      `INSERT INTO credential_status_events (credential_id,event_type,actor_user_id,reason,occurred_at)
       VALUES ($1,'renewed',$2,$3,$4)`,
      [credentialId, actorUserId, `Extended through ${expiresAt}`, at]
    );
    return updated;
  });
}

export async function expireDueCredentials(at = nowIso()) {
  return tx(async (client) => {
    const due = (await client.query<{ id: string }>(
      `SELECT id FROM credential_records
       WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= $1
       FOR UPDATE`,
      [at]
    )).rows;
    for (const credential of due) {
      await client.query("UPDATE credential_records SET status='expired' WHERE id=$1", [credential.id]);
      await client.query(
        `INSERT INTO credential_status_events (credential_id,event_type,reason,occurred_at)
         VALUES ($1,'expired','Credential reached its configured expiry',$2)`,
        [credential.id, at]
      );
    }
    return { expired: due.length };
  });
}

async function managedAssignment(exec: Queryable, actorUserId: number, assignmentId: string) {
  const row = (await exec.query<{
    space_id: string;
    assignment_version_id: string;
    due_at: string | null;
    attempt_policy_json: string;
    reminder_policy_json: string;
    escalation_policy_json: string;
  }>(
    `SELECT assignment.space_id, version.id AS assignment_version_id, version.due_at,
            version.attempt_policy_json, version.reminder_policy_json,
            version.escalation_policy_json
     FROM space_assignments assignment
     JOIN assignment_versions version ON version.id=assignment.current_version_id
     WHERE assignment.id=$1 AND assignment.status='active'
     FOR UPDATE OF assignment`,
    [assignmentId]
  )).rows[0];
  if (!row) throw new InstitutionalConflictError("Active assignment not found");
  await authorizeStoredMembership(actorUserId, row.space_id, "assignments.manage", exec);
  return row;
}

export async function removeAssignmentMember(
  actorUserId: number,
  assignmentId: string,
  membershipId: string,
  input: { exempt?: boolean; reason: string }
) {
  const reason = input.reason.trim();
  if (!reason) throw new InstitutionalConflictError("Audience change reason is required");
  return tx(async (client) => {
    const assignment = await managedAssignment(client, actorUserId, assignmentId);
    const membership = (await client.query<{ id: string }>(
      "SELECT id FROM space_memberships WHERE id=$1 AND space_id=$2",
      [membershipId, assignment.space_id]
    )).rows[0];
    if (!membership) throw new InstitutionalConflictError("Assignment member not found");
    const eventType = input.exempt ? "exempted" : "removed";
    const status = input.exempt ? "exempted" : "revoked";
    const at = nowIso();
    await client.query(
      `INSERT INTO assignment_audience_events
        (assignment_version_id,membership_id,event_type,reason,actor_user_id,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [assignment.assignment_version_id, membershipId, eventType, reason, actorUserId, at]
    );
    const participations = (await client.query<{ id: string }>(
      `UPDATE assignment_participations SET status=$3
       WHERE assignment_version_id=$1 AND membership_id=$2
         AND status IN ('assigned','started','submitted')
       RETURNING id`,
      [assignment.assignment_version_id, membershipId, status]
    )).rows;
    for (const participation of participations) {
      await client.query(
        `INSERT INTO assignment_participation_events
          (participation_id,event_type,actor_user_id,metadata_json,occurred_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [participation.id, status, actorUserId, JSON.stringify({ reason }), at]
      );
      await client.query(
        `UPDATE assignment_delivery_events SET status='cancelled'
         WHERE participation_id=$1 AND status='scheduled'`,
        [participation.id]
      );
    }
    await client.query(
      "DELETE FROM space_assignment_members WHERE assignment_id=$1 AND membership_id=$2",
      [assignmentId, membershipId]
    );
    return { eventType, affectedParticipations: participations.length };
  });
}

export async function reassignAssignmentMember(
  actorUserId: number,
  assignmentId: string,
  membershipId: string,
  reason: string
) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new InstitutionalConflictError("Reassignment reason is required");
  return tx(async (client) => {
    const assignment = await managedAssignment(client, actorUserId, assignmentId);
    const membership = (await client.query<{ id: string }>(
      `SELECT id FROM space_memberships
       WHERE id=$1 AND space_id=$2 AND status='active' FOR UPDATE`,
      [membershipId, assignment.space_id]
    )).rows[0];
    if (!membership) throw new InstitutionalConflictError("Active assignment member not found");
    const policy = JSON.parse(assignment.attempt_policy_json) as { max_attempts?: number | null };
    const attempt = Number((await client.query<{ attempt: number }>(
      `SELECT COALESCE(MAX(attempt_number),0)+1 AS attempt
       FROM assignment_participations
       WHERE assignment_version_id=$1 AND membership_id=$2`,
      [assignment.assignment_version_id, membershipId]
    )).rows[0].attempt);
    if (policy.max_attempts && attempt > policy.max_attempts) {
      throw new InstitutionalConflictError("Assignment attempt limit has been reached");
    }
    const at = nowIso();
    const active = (await client.query<{ id: string }>(
      `UPDATE assignment_participations SET status='revoked'
       WHERE assignment_version_id=$1 AND membership_id=$2
         AND status IN ('assigned','started','submitted') RETURNING id`,
      [assignment.assignment_version_id, membershipId]
    )).rows;
    for (const prior of active) {
      await client.query(
        `INSERT INTO assignment_participation_events
          (participation_id,event_type,actor_user_id,metadata_json,occurred_at)
         VALUES ($1,'revoked',$2,$3,$4)`,
        [prior.id, actorUserId, JSON.stringify({ reason: normalizedReason, reassigned: true }), at]
      );
      await client.query(
        "UPDATE assignment_delivery_events SET status='cancelled' WHERE participation_id=$1 AND status='scheduled'",
        [prior.id]
      );
    }
    await client.query(
      `INSERT INTO assignment_audience_events
        (assignment_version_id,membership_id,event_type,reason,actor_user_id,occurred_at)
       VALUES ($1,$2,'reassigned',$3,$4,$5)`,
      [assignment.assignment_version_id, membershipId, normalizedReason, actorUserId, at]
    );
    await client.query(
      `INSERT INTO space_assignment_members (assignment_id,membership_id,assigned_at)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [assignmentId, membershipId, at]
    );
    const participation = (await client.query<{ id: string }>(
      `INSERT INTO assignment_participations
        (assignment_version_id,membership_id,attempt_number,status,assigned_at)
       VALUES ($1,$2,$3,'assigned',$4) RETURNING id`,
      [assignment.assignment_version_id, membershipId, attempt, at]
    )).rows[0];
    await client.query(
      `INSERT INTO assignment_participation_events
        (participation_id,event_type,actor_user_id,metadata_json,occurred_at)
       VALUES ($1,'assigned',$2,$3,$4)`,
      [participation.id, actorUserId, JSON.stringify({ reason: normalizedReason, reassigned: true }), at]
    );
    if (assignment.due_at) {
      const reminder = JSON.parse(assignment.reminder_policy_json) as { hours_before_due?: number[] };
      const escalation = JSON.parse(assignment.escalation_policy_json) as { hours_after_due?: number[] };
      for (const [index, hours] of (reminder.hours_before_due ?? []).entries()) {
        await client.query(
          `INSERT INTO assignment_delivery_events (participation_id,kind,sequence,scheduled_at)
           VALUES ($1,'reminder',$2,$3)`,
          [participation.id, index + 1, new Date(Date.parse(assignment.due_at) - hours * 3_600_000).toISOString()]
        );
      }
      for (const [index, hours] of (escalation.hours_after_due ?? []).entries()) {
        await client.query(
          `INSERT INTO assignment_delivery_events (participation_id,kind,sequence,scheduled_at)
           VALUES ($1,'escalation',$2,$3)`,
          [participation.id, index + 1, new Date(Date.parse(assignment.due_at) + hours * 3_600_000).toISOString()]
        );
      }
    }
    return { ...participation, attemptNumber: attempt };
  });
}

type AssignmentEmailSender = (input: TransactionalEmailInput) => Promise<{ mode: string; id?: string }>;

export async function dispatchDueAssignmentDeliveries(
  at = nowIso(),
  send: AssignmentEmailSender = sendTransactionalEmail
) {
  const due = (await pool.query<{
    id: string;
    kind: "reminder" | "escalation";
    sequence: number;
    learner_email: string;
    learner_name: string;
    course_title: string;
    due_at: string | null;
    space_name: string;
    manager_email: string | null;
  }>(
    `WITH claimed AS (
       SELECT delivery.id FROM assignment_delivery_events delivery
       JOIN assignment_participations participation ON participation.id=delivery.participation_id
       WHERE delivery.status='scheduled' AND delivery.scheduled_at <= $1
         AND participation.status IN ('assigned','started','submitted')
       ORDER BY delivery.scheduled_at, delivery.id
       FOR UPDATE OF delivery SKIP LOCKED
     ), updated AS (
       UPDATE assignment_delivery_events delivery SET status='sending'
       FROM claimed WHERE delivery.id=claimed.id RETURNING delivery.*
     )
     SELECT delivery.id, delivery.kind, delivery.sequence,
            learner.email AS learner_email, learner.name AS learner_name,
            course.title AS course_title, version.due_at, space.name AS space_name,
            (SELECT users.email FROM space_memberships manager
             JOIN users ON users.id=manager.user_id
             WHERE manager.space_id=assignment.space_id AND manager.status='active'
               AND manager.role IN ('owner','administrator','manager')
             ORDER BY CASE manager.role WHEN 'owner' THEN 0 WHEN 'administrator' THEN 1 ELSE 2 END
             LIMIT 1) AS manager_email
     FROM updated delivery
     JOIN assignment_participations participation ON participation.id=delivery.participation_id
     JOIN space_memberships membership ON membership.id=participation.membership_id
     JOIN users learner ON learner.id=membership.user_id
     JOIN assignment_versions version ON version.id=participation.assignment_version_id
     JOIN space_assignments assignment ON assignment.id=version.assignment_id
     JOIN spaces space ON space.id=assignment.space_id
     JOIN courses course ON course.id=assignment.course_id
     ORDER BY delivery.scheduled_at, delivery.id`,
    [at]
  )).rows;
  let sent = 0;
  let failed = 0;
  for (const delivery of due) {
    const recipient = delivery.kind === "escalation"
      ? delivery.manager_email ?? delivery.learner_email
      : delivery.learner_email;
    const subject = delivery.kind === "reminder"
      ? `Reminder: ${delivery.course_title}`
      : `Assignment escalation: ${delivery.course_title}`;
    const message = delivery.kind === "reminder"
      ? `${delivery.learner_name}'s assignment in ${delivery.space_name} is due ${delivery.due_at ?? "soon"}.`
      : `${delivery.learner_name}'s assignment in ${delivery.space_name} is overdue.`;
    try {
      const result = await send({
        to: recipient,
        subject,
        text: message,
        html: `<p>${escapeHtml(message)}</p>`,
        idempotencyKey: `assignment-delivery/${delivery.id}`,
      });
      await pool.query(
        `UPDATE assignment_delivery_events
         SET status='sent',sent_at=$2,provider_message_id=$3,error=NULL
         WHERE id=$1 AND status='sending'`,
        [delivery.id, nowIso(), result.id ?? result.mode]
      );
      sent += 1;
    } catch (error) {
      await pool.query(
        `UPDATE assignment_delivery_events SET status='failed',error=$2
         WHERE id=$1 AND status='sending'`,
        [delivery.id, error instanceof Error ? error.message.slice(0, 500) : "Delivery failed"]
      );
      failed += 1;
    }
  }
  return { due: due.length, sent, failed };
}
