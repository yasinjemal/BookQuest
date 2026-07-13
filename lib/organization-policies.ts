import crypto from "crypto";
import { pool, tx } from "./pg";
import { authorizeStoredMembership } from "./spaces";

export interface OrganizationPolicyDefinition {
  minimumPasswordLength: number;
  sessionMaxDays: number;
  requireMfaRoles: string[];
  retentionDays: number;
  legalHoldEnabled: boolean;
}

export class OrganizationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationPolicyError";
  }
}

const canonical = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]))
    : value;
const digest = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const nowIso = () => new Date().toISOString();
const ALLOWED_MFA_ROLES = new Set(["owner", "administrator", "creator", "reviewer", "manager", "learner", "auditor"]);

function validatePolicy(input: OrganizationPolicyDefinition) {
  if (!Number.isInteger(input.minimumPasswordLength) || input.minimumPasswordLength < 8 || input.minimumPasswordLength > 128) {
    throw new OrganizationPolicyError("Minimum password length must be between 8 and 128");
  }
  if (!Number.isInteger(input.sessionMaxDays) || input.sessionMaxDays < 1 || input.sessionMaxDays > 30) {
    throw new OrganizationPolicyError("Session lifetime must be between 1 and 30 days");
  }
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 30 || input.retentionDays > 3650) {
    throw new OrganizationPolicyError("Retention must be between 30 and 3650 days");
  }
  if (input.requireMfaRoles.some((role) => !ALLOWED_MFA_ROLES.has(role))) {
    throw new OrganizationPolicyError("MFA policy contains an invalid role");
  }
  return {
    minimum_password_length: input.minimumPasswordLength,
    session_max_days: input.sessionMaxDays,
    require_mfa_roles: [...new Set(input.requireMfaRoles)].sort(),
    retention_days: input.retentionDays,
    legal_hold_enabled: input.legalHoldEnabled,
  };
}

export async function publishOrganizationPolicy(
  actorUserId: number,
  spaceId: string,
  input: OrganizationPolicyDefinition
) {
  const policy = validatePolicy(input);
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    if (space.type !== "organization") throw new OrganizationPolicyError("Institutional policies require an organization Space");
    if (policy.require_mfa_roles.length > 0) {
      const missing = await client.query(
        `SELECT 1 FROM space_memberships membership
         WHERE membership.space_id=$1 AND membership.status='active'
           AND membership.role=ANY($2::text[])
           AND NOT EXISTS (
             SELECT 1 FROM user_mfa_methods method
             WHERE method.user_id=membership.user_id AND method.status='active'
           ) LIMIT 1`,
        [spaceId, policy.require_mfa_roles]
      );
      if (missing.rowCount) throw new OrganizationPolicyError("Every affected member must enroll MFA before this policy can be published");
    }
    await client.query("SELECT id FROM spaces WHERE id=$1 FOR UPDATE", [spaceId]);
    const current = (await client.query<{ id: string; version: number }>(
      `SELECT id,version FROM space_policy_versions
       WHERE space_id=$1 AND status='published' ORDER BY version DESC LIMIT 1`,
      [spaceId]
    )).rows[0];
    const at = nowIso();
    if (current) await client.query(
      "UPDATE space_policy_versions SET status='superseded',superseded_at=$2 WHERE id=$1",
      [current.id, at]
    );
    const created = (await client.query<{ id: string; version: number }>(
      `INSERT INTO space_policy_versions
        (space_id,version,status,policy_json,content_hash,created_by_user_id,created_at,published_at)
       VALUES ($1,$2,'published',$3,$4,$5,$6,$6) RETURNING id,version`,
      [spaceId, (current?.version ?? 0) + 1, JSON.stringify(policy), digest(policy), actorUserId, at]
    )).rows[0];
    await client.query(
      `UPDATE spaces SET current_policy_version_id=$2,policy_version=policy_version+1,updated_at=$3
       WHERE id=$1`,
      [spaceId, created.id, at]
    );
    await client.query(
      `DELETE FROM sessions session USING space_memberships membership
       WHERE session.user_id=membership.user_id AND membership.space_id=$1
         AND membership.status='active'`,
      [spaceId]
    );
    return { ...created, policy, contentHash: digest(policy) };
  });
}

