import crypto from "crypto";
import {
  authorizeSpace,
  type AuthorizationDecision,
  type MembershipStatus,
  type SpaceCapability,
  type SpaceRole,
  type SpaceStatus,
  type SpaceType,
} from "./space-authorization";
import { many, one, tx, type Queryable } from "./pg";

const nowIso = () => new Date().toISOString();

export interface SpaceRow {
  id: string;
  type: SpaceType;
  status: SpaceStatus;
  preset: "class" | null;
  name: string;
  description: string;
  personal_owner_user_id: number | null;
  parent_space_id: string | null;
  discovery_policy: "owner_only" | "hidden" | "unlisted" | "organization" | "public";
  entry_policy: "owner_only" | "invitation" | "approval" | "managed" | "open" | "moderated";
  member_directory_policy: "owner_only" | "managers" | "members" | "public";
  content_sharing_policy: "owner_only" | "members" | "organization" | "public";
  join_code_enabled: number;
  language: string;
  timezone: string;
  profile_json: string;
  branding_json: string;
  policy_version: number;
  created_at: string;
  updated_at: string;
  deletion_scheduled_at: string | null;
}

export interface SpaceMembershipRow {
  id: string;
  space_id: string;
  user_id: number;
  status: MembershipStatus;
  role: SpaceRole;
  invited_by_user_id: number | null;
  invitation_id: string | null;
  policy_version: number;
  expires_at: string | null;
  joined_at: string | null;
  suspended_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpaceInvitationRow {
  id: string;
  space_id: string;
  invitee_user_id: number | null;
  role: Exclude<SpaceRole, "owner">;
  status: "pending" | "accepted" | "revoked" | "expired";
  created_by_user_id: number;
  policy_version: number;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface SpaceAssignmentRow {
  id: string;
  space_id: string;
  course_id: number;
  course_version: number;
  status: "draft" | "active" | "closed" | "archived";
  assigned_by_user_id: number;
  policy_version: number;
  due_at: string | null;
  current_version_id?: string | null;
  start_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningSpaceContext {
  spaceId: string;
  membershipId: string;
  assignmentId: string | null;
  policyVersion: number;
  basis: "assignment" | "personal";
}

export interface SpaceDashboard {
  space: SpaceRow;
  membership: SpaceMembershipRow;
  members: Array<SpaceMembershipRow & { name: string; email: string }> | null;
  courses: Array<{ id: number; title: string; status: string; attached_at: string }>;
  assignments: SpaceAssignmentRow[];
  teams: Array<{ id: string; name: string; status: "active" | "archived"; member_count: number }>;
}

export class SpaceAccessError extends Error {
  constructor(public readonly reason: string) {
    super("Space access denied");
    this.name = "SpaceAccessError";
  }
}

export class SpaceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpaceConflictError";
  }
}

export class InvitationError extends Error {
  constructor(public readonly reason: "invitation_invalid" | "invitation_expired") {
    super(reason === "invitation_expired" ? "Invitation expired" : "Invitation invalid");
    this.name = "InvitationError";
  }
}

function invitationHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function recordSpaceAudit(
  exec: Queryable,
  input: {
    eventType: string;
    space: SpaceRow;
    actorUserId?: number | null;
    subjectUserId?: number | null;
    membershipId?: string | null;
    invitationId?: string | null;
    courseId?: number | null;
    assignmentId?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  }
) {
  await exec.query(
    `INSERT INTO space_audit_events
      (event_type, space_id, actor_user_id, subject_user_id, membership_id,
       invitation_id, course_id, assignment_id, policy_version, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.eventType,
      input.space.id,
      input.actorUserId ?? null,
      input.subjectUserId ?? null,
      input.membershipId ?? null,
      input.invitationId ?? null,
      input.courseId ?? null,
      input.assignmentId ?? null,
      input.space.policy_version,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

export async function ensurePersonalSpaceForUser(
  userId: number,
  userName: string,
  exec: Queryable
): Promise<{ space: SpaceRow; membership: SpaceMembershipRow }> {
  await exec.query(
    `INSERT INTO spaces
      (type, name, personal_owner_user_id, discovery_policy, entry_policy,
       member_directory_policy, content_sharing_policy)
     VALUES ('personal', $2, $1, 'owner_only', 'owner_only', 'owner_only', 'owner_only')
     ON CONFLICT (personal_owner_user_id) DO NOTHING`,
    [userId, `${userName.trim() || "My"}'s Space`]
  );
  const space = (
    await exec.query<SpaceRow>(
      "SELECT * FROM spaces WHERE personal_owner_user_id = $1",
      [userId]
    )
  ).rows[0];
  if (!space) throw new Error("Could not create personal Space");
  await exec.query(
    `INSERT INTO space_memberships
      (space_id, user_id, status, role, policy_version, joined_at)
     VALUES ($1, $2, 'active', 'owner', $3, $4)
     ON CONFLICT (space_id, user_id) DO NOTHING`,
    [space.id, userId, space.policy_version, nowIso()]
  );
  const membership = (
    await exec.query<SpaceMembershipRow>(
      "SELECT * FROM space_memberships WHERE space_id = $1 AND user_id = $2",
      [space.id, userId]
    )
  ).rows[0];
  if (!membership) throw new Error("Could not create personal Space membership");
  return { space, membership };
}

export async function getSpace(
  spaceId: string,
  exec?: Queryable
): Promise<SpaceRow | undefined> {
  return one<SpaceRow>("SELECT * FROM spaces WHERE id = $1", [spaceId], exec);
}

export async function getSpaceMembership(
  spaceId: string,
  userId: number,
  exec?: Queryable
): Promise<SpaceMembershipRow | undefined> {
  return one<SpaceMembershipRow>(
    "SELECT * FROM space_memberships WHERE space_id = $1 AND user_id = $2",
    [spaceId, userId],
    exec
  );
}

export async function listSpacesForUser(userId: number): Promise<
  { space: SpaceRow; membership: SpaceMembershipRow }[]
> {
  return many(
    `SELECT row_to_json(s) AS space, row_to_json(m) AS membership
     FROM spaces s
     JOIN space_memberships m ON m.space_id = s.id
     WHERE m.user_id = $1 AND m.status <> 'removed'
     ORDER BY (s.type = 'personal') DESC, s.created_at`,
    [userId]
  ) as Promise<{ space: SpaceRow; membership: SpaceMembershipRow }[]>;
}

export async function getSpaceDashboard(
  userId: number,
  spaceId: string
): Promise<SpaceDashboard> {
  return tx(async (client) => {
    const { space, membership } = await authorizeStoredMembership(
      userId,
      spaceId,
      "space.read",
      client
    );
    const memberDecision = authorizeSpace({
      userId,
      capability: "members.read",
      space: { id: space.id, type: space.type, status: space.status },
      membership: {
        spaceId: membership.space_id,
        userId: membership.user_id,
        status: membership.status,
        role: membership.role,
        expiresAt: membership.expires_at,
      },
    });
    const members = memberDecision.allowed
      ? (
          await client.query<SpaceMembershipRow & { name: string; email: string }>(
            `SELECT m.*, u.name, u.email
             FROM space_memberships m
             JOIN users u ON u.id = m.user_id
             WHERE m.space_id = $1 AND m.status <> 'removed'
             ORDER BY (m.role = 'owner') DESC, u.name`,
            [spaceId]
          )
        ).rows
      : null;
    const courses = (
      await client.query<{ id: number; title: string; status: string; attached_at: string }>(
        `SELECT c.id, c.title, c.status, sc.attached_at
         FROM space_courses sc
         JOIN courses c ON c.id = sc.course_id
         WHERE sc.space_id = $1
         ORDER BY sc.attached_at DESC`,
        [spaceId]
      )
    ).rows;
    const assignments = (
      await client.query<SpaceAssignmentRow>(
        `SELECT * FROM space_assignments
         WHERE space_id = $1 AND status <> 'archived'
         ORDER BY created_at DESC`,
        [spaceId]
      )
    ).rows;
    const teams = (
      await client.query<{ id: string; name: string; status: "active" | "archived"; member_count: number }>(
        `SELECT t.id, t.name, t.status, COUNT(tm.membership_id)::int AS member_count
         FROM space_teams t
         LEFT JOIN space_team_members tm ON tm.team_id = t.id
         WHERE t.space_id = $1 AND t.status = 'active'
         GROUP BY t.id ORDER BY t.name`,
        [spaceId]
      )
    ).rows;
    return { space, membership, members, courses, assignments, teams };
  });
}

export async function createSpaceTeam(
  actorUserId: number,
  spaceId: string,
  nameInput: string
): Promise<{ id: string; space_id: string; name: string; status: "active" }> {
  const name = nameInput.trim();
  if (name.length < 2 || name.length > 80) {
    throw new SpaceConflictError("Team name must be between 2 and 80 characters");
  }
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "members.manage", client);
    const team = (
      await client.query<{ id: string; space_id: string; name: string; status: "active" }>(
        `INSERT INTO space_teams (space_id, name, created_by_user_id)
         VALUES ($1, $2, $3) RETURNING id, space_id, name, status`,
        [spaceId, name, actorUserId]
      )
    ).rows[0];
    await recordSpaceAudit(client, {
      eventType: "team.created",
      space,
      actorUserId,
      metadata: { team_id: team.id, name },
    });
    return team;
  });
}