export async function getOrganizationPolicy(actorUserId: number, spaceId: string) {
  await authorizeStoredMembership(actorUserId, spaceId, "space.read", pool);
  return (await pool.query(
    `SELECT policy.* FROM spaces space
     JOIN space_policy_versions policy ON policy.id=space.current_policy_version_id
     WHERE space.id=$1`,
    [spaceId]
  )).rows[0] ?? null;
}

export async function getUserAuthenticationPolicy(userId: number) {
  const rows = (await pool.query<{ role: string; policy_json: string }>(
    `SELECT membership.role,policy.policy_json
     FROM space_memberships membership
     JOIN spaces space ON space.id=membership.space_id AND space.type='organization'
     JOIN space_policy_versions policy ON policy.id=space.current_policy_version_id
     WHERE membership.user_id=$1 AND membership.status='active'`,
    [userId]
  )).rows;
  let minimumPasswordLength = 8;
  let sessionMaxDays = 30;
  let requireMfa = false;
  for (const row of rows) {
    const policy = JSON.parse(row.policy_json) as {
      minimum_password_length: number;
      session_max_days: number;
      require_mfa_roles: string[];
    };
    minimumPasswordLength = Math.max(minimumPasswordLength, policy.minimum_password_length);
    sessionMaxDays = Math.min(sessionMaxDays, policy.session_max_days);
    requireMfa ||= policy.require_mfa_roles.includes(row.role);
  }
  return { minimumPasswordLength, sessionMaxDays, requireMfa };
}

export async function createLegalHold(
  actorUserId: number,
  spaceId: string,
  input: { reason: string; scope: { type: "space" } | { type: "assignment"; assignmentId: string } | { type: "membership"; membershipId: string } }
) {
  const reason = input.reason.trim();
  if (!reason) throw new OrganizationPolicyError("Legal-hold reason is required");
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    if (space.type !== "organization") throw new OrganizationPolicyError("Legal holds require an organization Space");
    if (input.scope.type === "assignment") {
      const assignment = await client.query("SELECT 1 FROM space_assignments WHERE id=$1 AND space_id=$2", [input.scope.assignmentId, spaceId]);
      if (assignment.rowCount !== 1) throw new OrganizationPolicyError("Legal-hold assignment is outside this Space");
    }
    if (input.scope.type === "membership") {
      const membership = await client.query("SELECT 1 FROM space_memberships WHERE id=$1 AND space_id=$2", [input.scope.membershipId, spaceId]);
      if (membership.rowCount !== 1) throw new OrganizationPolicyError("Legal-hold membership is outside this Space");
    }
    return (await client.query(
      `INSERT INTO space_legal_holds
        (space_id,scope_json,reason,created_by_user_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [spaceId, JSON.stringify(input.scope), reason, actorUserId]
    )).rows[0];
  });
}

export async function releaseLegalHold(
  actorUserId: number,
  spaceId: string,
  holdId: string,
  reason: string
) {
  const normalized = reason.trim();
  if (!normalized) throw new OrganizationPolicyError("Legal-hold release reason is required");
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const at = nowIso();
    const hold = (await client.query(
      `UPDATE space_legal_holds SET status='released',released_by_user_id=$3,
              released_at=$4,release_reason=$5
       WHERE id=$1 AND space_id=$2 AND status='active' RETURNING *`,
      [holdId, spaceId, actorUserId, at, normalized]
    )).rows[0];
    if (!hold) throw new OrganizationPolicyError("Active legal hold not found");
    return hold;
  });
}