export async function addSpaceTeamMember(
  actorUserId: number,
  spaceId: string,
  teamId: string,
  subjectUserId: number
): Promise<void> {
  await tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "members.manage", client);
    const row = (
      await client.query<{ team_id: string; membership_id: string }>(
        `SELECT t.id AS team_id, m.id AS membership_id
         FROM space_teams t
         JOIN space_memberships m ON m.space_id = t.space_id
         WHERE t.id = $1 AND t.space_id = $2 AND t.status = 'active'
           AND m.user_id = $3 AND m.status = 'active'`,
        [teamId, spaceId, subjectUserId]
      )
    ).rows[0];
    if (!row) throw new SpaceAccessError("wrong_space");
    const added = await client.query(
      `INSERT INTO space_team_members (team_id, membership_id, added_by_user_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [row.team_id, row.membership_id, actorUserId]
    );
    if (added.rowCount === 1) {
      const assignments = (await client.query<{
        assignment_id: string;
        assignment_version_id: string;
        due_at: string | null;
        reminder_policy_json: string;
        escalation_policy_json: string;
      }>(
        `SELECT assignment.id AS assignment_id, version.id AS assignment_version_id,
                version.due_at, version.reminder_policy_json, version.escalation_policy_json
         FROM assignment_targets target
         JOIN assignment_versions version ON version.id=target.assignment_version_id
         JOIN space_assignments assignment ON assignment.current_version_id=version.id
         WHERE target.target_type='team' AND target.team_id=$1
           AND assignment.status='active'
           AND NOT EXISTS (
             SELECT 1 FROM assignment_participations participation
             WHERE participation.assignment_version_id=version.id
               AND participation.membership_id=$2
           )`,
        [teamId, row.membership_id]
      )).rows;
      for (const assignment of assignments) {
        const at = nowIso();
        await client.query(
          `INSERT INTO space_assignment_members (assignment_id,membership_id,assigned_at)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [assignment.assignment_id, row.membership_id, at]
        );
        await client.query(
          `INSERT INTO assignment_audience_events
            (assignment_version_id,membership_id,event_type,reason,actor_user_id,occurred_at)
           VALUES ($1,$2,'assigned','Added to targeted team',$3,$4)`,
          [assignment.assignment_version_id, row.membership_id, actorUserId, at]
        );
        const participation = (await client.query<{ id: string }>(
          `INSERT INTO assignment_participations
            (assignment_version_id,membership_id,status,assigned_at)
           VALUES ($1,$2,'assigned',$3) RETURNING id`,
          [assignment.assignment_version_id, row.membership_id, at]
        )).rows[0];
        await client.query(
          `INSERT INTO assignment_participation_events
            (participation_id,event_type,actor_user_id,metadata_json,occurred_at)
           VALUES ($1,'assigned',$2,$3,$4)`,
          [participation.id, actorUserId, JSON.stringify({ reason: "Added to targeted team" }), at]
        );
        if (assignment.due_at) {
          const reminders = (JSON.parse(assignment.reminder_policy_json) as { hours_before_due?: number[] }).hours_before_due ?? [];
          const escalations = (JSON.parse(assignment.escalation_policy_json) as { hours_after_due?: number[] }).hours_after_due ?? [];
          for (const [index, hours] of reminders.entries()) await client.query(
            `INSERT INTO assignment_delivery_events (participation_id,kind,sequence,scheduled_at)
             VALUES ($1,'reminder',$2,$3)`,
            [participation.id, index + 1, new Date(Date.parse(assignment.due_at) - hours * 3_600_000).toISOString()]
          );
          for (const [index, hours] of escalations.entries()) await client.query(
            `INSERT INTO assignment_delivery_events (participation_id,kind,sequence,scheduled_at)
             VALUES ($1,'escalation',$2,$3)`,
            [participation.id, index + 1, new Date(Date.parse(assignment.due_at) + hours * 3_600_000).toISOString()]
          );
        }
      }
    }
    await recordSpaceAudit(client, {
      eventType: "team.member_added",
      space,
      actorUserId,
      subjectUserId,
      membershipId: row.membership_id,
      metadata: { team_id: teamId },
    });
  });
}

export async function removeSpaceTeamMember(
  actorUserId: number,
  spaceId: string,
  teamId: string,
  subjectUserId: number
): Promise<void> {
  await tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "members.manage", client);
    const removed = (
      await client.query<{ membership_id: string }>(
        `DELETE FROM space_team_members tm
         USING space_teams t, space_memberships m
         WHERE tm.team_id = t.id AND tm.membership_id = m.id
           AND t.id = $1 AND t.space_id = $2 AND m.user_id = $3
         RETURNING tm.membership_id`,
        [teamId, spaceId, subjectUserId]
      )
    ).rows[0];
    if (!removed) throw new SpaceAccessError("wrong_space");
    const noLongerTargeted = (await client.query<{
      assignment_id: string;
      assignment_version_id: string;
      participation_id: string;
      participation_status: string;
    }>(
      `SELECT assignment.id AS assignment_id, version.id AS assignment_version_id,
              participation.id AS participation_id, participation.status AS participation_status
       FROM assignment_targets removed_target
       JOIN assignment_versions version ON version.id=removed_target.assignment_version_id
       JOIN space_assignments assignment ON assignment.current_version_id=version.id
       JOIN assignment_participations participation
         ON participation.assignment_version_id=version.id
        AND participation.membership_id=$2
       WHERE removed_target.target_type='team' AND removed_target.team_id=$1
         AND assignment.status='active'
         AND NOT EXISTS (
           SELECT 1 FROM assignment_targets target
           WHERE target.assignment_version_id=version.id AND (
             target.target_type='space' OR
             (target.target_type='membership' AND target.membership_id=$2) OR
             (target.target_type='team' AND target.team_id<>$1 AND EXISTS (
               SELECT 1 FROM space_team_members remaining
               WHERE remaining.team_id=target.team_id AND remaining.membership_id=$2
             ))
           )
         )`,
      [teamId, removed.membership_id]
    )).rows;
    for (const assignment of noLongerTargeted) {
      const at = nowIso();
      await client.query(
        `INSERT INTO assignment_audience_events
          (assignment_version_id,membership_id,event_type,reason,actor_user_id,occurred_at)
         VALUES ($1,$2,'removed','Removed from targeted team',$3,$4)`,
        [assignment.assignment_version_id, removed.membership_id, actorUserId, at]
      );
      if (["assigned", "started", "submitted"].includes(assignment.participation_status)) {
        await client.query("UPDATE assignment_participations SET status='revoked' WHERE id=$1", [assignment.participation_id]);
        await client.query(
          `INSERT INTO assignment_participation_events
            (participation_id,event_type,actor_user_id,metadata_json,occurred_at)
           VALUES ($1,'revoked',$2,$3,$4)`,
          [assignment.participation_id, actorUserId, JSON.stringify({ reason: "Removed from targeted team" }), at]
        );
        await client.query(
          `UPDATE assignment_delivery_events SET status='cancelled'
           WHERE participation_id=$1 AND status IN ('scheduled','sending')`,
          [assignment.participation_id]
        );
      }
      await client.query(
        "DELETE FROM space_assignment_members WHERE assignment_id=$1 AND membership_id=$2",
        [assignment.assignment_id, removed.membership_id]
      );
    }
    await recordSpaceAudit(client, {
      eventType: "team.member_removed",
      space,
      actorUserId,
      subjectUserId,
      membershipId: removed.membership_id,
      metadata: { team_id: teamId },
    });
  });
}

export async function listPublicSpaces(): Promise<
  Array<Pick<SpaceRow, "id" | "name" | "description" | "type" | "language" | "profile_json" | "branding_json">>
> {
  return many(
    `SELECT id, name, description, type, language, profile_json, branding_json
     FROM spaces
     WHERE type = 'public' AND status = 'active' AND discovery_policy = 'public'
     ORDER BY created_at DESC`
  ) as Promise<Array<Pick<SpaceRow, "id" | "name" | "description" | "type" | "language" | "profile_json" | "branding_json">>>;
}

export async function updateSpaceProfile(
  actorUserId: number,
  spaceId: string,
  input: {
    name?: string;
    description?: string;
    language?: string;
    timezone?: string;
    profile?: Record<string, unknown>;
    branding?: Record<string, unknown>;
    parentSpaceId?: string | null;
  }
): Promise<SpaceRow> {
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "space.update", client);
    const name = input.name === undefined ? space.name : input.name.trim();
    if (name.length < 2 || name.length > 120) {
      throw new SpaceConflictError("Space name must be between 2 and 120 characters");
    }
    if (input.description !== undefined && input.description.length > 2_000) {
      throw new SpaceConflictError("Space description is too long");
    }
    if (input.parentSpaceId !== undefined) {
      if (space.type === "personal" && input.parentSpaceId !== null) {
        throw new SpaceConflictError("A personal Space cannot be a child Space");
      }
      if (input.parentSpaceId === spaceId) throw new SpaceConflictError("A Space cannot contain itself");
      if (input.parentSpaceId) {
        await authorizeStoredMembership(actorUserId, input.parentSpaceId, "space.update", client);
        const cycle = (
          await client.query<{ found: number }>(
            `WITH RECURSIVE ancestors AS (
               SELECT id, parent_space_id FROM spaces WHERE id = $1
               UNION ALL
               SELECT s.id, s.parent_space_id FROM spaces s
               JOIN ancestors a ON s.id = a.parent_space_id
             )
             SELECT 1 AS found FROM ancestors WHERE id = $2 LIMIT 1`,
            [input.parentSpaceId, spaceId]
          )
        ).rows[0];
        if (cycle) throw new SpaceConflictError("This parent would create a Space cycle");
      }
    }
    const updated = (
      await client.query<SpaceRow>(
        `UPDATE spaces SET
           name = $2,
           description = COALESCE($3, description),
           language = COALESCE($4, language),
           timezone = COALESCE($5, timezone),
           profile_json = COALESCE($6, profile_json),
           branding_json = COALESCE($7, branding_json),
           parent_space_id = CASE WHEN $8 THEN $9 ELSE parent_space_id END,
           updated_at = $10
         WHERE id = $1 RETURNING *`,
        [
          spaceId,
          name,
          input.description ?? null,
          input.language?.trim() || null,
          input.timezone?.trim() || null,
          input.profile === undefined ? null : JSON.stringify(input.profile),
          input.branding === undefined ? null : JSON.stringify(input.branding),
          input.parentSpaceId !== undefined,
          input.parentSpaceId ?? null,
          nowIso(),
        ]
      )
    ).rows[0];
    await recordSpaceAudit(client, {
      eventType: "space.profile_updated",
      space: updated,
      actorUserId,
      metadata: { parent_changed: input.parentSpaceId !== undefined },
    });
    return updated;
  });
}

export async function updateSpacePolicies(
  actorUserId: number,
  spaceId: string,
  input: Partial<Pick<SpaceRow, "discovery_policy" | "entry_policy" | "member_directory_policy" | "content_sharing_policy">>
): Promise<SpaceRow> {
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    if (space.type === "personal") throw new SpaceConflictError("Personal Space policies are fixed");
    const updated = (
      await client.query<SpaceRow>(
        `UPDATE spaces SET
           discovery_policy = COALESCE($2, discovery_policy),
           entry_policy = COALESCE($3, entry_policy),
           member_directory_policy = COALESCE($4, member_directory_policy),
           content_sharing_policy = COALESCE($5, content_sharing_policy),
           policy_version = policy_version + 1,
           updated_at = $6
         WHERE id = $1 RETURNING *`,
        [
          spaceId,
          input.discovery_policy ?? null,
          input.entry_policy ?? null,
          input.member_directory_policy ?? null,
          input.content_sharing_policy ?? null,
          nowIso(),
        ]
      )
    ).rows[0];
    await recordSpaceAudit(client, {
      eventType: "space.policy_updated",
      space: updated,
      actorUserId,
      metadata: { previous_policy_version: space.policy_version },
    });
    return updated;
  });
}

export async function updateSpaceLifecycle(
  actorUserId: number,
  spaceId: string,
  status: Exclude<SpaceStatus, "deletion_scheduled"> | "deletion_scheduled"
): Promise<SpaceRow> {
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "space.manage_lifecycle", client);
    if (space.type === "personal" && status !== "active") {
      throw new SpaceConflictError("Personal Spaces follow the account lifecycle");
    }
    if (status === "deletion_scheduled") {
      const hold = await client.query(
        "SELECT 1 FROM space_legal_holds WHERE space_id=$1 AND status='active' LIMIT 1",
        [spaceId]
      );
      if (hold.rowCount) throw new SpaceConflictError("Release active legal holds before scheduling Space deletion");
    }
    const at = nowIso();
    const updated = (
      await client.query<SpaceRow>(
        `UPDATE spaces SET status = $2,
           deletion_scheduled_at = CASE WHEN $2 = 'deletion_scheduled' THEN $3 ELSE NULL END,
           updated_at = $3
         WHERE id = $1 RETURNING *`,
        [spaceId, status, at]
      )
    ).rows[0];
    await recordSpaceAudit(client, {
      eventType: "space.lifecycle_changed",
      space: updated,
      actorUserId,
      metadata: { previous_status: space.status, status },
    });
    return updated;
  });
}

export async function exportSpaceBundle(actorUserId: number, spaceId: string) {
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "space.manage_lifecycle", client);
    const memberships = (await client.query(
      `SELECT m.id, m.user_id, m.status, m.role, m.joined_at, m.created_at,
              u.name, u.email
       FROM space_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.space_id = $1 ORDER BY m.created_at`,
      [spaceId]
    )).rows;
    const courses = (await client.query(
      `SELECT c.id, c.title, c.status, c.content_version, sc.attached_at
       FROM space_courses sc JOIN courses c ON c.id = sc.course_id
       WHERE sc.space_id = $1 ORDER BY sc.attached_at`,
      [spaceId]
    )).rows;
    const assignments = (await client.query(
      "SELECT * FROM space_assignments WHERE space_id = $1 ORDER BY created_at",
      [spaceId]
    )).rows;
    const audit = (await client.query(
      `SELECT event_type, actor_user_id, subject_user_id, membership_id,
              invitation_id, course_id, assignment_id, policy_version,
              metadata_json, occurred_at
       FROM space_audit_events WHERE space_id = $1 ORDER BY occurred_at`,
      [spaceId]
    )).rows;
    await recordSpaceAudit(client, { eventType: "space.exported", space, actorUserId });
    return {
      schemaVersion: 1,
      exportedAt: nowIso(),
      space,
      memberships,
      courses,
      assignments,
      audit,
    };
  });
}

export async function authorizeStoredMembership(
  userId: number,
  spaceId: string,
  capability: SpaceCapability,
  exec: Queryable
): Promise<{ space: SpaceRow; membership: SpaceMembershipRow; decision: AuthorizationDecision }> {
  const space = (
    await exec.query<SpaceRow>("SELECT * FROM spaces WHERE id = $1", [spaceId])
  ).rows[0];
  const membership = (
    await exec.query<SpaceMembershipRow>(
      "SELECT * FROM space_memberships WHERE space_id = $1 AND user_id = $2",
      [spaceId, userId]
    )
  ).rows[0];
  if (!space) throw new SpaceAccessError("membership_required");
  const decision = authorizeSpace({
    userId,
    capability,
    space: { id: space.id, type: space.type, status: space.status },
    membership: membership
      ? {
          spaceId: membership.space_id,
          userId: membership.user_id,
          status: membership.status,
          role: membership.role,
          expiresAt: membership.expires_at,
        }
      : null,
  });
  if (!decision.allowed) throw new SpaceAccessError(decision.reason);
  return { space, membership: membership!, decision };
}

export async function createSpace(
  ownerUserId: number,
  input: { name: string; type?: Exclude<SpaceType, "personal">; timezone?: string; language?: string }
): Promise<{ space: SpaceRow; membership: SpaceMembershipRow }> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) {
    throw new SpaceConflictError("Space name must be between 2 and 120 characters");
  }
  return tx(async (client) => {
    const type = input.type ?? "private";
    const defaults =
      type === "public"
        ? ["public", "open", "public", "public"]
        : type === "unlisted"
          ? ["unlisted", "invitation", "members", "members"]
          : type === "organization"
            ? ["organization", "managed", "members", "organization"]
            : ["hidden", "invitation", "members", "members"];
    const space = (
      await client.query<SpaceRow>(
        `INSERT INTO spaces
          (type, name, discovery_policy, entry_policy, member_directory_policy,
           content_sharing_policy, timezone, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          type,
          name,
          ...defaults,
          input.timezone?.trim() || "UTC",
          input.language?.trim() || "en",
        ]
      )
    ).rows[0];
    const membership = (
      await client.query<SpaceMembershipRow>(
        `INSERT INTO space_memberships
          (space_id, user_id, status, role, policy_version, joined_at)
         VALUES ($1, $2, 'active', 'owner', $3, $4)
         RETURNING *`,
        [space.id, ownerUserId, space.policy_version, nowIso()]
      )
    ).rows[0];
    if (type === "organization") {
      const defaultPolicy = JSON.stringify({
        minimum_password_length: 12,
        session_max_days: 30,
        require_mfa_roles: [],
        retention_days: 2555,
        legal_hold_enabled: true,
      });
      const policy = (await client.query<{ id: string }>(
        `INSERT INTO space_policy_versions
          (space_id,version,status,policy_json,content_hash,created_by_user_id,published_at)
         VALUES ($1,1,'published',$2,$3,$4,$5) RETURNING id`,
        [space.id, defaultPolicy,
         crypto.createHash("sha256").update(defaultPolicy).digest("hex"),
         ownerUserId, nowIso()]
      )).rows[0];
      await client.query(
        "UPDATE spaces SET current_policy_version_id=$2 WHERE id=$1",
        [space.id, policy.id]
      );
    }
    await recordSpaceAudit(client, {
      eventType: "space.created",
      space,
      actorUserId: ownerUserId,
      subjectUserId: ownerUserId,
      membershipId: membership.id,
      metadata: { type },
    });
    return { space, membership };
  });
}

export async function inviteSpaceMember(
  actorUserId: number,
  spaceId: string,
  inviteeUserId: number,
  role: Exclude<SpaceRole, "owner"> = "learner",
  expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
): Promise<{ invitation: SpaceInvitationRow; token: string }> {
  if (new Date(expiresAt).getTime() <= Date.now()) {
    throw new SpaceConflictError("Invitation expiry must be in the future");
  }
  const token = crypto.randomBytes(32).toString("base64url");
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(
      actorUserId,
      spaceId,
      "members.invite",
      client
    );
    const existing = (
      await client.query<SpaceMembershipRow>(
        "SELECT * FROM space_memberships WHERE space_id = $1 AND user_id = $2 FOR UPDATE",
        [spaceId, inviteeUserId]
      )
    ).rows[0];
    if (existing?.status === "active") {
      throw new SpaceConflictError("User is already an active member");
    }
    await client.query(
      `UPDATE space_invitations
       SET status = 'revoked', revoked_at = $3
       WHERE space_id = $1 AND invitee_user_id = $2 AND status = 'pending'`,
      [spaceId, inviteeUserId, nowIso()]
    );
    const invitation = (
      await client.query<SpaceInvitationRow>(
        `INSERT INTO space_invitations
          (space_id, invitee_user_id, token_hash, role, created_by_user_id,
           policy_version, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, space_id, invitee_user_id, role, status,
           created_by_user_id, policy_version, expires_at, accepted_at,
           revoked_at, created_at`,
        [
          spaceId,
          inviteeUserId,
          invitationHash(token),
          role,
          actorUserId,
          space.policy_version,
          expiresAt,
        ]
      )
    ).rows[0];
    const membership = (
      await client.query<SpaceMembershipRow>(
        `INSERT INTO space_memberships
          (space_id, user_id, status, role, invited_by_user_id, invitation_id,
           policy_version, expires_at, joined_at, suspended_at, removed_at, updated_at)
         VALUES ($1, $2, 'invited', $3, $4, $5, $6, $7, NULL, NULL, NULL, $8)
         ON CONFLICT (space_id, user_id) DO UPDATE SET
           status = 'invited', role = excluded.role,
           invited_by_user_id = excluded.invited_by_user_id,
           invitation_id = excluded.invitation_id,
           policy_version = excluded.policy_version,
           expires_at = excluded.expires_at,
           joined_at = NULL, suspended_at = NULL, removed_at = NULL,
           updated_at = excluded.updated_at
         RETURNING *`,
        [
          spaceId,
          inviteeUserId,
          role,
          actorUserId,
          invitation.id,
          space.policy_version,
          expiresAt,
          nowIso(),
        ]
      )
    ).rows[0];
    await recordSpaceAudit(client, {
      eventType: "membership.invited",
      space,
      actorUserId,
      subjectUserId: inviteeUserId,
      membershipId: membership.id,
      invitationId: invitation.id,
      metadata: { role, expires_at: expiresAt },
    });
    return { invitation, token };
  });
}

export async function bulkInviteSpaceMembers(
  actorUserId: number,
  spaceId: string,
  entries: Array<{ email: string; role: Exclude<SpaceRole, "owner"> }>,
  expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
) {
  if (entries.length < 1 || entries.length > 100) throw new SpaceConflictError("Bulk invitations require 1 to 100 entries");
  if (Date.parse(expiresAt) <= Date.now()) throw new SpaceConflictError("Invitation expiry must be in the future");
  const roles = new Set<SpaceRole>(["administrator", "creator", "reviewer", "manager", "learner", "auditor"]);
  const normalized = entries.map((entry) => ({ email: entry.email.trim().toLowerCase(), role: entry.role }));
  if (normalized.some((entry) => !entry.email || !roles.has(entry.role))) throw new SpaceConflictError("Bulk invitation contains an invalid email or role");
  if (new Set(normalized.map((entry) => entry.email)).size !== normalized.length) throw new SpaceConflictError("Bulk invitation contains duplicate emails");
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "members.invite", client);
    const users = (await client.query<{ id: number; email: string }>(
      "SELECT id,email FROM users WHERE lower(email)=ANY($1::text[])",
      [normalized.map((entry) => entry.email)]
    )).rows;
    const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
    const missing = normalized.filter((entry) => !userByEmail.has(entry.email));
    if (missing.length) throw new SpaceConflictError(`No account exists for ${missing[0].email}`);
    const results: Array<{ email: string; invitation: SpaceInvitationRow; token: string }> = [];
    for (const entry of normalized) {
      const invitee = userByEmail.get(entry.email)!;
      const existing = (await client.query<SpaceMembershipRow>(
        "SELECT * FROM space_memberships WHERE space_id=$1 AND user_id=$2 FOR UPDATE",
        [spaceId, invitee.id]
      )).rows[0];
      if (existing?.status === "active") throw new SpaceConflictError(`${entry.email} is already an active member`);
      const at = nowIso();
      await client.query(
        `UPDATE space_invitations SET status='revoked',revoked_at=$3
         WHERE space_id=$1 AND invitee_user_id=$2 AND status='pending'`,
        [spaceId, invitee.id, at]
      );
      const token = crypto.randomBytes(32).toString("base64url");
      const invitation = (await client.query<SpaceInvitationRow>(
        `INSERT INTO space_invitations
          (space_id,invitee_user_id,token_hash,role,created_by_user_id,policy_version,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,space_id,invitee_user_id,role,status,created_by_user_id,
                   policy_version,expires_at,accepted_at,revoked_at,created_at`,
        [spaceId, invitee.id, invitationHash(token), entry.role, actorUserId,
         space.policy_version, expiresAt]
      )).rows[0];
      const membership = (await client.query<SpaceMembershipRow>(
        `INSERT INTO space_memberships
          (space_id,user_id,status,role,invited_by_user_id,invitation_id,
           policy_version,expires_at,updated_at)
         VALUES ($1,$2,'invited',$3,$4,$5,$6,$7,$8)
         ON CONFLICT (space_id,user_id) DO UPDATE SET
           status='invited',role=excluded.role,invited_by_user_id=excluded.invited_by_user_id,
           invitation_id=excluded.invitation_id,policy_version=excluded.policy_version,
           expires_at=excluded.expires_at,joined_at=NULL,suspended_at=NULL,removed_at=NULL,
           updated_at=excluded.updated_at RETURNING *`,
        [spaceId, invitee.id, entry.role, actorUserId, invitation.id,
         space.policy_version, expiresAt, at]
      )).rows[0];
      await recordSpaceAudit(client, {
        eventType: "membership.invited",
        space,
        actorUserId,
        subjectUserId: invitee.id,
        membershipId: membership.id,
        invitationId: invitation.id,
        metadata: { role: entry.role, expires_at: expiresAt, bulk: true },
      });
      results.push({ email: entry.email, invitation, token });
    }
    return results;
  });
}

export async function acceptSpaceInvitation(
  userId: number,
  token: string
): Promise<{ space: SpaceRow; membership: SpaceMembershipRow }> {
  const result = await tx(async (client) => {
    const invitation = (
      await client.query<SpaceInvitationRow>(
        `SELECT id, space_id, invitee_user_id, role, status,
           created_by_user_id, policy_version, expires_at, accepted_at,
           revoked_at, created_at
         FROM space_invitations WHERE token_hash = $1 FOR UPDATE`,
        [invitationHash(token)]
      )
    ).rows[0];
    if (!invitation || invitation.status !== "pending" || invitation.invitee_user_id !== userId) {
      return { error: "invitation_invalid" as const };
    }
    const space = (
      await client.query<SpaceRow>("SELECT * FROM spaces WHERE id = $1", [
        invitation.space_id,
      ])
    ).rows[0];
    if (!space || new Date(invitation.expires_at).getTime() <= Date.now()) {
      await client.query(
        "UPDATE space_invitations SET status = 'expired' WHERE id = $1",
        [invitation.id]
      );
      await client.query(
        `UPDATE space_memberships SET status = 'expired', updated_at = $2
         WHERE invitation_id = $1 AND status = 'invited'`,
        [invitation.id, nowIso()]
      );
      return { error: "invitation_expired" as const };
    }
    const acceptedAt = nowIso();
    await client.query(
      "UPDATE space_invitations SET status = 'accepted', accepted_at = $2 WHERE id = $1",
      [invitation.id, acceptedAt]
    );
    const membership = (
      await client.query<SpaceMembershipRow>(
        `UPDATE space_memberships
         SET status = 'active', role = $3, policy_version = $4,
             expires_at = NULL, joined_at = $5, removed_at = NULL,
             suspended_at = NULL, updated_at = $5
         WHERE space_id = $1 AND user_id = $2 AND invitation_id = $6
         RETURNING *`,
        [
          space.id,
          userId,
          invitation.role,
          space.policy_version,
          acceptedAt,
          invitation.id,
        ]
      )
    ).rows[0];
    if (!membership) return { error: "invitation_invalid" as const };
    await client.query(
      `INSERT INTO space_assignment_members (assignment_id, membership_id)
       SELECT id, $1 FROM space_assignments
       WHERE space_id = $2 AND status = 'active'
       ON CONFLICT DO NOTHING`,
      [membership.id, space.id]
    );
    await recordSpaceAudit(client, {
      eventType: "membership.activated",
      space,
      actorUserId: userId,
      subjectUserId: userId,
      membershipId: membership.id,
      invitationId: invitation.id,
      metadata: { role: membership.role },
    });
    return { space, membership };
  });
  if ("error" in result) {
    throw new InvitationError(result.error ?? "invitation_invalid");
  }
  return result;
}

export async function removeSpaceMember(
  actorUserId: number,
  spaceId: string,
  subjectUserId: number
): Promise<void> {
  await tx(async (client) => {
    const { space } = await authorizeStoredMembership(
      actorUserId,
      spaceId,
      "members.manage",
      client
    );
    const target = (
      await client.query<SpaceMembershipRow>(
        "SELECT * FROM space_memberships WHERE space_id = $1 AND user_id = $2 FOR UPDATE",
        [spaceId, subjectUserId]
      )
    ).rows[0];
    if (!target || target.status !== "active") {
      throw new SpaceAccessError("membership_inactive");
    }
    if (target.role === "owner") {
      throw new SpaceConflictError("The Space owner cannot be removed");
    }
    const removedAt = nowIso();
    const assignmentHistory = (await client.query<{
      assignment_id: string;
      assignment_version_id: string;
      participation_id: string;
      participation_status: string;
    }>(
      `SELECT assignment.id AS assignment_id, version.id AS assignment_version_id,
              participation.id AS participation_id,
              participation.status AS participation_status
       FROM space_assignments assignment
       JOIN assignment_versions version ON version.id=assignment.current_version_id
       JOIN assignment_participations participation
         ON participation.assignment_version_id=version.id
       WHERE assignment.space_id=$1 AND participation.membership_id=$2`,
      [spaceId, target.id]
    )).rows;
    await client.query(
      `UPDATE space_memberships
       SET status = 'removed', removed_at = $3, expires_at = NULL, updated_at = $3
       WHERE space_id = $1 AND user_id = $2`,
      [spaceId, subjectUserId, removedAt]
    );
    for (const history of assignmentHistory) {
      await client.query(
        `INSERT INTO assignment_audience_events
          (assignment_version_id,membership_id,event_type,reason,actor_user_id,occurred_at)
         VALUES ($1,$2,'removed','Space membership removed',$3,$4)`,
        [history.assignment_version_id, target.id, actorUserId, removedAt]
      );
      if (["assigned", "started", "submitted"].includes(history.participation_status)) {
        await client.query(
          "UPDATE assignment_participations SET status='revoked' WHERE id=$1",
          [history.participation_id]
        );
        await client.query(
          `INSERT INTO assignment_participation_events
            (participation_id,event_type,actor_user_id,metadata_json,occurred_at)
           VALUES ($1,'revoked',$2,$3,$4)`,
          [history.participation_id, actorUserId,
           JSON.stringify({ reason: "Space membership removed" }), removedAt]
        );
        await client.query(
          `UPDATE assignment_delivery_events SET status='cancelled'
           WHERE participation_id=$1 AND status IN ('scheduled','sending')`,
          [history.participation_id]
        );
      }
      await client.query(
        "DELETE FROM space_assignment_members WHERE assignment_id=$1 AND membership_id=$2",
        [history.assignment_id, target.id]
      );
    }
    await recordSpaceAudit(client, {
      eventType: "membership.removed",
      space,
      actorUserId,
      subjectUserId,
      membershipId: target.id,
    });
  });
}

export async function updateSpaceMemberRole(
  actorUserId: number,
  spaceId: string,
  subjectUserId: number,
  role: Exclude<SpaceRole, "owner">
): Promise<SpaceMembershipRow> {
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(
      actorUserId,
      spaceId,
      "members.manage",
      client
    );
    const target = (
      await client.query<SpaceMembershipRow>(
        "SELECT * FROM space_memberships WHERE space_id = $1 AND user_id = $2 FOR UPDATE",
        [spaceId, subjectUserId]
      )
    ).rows[0];
    if (!target || target.status !== "active") throw new SpaceAccessError("membership_inactive");
    if (target.role === "owner") throw new SpaceConflictError("The Space owner role cannot be changed");
    const updated = (
      await client.query<SpaceMembershipRow>(
        `UPDATE space_memberships SET role = $3, updated_at = $4
         WHERE space_id = $1 AND user_id = $2 RETURNING *`,
        [spaceId, subjectUserId, role, nowIso()]
      )
    ).rows[0];
    await recordSpaceAudit(client, {
      eventType: "membership.role_changed",
      space,
      actorUserId,
      subjectUserId,
      membershipId: updated.id,
      metadata: { previous_role: target.role, role },
    });
    return updated;
  });
}

export async function revokeSpaceInvitation(
  actorUserId: number,
  spaceId: string,
  invitationId: string
): Promise<void> {
  await tx(async (client) => {
    const { space } = await authorizeStoredMembership(
      actorUserId,
      spaceId,
      "members.invite",
      client
    );
    const invitation = (
      await client.query<SpaceInvitationRow>(
        `SELECT id, space_id, invitee_user_id, role, status, created_by_user_id,
           policy_version, expires_at, accepted_at, revoked_at, created_at
         FROM space_invitations
         WHERE id = $1 AND space_id = $2 FOR UPDATE`,
        [invitationId, spaceId]
      )
    ).rows[0];
    if (!invitation || invitation.status !== "pending") {
      throw new InvitationError("invitation_invalid");
    }
    const revokedAt = nowIso();
    await client.query(
      "UPDATE space_invitations SET status = 'revoked', revoked_at = $2 WHERE id = $1",
      [invitation.id, revokedAt]
    );
    await client.query(
      `UPDATE space_memberships SET status = 'removed', removed_at = $2, updated_at = $2
       WHERE invitation_id = $1 AND status = 'invited'`,
      [invitation.id, revokedAt]
    );
    await recordSpaceAudit(client, {
      eventType: "invitation.revoked",
      space,
      actorUserId,
      subjectUserId: invitation.invitee_user_id,
      invitationId: invitation.id,
    });
  });
}

/** Legacy class codes remain available only on migrated class-preset Spaces
 * whose explicit policy flag permits them. The legacy and Space memberships are
 * committed together while old class screens are still supported. */
export async function joinLegacyClassroomSpaceByCode(
  userId: number,
  classroomId: number
): Promise<void> {
  await tx(async (client) => {
    const row = (
      await client.query<{ space: SpaceRow; owner_id: number }>(
        `SELECT row_to_json(s) AS space, c.owner_id
         FROM legacy_classroom_spaces legacy
         JOIN spaces s ON s.id = legacy.space_id
         JOIN classrooms c ON c.id = legacy.classroom_id
         WHERE legacy.classroom_id = $1
           AND s.preset = 'class' AND s.join_code_enabled = 1`,
        [classroomId]
      )
    ).rows[0];
    if (!row || row.space.status !== "active") throw new SpaceAccessError("membership_required");
    if (row.owner_id === userId) throw new SpaceConflictError("The Space owner cannot join as a learner");
    const joinedAt = nowIso();
    await client.query(
      `INSERT INTO classroom_members (classroom_id, user_id, joined_at)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [classroomId, userId, joinedAt]
    );
    const membership = (
      await client.query<SpaceMembershipRow>(
        `INSERT INTO space_memberships
          (space_id, user_id, status, role, policy_version, joined_at, updated_at)
         VALUES ($1, $2, 'active', 'learner', $3, $4, $4)
         ON CONFLICT (space_id, user_id) DO UPDATE SET
           status = 'active', role = 'learner', policy_version = excluded.policy_version,
           expires_at = NULL, joined_at = COALESCE(space_memberships.joined_at, excluded.joined_at),
           suspended_at = NULL, removed_at = NULL, updated_at = excluded.updated_at
         RETURNING *`,
        [row.space.id, userId, row.space.policy_version, joinedAt]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO space_assignment_members (assignment_id, membership_id)
       SELECT id, $1 FROM space_assignments
       WHERE space_id = $2 AND status = 'active'
       ON CONFLICT DO NOTHING`,
      [membership.id, row.space.id]
    );
    await recordSpaceAudit(client, {
      eventType: "membership.joined_by_code",
      space: row.space,
      actorUserId: userId,
      subjectUserId: userId,
      membershipId: membership.id,
      metadata: { legacy_classroom_id: classroomId },
    });
  });
}

export async function createLegacyClassroomSpace(
  ownerUserId: number,
  nameInput: string,
  code: string
): Promise<{ id: number; owner_id: number; name: string; code: string; created_at: string }> {
  const name = nameInput.trim().slice(0, 80);
  if (name.length < 2) throw new SpaceConflictError("Class name must be at least 2 characters");
  return tx(async (client) => {
    const classroom = (
      await client.query<{ id: number; owner_id: number; name: string; code: string; created_at: string }>(
        `INSERT INTO classrooms (owner_id, name, code)
         VALUES ($1, $2, $3) RETURNING *`,
        [ownerUserId, name, code]
      )
    ).rows[0];
    const space = (
      await client.query<SpaceRow>(
        `INSERT INTO spaces
          (type, preset, name, discovery_policy, entry_policy,
           member_directory_policy, content_sharing_policy, join_code_enabled,
           created_at, updated_at)
         VALUES ('private', 'class', $1, 'hidden', 'invitation', 'members',
                 'members', 1, $2, $2)
         RETURNING *`,
        [name, classroom.created_at]
      )
    ).rows[0];
    const membership = (
      await client.query<SpaceMembershipRow>(
        `INSERT INTO space_memberships
          (space_id, user_id, status, role, policy_version, joined_at, created_at, updated_at)
         VALUES ($1, $2, 'active', 'owner', $3, $4, $4, $4)
         RETURNING *`,
        [space.id, ownerUserId, space.policy_version, classroom.created_at]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO legacy_classroom_spaces (classroom_id, space_id, migrated_at)
       VALUES ($1, $2, $3)`,
      [classroom.id, space.id, nowIso()]
    );
    await recordSpaceAudit(client, {
      eventType: "space.created",
      space,
      actorUserId: ownerUserId,
      subjectUserId: ownerUserId,
      membershipId: membership.id,
      metadata: { type: "private", preset: "class", legacy_classroom_id: classroom.id },
    });
    return classroom;
  });
}

export async function assignLegacyClassroomCourse(
  actorUserId: number,
  classroomId: number,
  courseId: number
): Promise<void> {
  await tx(async (client) => {
    const mapped = (
      await client.query<{ space_id: string }>(
        "SELECT space_id FROM legacy_classroom_spaces WHERE classroom_id = $1",
        [classroomId]
      )
    ).rows[0];
    if (!mapped) throw new SpaceAccessError("membership_required");
    const { space } = await authorizeStoredMembership(
      actorUserId,
      mapped.space_id,
      "assignments.manage",
      client
    );
    const course = (
      await client.query<{ owner_id: number; content_version: number }>(
        "SELECT owner_id, content_version FROM courses WHERE id = $1",
        [courseId]
      )
    ).rows[0];
    if (!course || course.owner_id !== actorUserId) throw new SpaceAccessError("wrong_space");
    await client.query(
      `INSERT INTO classroom_assignments (classroom_id, course_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [classroomId, courseId]
    );
    await client.query(
      `INSERT INTO space_courses (space_id, course_id, attached_by_user_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [space.id, courseId, actorUserId]
    );
    let assignment = (
      await client.query<SpaceAssignmentRow>(
        `SELECT * FROM space_assignments
         WHERE space_id = $1 AND course_id = $2 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [space.id, courseId]
      )
    ).rows[0];
    if (!assignment) {
      assignment = (
        await client.query<SpaceAssignmentRow>(
          `INSERT INTO space_assignments
            (space_id, course_id, course_version, status, assigned_by_user_id, policy_version)
           VALUES ($1, $2, $3, 'active', $4, $5) RETURNING *`,
          [space.id, courseId, course.content_version, actorUserId, space.policy_version]
        )
      ).rows[0];
      await client.query(
        `INSERT INTO space_assignment_members (assignment_id, membership_id)
         SELECT $1, id FROM space_memberships
         WHERE space_id = $2 AND status = 'active'
           AND role IN ('owner', 'administrator', 'creator', 'reviewer', 'manager', 'learner')
         ON CONFLICT DO NOTHING`,
        [assignment.id, space.id]
      );
      await recordSpaceAudit(client, {
        eventType: "assignment.created",
        space,
        actorUserId,
        courseId,
        assignmentId: assignment.id,
        metadata: { legacy_classroom_id: classroomId },
      });
    }
  });
}

export async function unassignLegacyClassroomCourse(
  actorUserId: number,
  classroomId: number,
  courseId: number
): Promise<void> {
  await tx(async (client) => {
    const mapped = (
      await client.query<{ space_id: string }>(
        "SELECT space_id FROM legacy_classroom_spaces WHERE classroom_id = $1",
        [classroomId]
      )
    ).rows[0];
    if (!mapped) throw new SpaceAccessError("membership_required");
    const { space } = await authorizeStoredMembership(actorUserId, mapped.space_id, "assignments.manage", client);
    const at = nowIso();
    await client.query(
      "DELETE FROM classroom_assignments WHERE classroom_id = $1 AND course_id = $2",
      [classroomId, courseId]
    );
    const archived = (
      await client.query<{ id: string }>(
        `UPDATE space_assignments SET status = 'archived', updated_at = $3
         WHERE space_id = $1 AND course_id = $2 AND status = 'active'
         RETURNING id`,
        [space.id, courseId, at]
      )
    ).rows;
    await client.query(
      "DELETE FROM space_courses WHERE space_id = $1 AND course_id = $2",
      [space.id, courseId]
    );
    for (const assignment of archived) {
      await recordSpaceAudit(client, {
        eventType: "assignment.archived",
        space,
        actorUserId,
        courseId,
        assignmentId: assignment.id,
        metadata: { legacy_classroom_id: classroomId },
      });
    }
  });
}

export async function attachCourseToSpace(
  actorUserId: number,
  spaceId: string,
  courseId: number
): Promise<void> {
  await tx(async (client) => {
    const { space } = await authorizeStoredMembership(
      actorUserId,
      spaceId,
      "assignments.manage",
      client
    );
    const course = (
      await client.query<{ owner_id: number }>(
        "SELECT owner_id FROM courses WHERE id = $1",
        [courseId]
      )
    ).rows[0];
    if (!course || course.owner_id !== actorUserId) {
      throw new SpaceAccessError("wrong_space");
    }
    await client.query(
      `INSERT INTO space_courses
        (space_id, course_id, attached_by_user_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [spaceId, courseId, actorUserId]
    );
    await recordSpaceAudit(client, {
      eventType: "course.attached",
      space,
      actorUserId,
      courseId,
    });
  });
}

export async function createSpaceAssignment(
  actorUserId: number,
  spaceId: string,
  courseId: number,
  dueAt?: string | null
): Promise<SpaceAssignmentRow> {
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(
      actorUserId,
      spaceId,
      "assignments.manage",
      client
    );
    const attached = (
      await client.query<{ content_version: number }>(
        `SELECT c.content_version FROM courses c
         JOIN space_courses sc ON sc.course_id = c.id
         WHERE sc.space_id = $1 AND sc.course_id = $2`,
        [spaceId, courseId]
      )
    ).rows[0];
    if (!attached) throw new SpaceAccessError("wrong_space");
    await client.query("SELECT id FROM spaces WHERE id=$1 FOR UPDATE", [spaceId]);
    const defaultRuleJson = JSON.stringify({
      required_lessons: "all",
      minimum_score_percent: 0,
      required_attestations: [],
      required_practical_reviews: [],
      allow_manager_override: false,
      credential: { enabled: false },
    });
    let completionRule = (await client.query<{ id: string }>(
      `SELECT id FROM completion_rule_versions
       WHERE space_id=$1 AND course_id=$2 AND status='published'
       ORDER BY version DESC LIMIT 1`,
      [spaceId, courseId]
    )).rows[0];
    if (!completionRule) {
      completionRule = (await client.query<{ id: string }>(
        `INSERT INTO completion_rule_versions
          (space_id,course_id,version,status,rule_json,content_hash,
           created_by_user_id,published_at)
         VALUES ($1,$2,1,'published',$3,$4,$5,$6) RETURNING id`,
        [spaceId, courseId, defaultRuleJson,
         crypto.createHash("sha256").update(defaultRuleJson).digest("hex"),
         actorUserId, nowIso()]
      )).rows[0];
    }
    const assignment = (
      await client.query<SpaceAssignmentRow>(
        `INSERT INTO space_assignments
          (space_id, course_id, course_version, status, assigned_by_user_id,
           policy_version, due_at)
         VALUES ($1, $2, $3, 'active', $4, $5, $6)
         RETURNING *`,
        [
          spaceId,
          courseId,
          attached.content_version,
          actorUserId,
          space.policy_version,
          dueAt ?? null,
        ]
      )
    ).rows[0];
    const assignmentVersion = (await client.query<{ id: string }>(
      `INSERT INTO assignment_versions
        (assignment_id,version,status,course_version,completion_rule_version_id,
         due_at,created_by_user_id,activated_at)
       VALUES ($1,1,'active',$2,$3,$4,$5,$6) RETURNING id`,
      [assignment.id, attached.content_version, completionRule.id,
       dueAt ?? null, actorUserId, nowIso()]
    )).rows[0];
    await client.query(
      "UPDATE space_assignments SET current_version_id=$2 WHERE id=$1",
      [assignment.id, assignmentVersion.id]
    );
    await client.query(
      "INSERT INTO assignment_targets (assignment_version_id,target_type) VALUES ($1,'space')",
      [assignmentVersion.id]
    );
    await client.query(
      `INSERT INTO space_assignment_members (assignment_id, membership_id)
       SELECT $1, id FROM space_memberships
       WHERE space_id = $2 AND status = 'active'
         AND role IN ('owner', 'administrator', 'creator', 'reviewer', 'manager', 'learner')
       ON CONFLICT DO NOTHING`,
      [assignment.id, spaceId]
    );
    await client.query(
      `INSERT INTO assignment_audience_events
        (assignment_version_id,membership_id,event_type,actor_user_id)
       SELECT $1,membership_id,'assigned',$2 FROM space_assignment_members
       WHERE assignment_id=$3`,
      [assignmentVersion.id, actorUserId, assignment.id]
    );
    await client.query(
      `INSERT INTO assignment_participations
        (assignment_version_id,membership_id,status)
       SELECT $1,membership_id,'assigned' FROM space_assignment_members
       WHERE assignment_id=$2`,
      [assignmentVersion.id, assignment.id]
    );
    await client.query(
      `INSERT INTO assignment_participation_events
        (participation_id,event_type,actor_user_id)
       SELECT id,'assigned',$2 FROM assignment_participations
       WHERE assignment_version_id=$1`,
      [assignmentVersion.id, actorUserId]
    );
    await recordSpaceAudit(client, {
      eventType: "assignment.created",
      space,
      actorUserId,
      courseId,
      assignmentId: assignment.id,
    });
    return { ...assignment, current_version_id: assignmentVersion.id };
  });
}

/**
 * Resolve the server-owned tenancy context for one learning event. Assignment
 * context wins; self-directed ownership/enrollment/public access is attributed
 * to the learner's personal Space. Every lookup rechecks live membership state,
 * so removal or expiry invalidates cached sessions and queued jobs immediately.
 */
export async function resolveCourseLearningContext(
  userId: number,
  courseId: number,
  exec: Queryable
): Promise<LearningSpaceContext | undefined> {
  const assignments = (
    await exec.query<{
      assignment_id: string;
      space_id: string;
      space_type: SpaceType;
      space_status: SpaceStatus;
      policy_version: number;
      membership_id: string;
      membership_space_id: string;
      membership_user_id: number;
      membership_status: MembershipStatus;
      membership_role: SpaceRole;
      membership_expires_at: string | null;
    }>(
      `SELECT a.id AS assignment_id, s.id AS space_id, s.type AS space_type,
        s.status AS space_status, s.policy_version,
        m.id AS membership_id, m.space_id AS membership_space_id,
        m.user_id AS membership_user_id, m.status AS membership_status,
        m.role AS membership_role, m.expires_at AS membership_expires_at
       FROM space_assignments a
       JOIN space_courses sc
         ON sc.space_id = a.space_id AND sc.course_id = a.course_id
       JOIN space_assignment_members am ON am.assignment_id = a.id
       JOIN space_memberships m ON m.id = am.membership_id AND m.user_id = $1
       JOIN spaces s ON s.id = a.space_id
       WHERE a.course_id = $2 AND a.status = 'active'
       ORDER BY a.created_at DESC`,
      [userId, courseId]
    )
  ).rows;
  for (const row of assignments) {
    const decision = authorizeSpace({
      userId,
      capability: "learning.participate",
      space: { id: row.space_id, type: row.space_type, status: row.space_status },
      membership: {
        spaceId: row.membership_space_id,
        userId: row.membership_user_id,
        status: row.membership_status,
        role: row.membership_role,
        expiresAt: row.membership_expires_at,
      },
    });
    if (decision.allowed) {
      return {
        spaceId: row.space_id,
        membershipId: row.membership_id,
        assignmentId: row.assignment_id,
        policyVersion: row.policy_version,
        basis: "assignment",
      };
    }
  }

  const personal = (
    await exec.query<{
      space_id: string;
      space_type: SpaceType;
      space_status: SpaceStatus;
      policy_version: number;
      membership_id: string;
      membership_status: MembershipStatus;
      membership_role: SpaceRole;
      membership_expires_at: string | null;
    }>(
      `SELECT s.id AS space_id, s.type AS space_type, s.status AS space_status,
        s.policy_version, m.id AS membership_id, m.status AS membership_status,
        m.role AS membership_role, m.expires_at AS membership_expires_at
       FROM spaces s
       JOIN space_memberships m ON m.space_id = s.id AND m.user_id = $1
       JOIN courses c ON c.id = $2
       WHERE s.personal_owner_user_id = $1
         AND (
           c.owner_id = $1 OR c.published = 1 OR
           EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = $1 AND e.course_id = c.id) OR
           EXISTS (
             SELECT 1 FROM classroom_assignments ca
             JOIN classroom_members cm ON cm.classroom_id = ca.classroom_id
             WHERE ca.course_id = c.id AND cm.user_id = $1
           )
         )`,
      [userId, courseId]
    )
  ).rows[0];
  if (!personal) return undefined;
  const decision = authorizeSpace({
    userId,
    capability: "learning.participate",
    space: {
      id: personal.space_id,
      type: personal.space_type,
      status: personal.space_status,
    },
    membership: {
      spaceId: personal.space_id,
      userId,
      status: personal.membership_status,
      role: personal.membership_role,
      expiresAt: personal.membership_expires_at,
    },
  });
  if (!decision.allowed) return undefined;
  return {
    spaceId: personal.space_id,
    membershipId: personal.membership_id,
    assignmentId: null,
    policyVersion: personal.policy_version,
    basis: "personal",
  };
}

export async function canParticipateInCourse(
  userId: number,
  courseId: number,
  exec: Queryable
): Promise<boolean> {
  return !!(await resolveCourseLearningContext(userId, courseId, exec));
}

export async function authorizeCourseAction(
  userId: number,
  courseId: number,
  capability: Extract<SpaceCapability, "content.update" | "content.publish">
): Promise<void> {
  await tx(async (client) => {
    const course = (
      await client.query<{
        owning_space_id: string | null;
        published: number;
        status: string;
      }>(
        "SELECT owning_space_id, published, status FROM courses WHERE id = $1",
        [courseId]
      )
    ).rows[0];
    if (!course?.owning_space_id) throw new SpaceAccessError("wrong_space");
    const space = (
      await client.query<SpaceRow>("SELECT * FROM spaces WHERE id = $1", [course.owning_space_id])
    ).rows[0];
    const membership = (
      await client.query<SpaceMembershipRow>(
        "SELECT * FROM space_memberships WHERE space_id = $1 AND user_id = $2",
        [course.owning_space_id, userId]
      )
    ).rows[0];
    if (!space) throw new SpaceAccessError("wrong_space");
    const decision = authorizeSpace({
      userId,
      capability,
      space: { id: space.id, type: space.type, status: space.status },
      membership: membership
        ? {
            spaceId: membership.space_id,
            userId: membership.user_id,
            status: membership.status,
            role: membership.role,
            expiresAt: membership.expires_at,
          }
        : null,
      resource: {
        owningSpaceId: course.owning_space_id,
        publication: course.published ? "public" : "private",
        lifecycle: course.status === "ready" ? "published" : "draft",
      },
    });
    if (!decision.allowed) throw new SpaceAccessError(decision.reason);
  });
}
