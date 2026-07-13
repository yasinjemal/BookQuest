import crypto from "crypto";
import { pool, tx, type Queryable } from "./pg";
import { authorizeStoredMembership } from "./spaces";

export type IdentityProviderRequirement = "undecided" | "oidc" | "saml";
export type PilotGateType =
  | "manual_process_baseline"
  | "success_criteria"
  | "journey_acceptance"
  | "audit_pack_acceptance"
  | "live_credential_revocation"
  | "identity_provider_test"
  | "penetration_test"
  | "accessibility_audit"
  | "incident_restore_exercise"
  | "marketing_claim_review"
  | "willingness_to_pay";
export type PilotObservationType =
  | "admin_journey"
  | "learner_journey"
  | "support"
  | "commercial"
  | "incident";

export interface PilotPlanInput {
  partnerDisplayName: string;
  sector: string;
  identityProviderRequirement: IdentityProviderRequirement;
  scimRequired: boolean;
  baseline: {
    description: string;
    uploadToAssignmentMinutes: number;
    adminHoursPerCohort: number;
  };
  successCriteria: Array<{ metric: string; target: string }>;
}

export interface PilotObservationInput {
  observationType: PilotObservationType;
  participantKey: string;
  summary: string;
  supportNeeds: string[];
  minutesSpent: number;
  manualDatabaseWork: boolean;
}

export interface PilotGateAttestationInput {
  gateType: PilotGateType;
  outcome: "accepted" | "accepted_with_actions" | "rejected";
  summary: string;
  evidenceUri?: string | null;
  artifactHash?: string | null;
  openActions?: string[];
  auditPackId?: string | null;
  credentialId?: string | null;
}

const IDP_REQUIREMENTS = new Set<IdentityProviderRequirement>(["undecided", "oidc", "saml"]);
const OBSERVATION_TYPES = new Set<PilotObservationType>([
  "admin_journey", "learner_journey", "support", "commercial", "incident",
]);
const GATE_TYPES = new Set<PilotGateType>([
  "manual_process_baseline", "success_criteria", "journey_acceptance",
  "audit_pack_acceptance", "live_credential_revocation", "identity_provider_test",
  "penetration_test", "accessibility_audit", "incident_restore_exercise",
  "marketing_claim_review", "willingness_to_pay",
]);
const EVIDENCE_REQUIRED = new Set<PilotGateType>([
  "identity_provider_test", "penetration_test", "accessibility_audit",
  "incident_restore_exercise", "marketing_claim_review",
]);
const REQUIRED_ATTESTATIONS: PilotGateType[] = [
  "manual_process_baseline",
  "success_criteria",
  "journey_acceptance",
  "audit_pack_acceptance",
  "live_credential_revocation",
  "penetration_test",
  "accessibility_audit",
  "incident_restore_exercise",
  "marketing_claim_review",
  "willingness_to_pay",
];

export class InstitutionalPilotError extends Error {
  missing?: string[];

  constructor(message: string, missing?: string[]) {
    super(message);
    this.name = "InstitutionalPilotError";
    this.missing = missing;
  }
}

const nowIso = () => new Date().toISOString();
const clean = (value: string) => value.trim().replace(/\s+/g, " ");

function normalizePlan(input: PilotPlanInput) {
  const partnerDisplayName = clean(input.partnerDisplayName);
  const sector = clean(input.sector);
  const description = clean(input.baseline.description);
  if (partnerDisplayName.length < 2 || partnerDisplayName.length > 120) {
    throw new InstitutionalPilotError("Partner display name must be between 2 and 120 characters");
  }
  if (sector.length < 2 || sector.length > 120) {
    throw new InstitutionalPilotError("Partner sector must be between 2 and 120 characters");
  }
  if (!IDP_REQUIREMENTS.has(input.identityProviderRequirement)) {
    throw new InstitutionalPilotError("Select an identity-provider requirement");
  }
  if (description.length < 20 || description.length > 4_000) {
    throw new InstitutionalPilotError("Describe the current manual process in 20 to 4000 characters");
  }
  if (!Number.isFinite(input.baseline.uploadToAssignmentMinutes) || input.baseline.uploadToAssignmentMinutes <= 0) {
    throw new InstitutionalPilotError("Upload-to-assignment baseline must be greater than zero minutes");
  }
  if (!Number.isFinite(input.baseline.adminHoursPerCohort) || input.baseline.adminHoursPerCohort < 0) {
    throw new InstitutionalPilotError("Administrative baseline cannot be negative");
  }
  if (input.successCriteria.length < 1 || input.successCriteria.length > 12) {
    throw new InstitutionalPilotError("Record between 1 and 12 agreed success criteria");
  }
  const successCriteria = input.successCriteria.map((criterion) => {
    const metric = clean(criterion.metric);
    const target = clean(criterion.target);
    if (metric.length < 2 || metric.length > 160 || target.length < 1 || target.length > 240) {
      throw new InstitutionalPilotError("Each success criterion needs a concise metric and target");
    }
    return { metric, target };
  });
  return {
    partnerDisplayName,
    sector,
    identityProviderRequirement: input.identityProviderRequirement,
    scimRequired: input.scimRequired === true,
    baseline: {
      description,
      uploadToAssignmentMinutes: input.baseline.uploadToAssignmentMinutes,
      adminHoursPerCohort: input.baseline.adminHoursPerCohort,
    },
    successCriteria,
  };
}

function normalizeEvidenceUri(value?: string | null) {
  if (!value?.trim()) return null;
  if (value.length > 2_048) throw new InstitutionalPilotError("Evidence link is too long");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InstitutionalPilotError("Evidence link must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new InstitutionalPilotError("Evidence link must be a public HTTPS URL without embedded credentials");
  }
  return url.toString();
}

function normalizeArtifactHash(value?: string | null) {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new InstitutionalPilotError("Artifact hash must be a SHA-256 value");
  }
  return normalized;
}

async function insertPlan(
  exec: Queryable,
  pilotId: string,
  actorUserId: number,
  version: number,
  input: ReturnType<typeof normalizePlan>,
) {
  return (await exec.query<{ id: string; version: number }>(
    `INSERT INTO institutional_pilot_plan_versions
      (pilot_id,version,partner_display_name,sector,identity_provider_requirement,
       scim_required,baseline_json,success_criteria_json,created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,version`,
    [
      pilotId,
      version,
      input.partnerDisplayName,
      input.sector,
      input.identityProviderRequirement,
      input.scimRequired ? 1 : 0,
      JSON.stringify(input.baseline),
      JSON.stringify(input.successCriteria),
      actorUserId,
    ],
  )).rows[0];
}

export async function createInstitutionalPilot(
  actorUserId: number,
  spaceId: string,
  planInput: PilotPlanInput,
) {
  const plan = normalizePlan(planInput);
  return tx(async (client) => {
    const { space } = await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    if (space.type !== "organization") {
      throw new InstitutionalPilotError("Institutional pilots require an organization Space");
    }
    const existing = await client.query("SELECT 1 FROM institutional_pilots WHERE space_id=$1", [spaceId]);
    if (existing.rowCount) throw new InstitutionalPilotError("This Space already has a pilot record");
    const pilot = (await client.query<{ id: string; status: string }>(
      `INSERT INTO institutional_pilots (space_id,status,created_by_user_id)
       VALUES ($1,'active',$2) RETURNING id,status`,
      [spaceId, actorUserId],
    )).rows[0];
    const createdPlan = await insertPlan(client, pilot.id, actorUserId, 1, plan);
    await client.query(
      "UPDATE institutional_pilots SET current_plan_version_id=$2 WHERE id=$1",
      [pilot.id, createdPlan.id],
    );
    await client.query(
      `INSERT INTO institutional_pilot_status_events (pilot_id,status,actor_user_id,reason)
       VALUES ($1,'active',$2,'Pilot started')`,
      [pilot.id, actorUserId],
    );
    return { pilotId: pilot.id, status: pilot.status, planVersion: createdPlan.version };
  });
}

export async function reviseInstitutionalPilotPlan(
  actorUserId: number,
  spaceId: string,
  planInput: PilotPlanInput,
) {
  const plan = normalizePlan(planInput);
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const pilot = (await client.query<{ id: string; status: string }>(
      "SELECT id,status FROM institutional_pilots WHERE space_id=$1 FOR UPDATE",
      [spaceId],
    )).rows[0];
    if (!pilot) throw new InstitutionalPilotError("Pilot record not found");
    if (pilot.status !== "active") throw new InstitutionalPilotError("Only an active pilot plan can be revised");
    const version = Number((await client.query(
      "SELECT COALESCE(MAX(version),0)::int AS version FROM institutional_pilot_plan_versions WHERE pilot_id=$1",
      [pilot.id],
    )).rows[0].version) + 1;
    const createdPlan = await insertPlan(client, pilot.id, actorUserId, version, plan);
    await client.query(
      "UPDATE institutional_pilots SET current_plan_version_id=$2 WHERE id=$1",
      [pilot.id, createdPlan.id],
    );
    return { pilotId: pilot.id, planVersion: createdPlan.version };
  });
}

export async function recordInstitutionalPilotObservation(
  actorUserId: number,
  spaceId: string,
  input: PilotObservationInput,
) {
  if (!OBSERVATION_TYPES.has(input.observationType)) {
    throw new InstitutionalPilotError("Invalid pilot observation type");
  }
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(input.participantKey)) {
    throw new InstitutionalPilotError("Use a 3 to 64 character opaque participant code, not a name or email");
  }
  const summary = clean(input.summary);
  if (summary.length < 10 || summary.length > 4_000) {
    throw new InstitutionalPilotError("Observation summary must be between 10 and 4000 characters");
  }
  if (!Number.isFinite(input.minutesSpent) || input.minutesSpent < 0 || input.minutesSpent > 100_000) {
    throw new InstitutionalPilotError("Observation duration is invalid");
  }
  const supportNeeds = input.supportNeeds.map(clean).filter(Boolean);
  if (supportNeeds.length > 20 || supportNeeds.some((item) => item.length > 240)) {
    throw new InstitutionalPilotError("Record at most 20 concise support needs");
  }
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    const pilot = (await client.query<{ id: string; status: string }>(
      "SELECT id,status FROM institutional_pilots WHERE space_id=$1",
      [spaceId],
    )).rows[0];
    if (!pilot || pilot.status !== "active") throw new InstitutionalPilotError("Active pilot record not found");
    const participantKeyHash = crypto
      .createHash("sha256")
      .update(`${pilot.id}\0${input.participantKey}`)
      .digest("hex");
    return (await client.query(
      `INSERT INTO institutional_pilot_observations
        (pilot_id,observation_type,participant_key_hash,observation_json,observed_by_user_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,observation_type,occurred_at`,
      [pilot.id, input.observationType, participantKeyHash, JSON.stringify({
        summary,
        supportNeeds,
        minutesSpent: input.minutesSpent,
        manualDatabaseWork: input.manualDatabaseWork === true,
      }), actorUserId],
    )).rows[0];
  });
}

export async function attestInstitutionalPilotGate(
  actorUserId: number,
  spaceId: string,
  input: PilotGateAttestationInput,
) {
  if (!GATE_TYPES.has(input.gateType)) throw new InstitutionalPilotError("Invalid pilot gate type");
  if (!["accepted", "accepted_with_actions", "rejected"].includes(input.outcome)) {
    throw new InstitutionalPilotError("Invalid pilot gate outcome");
  }
  const summary = clean(input.summary);
  if (summary.length < 10 || summary.length > 4_000) {
    throw new InstitutionalPilotError("Gate summary must be between 10 and 4000 characters");
  }
  const evidenceUri = normalizeEvidenceUri(input.evidenceUri);
  const artifactHash = normalizeArtifactHash(input.artifactHash);
  const openActions = (input.openActions ?? []).map(clean).filter(Boolean);
  if (openActions.length > 20 || openActions.some((item) => item.length > 300)) {
    throw new InstitutionalPilotError("Record at most 20 concise remediation actions");
  }
  if (input.outcome === "accepted_with_actions" && openActions.length === 0) {
    throw new InstitutionalPilotError("Accepted-with-actions evidence must list its open actions");
  }
  if (EVIDENCE_REQUIRED.has(input.gateType) && !evidenceUri && !artifactHash) {
    throw new InstitutionalPilotError("This gate requires an evidence link or SHA-256 artifact hash");
  }
  if (input.gateType === "audit_pack_acceptance" && !input.auditPackId) {
    throw new InstitutionalPilotError("Audit-pack acceptance must reference the accepted pack");
  }
  if (input.gateType === "live_credential_revocation" && !input.credentialId) {
    throw new InstitutionalPilotError("Revocation proof must reference the tested credential");
  }
  return tx(async (client) => {
    const { membership } = await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const pilot = (await client.query<{ id: string; status: string }>(
      "SELECT id,status FROM institutional_pilots WHERE space_id=$1",
      [spaceId],
    )).rows[0];
    if (!pilot || pilot.status !== "active") throw new InstitutionalPilotError("Active pilot record not found");
    if (input.auditPackId) {
      const pack = await client.query("SELECT 1 FROM audit_packs WHERE id=$1 AND space_id=$2", [input.auditPackId, spaceId]);
      if (pack.rowCount !== 1) throw new InstitutionalPilotError("Audit pack is outside this pilot Space");
    }
    if (input.credentialId) {
      const credential = await client.query(
        `SELECT 1 FROM credential_records credential
         JOIN assignment_versions version ON version.id=credential.assignment_version_id
         JOIN space_assignments assignment ON assignment.id=version.assignment_id
         WHERE credential.id=$1 AND assignment.space_id=$2`,
        [input.credentialId, spaceId],
      );
      if (credential.rowCount !== 1) throw new InstitutionalPilotError("Credential is outside this pilot Space");
    }
    return (await client.query(
      `INSERT INTO institutional_pilot_gate_attestations
        (pilot_id,gate_type,outcome,summary,evidence_uri,artifact_hash,open_actions_json,
         audit_pack_id,credential_id,attested_by_user_id,role_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id,gate_type,outcome,occurred_at`,
      [
        pilot.id, input.gateType, input.outcome, summary, evidenceUri, artifactHash,
        JSON.stringify(openActions), input.auditPackId ?? null, input.credentialId ?? null,
        actorUserId, membership.role,
      ],
    )).rows[0];
  });
}

async function pilotReadiness(exec: Queryable, pilotId: string) {
  const plan = (await exec.query<{
    identity_provider_requirement: IdentityProviderRequirement;
  }>(
    `SELECT plan.identity_provider_requirement
     FROM institutional_pilots pilot
     JOIN institutional_pilot_plan_versions plan ON plan.id=pilot.current_plan_version_id
     WHERE pilot.id=$1`,
    [pilotId],
  )).rows[0];
  if (!plan) throw new InstitutionalPilotError("Pilot plan not found");

  const latestAttestations = (await exec.query<{
    gate_type: PilotGateType;
    outcome: PilotGateAttestationInput["outcome"];
    audit_pack_id: string | null;
    credential_id: string | null;
  }>(
    `SELECT DISTINCT ON (gate_type) gate_type,outcome,audit_pack_id,credential_id
     FROM institutional_pilot_gate_attestations WHERE pilot_id=$1
     ORDER BY gate_type,occurred_at DESC,id DESC`,
    [pilotId],
  )).rows;
  const latest = new Map(latestAttestations.map((row) => [row.gate_type, row]));
  const missing: string[] = [];
  const accepted = (gate: PilotGateType) => {
    const outcome = latest.get(gate)?.outcome;
    return outcome === "accepted" || (gate === "accessibility_audit" && outcome === "accepted_with_actions");
  };
  for (const gate of REQUIRED_ATTESTATIONS) {
    if (!accepted(gate)) missing.push(`attestation:${gate}`);
  }

  const observationRows = (await exec.query<{ observation_type: PilotObservationType }>(
    `SELECT DISTINCT observation_type FROM institutional_pilot_observations
     WHERE pilot_id=$1
       AND COALESCE((observation_json::jsonb->>'manualDatabaseWork')::boolean,false)=false`,
    [pilotId],
  )).rows.map((row) => row.observation_type);
  if (!observationRows.includes("admin_journey")) missing.push("observation:admin_journey_without_database_work");
  if (!observationRows.includes("learner_journey")) missing.push("observation:learner_journey_without_database_work");

  const technical = (await exec.query<{
    completed_participations: number;
    reconciliation_failures: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int
        FROM assignment_participations participation
        JOIN assignment_versions version ON version.id=participation.assignment_version_id
        JOIN space_assignments assignment ON assignment.id=version.assignment_id
        WHERE assignment.space_id=pilot.space_id AND participation.status='completed') AS completed_participations,
       (SELECT COUNT(*)::int
        FROM assignment_completion_events completion
        JOIN assignment_participations participation ON participation.id=completion.participation_id
        JOIN assignment_versions version ON version.id=completion.assignment_version_id
        JOIN space_assignments assignment ON assignment.id=version.assignment_id
        JOIN completion_rule_versions rule ON rule.id=completion.completion_rule_version_id
        WHERE assignment.space_id=pilot.space_id AND (
          completion.assignment_version_id<>participation.assignment_version_id OR
          completion.completion_rule_version_id<>version.completion_rule_version_id OR
          rule.space_id<>assignment.space_id OR rule.course_id<>assignment.course_id
        )) AS reconciliation_failures
     FROM institutional_pilots pilot WHERE pilot.id=$1`,
    [pilotId],
  )).rows[0];
  if (!technical?.completed_participations) missing.push("evidence:completed_participation");
  if ((technical?.reconciliation_failures ?? 1) !== 0) missing.push("evidence:version_reconciliation");

  const acceptedPackId = accepted("audit_pack_acceptance") ? latest.get("audit_pack_acceptance")?.audit_pack_id : null;
  if (!acceptedPackId || !(await exec.query(
    `SELECT 1 FROM audit_packs pack JOIN institutional_pilots pilot ON pilot.space_id=pack.space_id
     WHERE pilot.id=$1 AND pack.id=$2 AND pack.status='generated'`,
    [pilotId, acceptedPackId],
  )).rowCount) missing.push("evidence:accepted_audit_pack");

  const revokedCredentialId = accepted("live_credential_revocation")
    ? latest.get("live_credential_revocation")?.credential_id
    : null;
  if (!revokedCredentialId || !(await exec.query(
    `SELECT 1 FROM credential_records credential
     JOIN credential_status_events status ON status.credential_id=credential.id AND status.event_type='revoked'
     JOIN assignment_versions version ON version.id=credential.assignment_version_id
     JOIN space_assignments assignment ON assignment.id=version.assignment_id
     JOIN institutional_pilots pilot ON pilot.space_id=assignment.space_id
     WHERE pilot.id=$1 AND credential.id=$2 AND credential.status='revoked'`,
    [pilotId, revokedCredentialId],
  )).rowCount) missing.push("evidence:live_revoked_credential");

  if (plan.identity_provider_requirement === "undecided") {
    missing.push("identity_provider:selected");
  } else {
    if (!accepted("identity_provider_test")) missing.push("attestation:identity_provider_test");
    if (!(await exec.query(
      `SELECT 1 FROM space_identity_providers provider
       JOIN institutional_pilots pilot ON pilot.space_id=provider.space_id
       WHERE pilot.id=$1 AND provider.protocol=$2 AND provider.status='active' LIMIT 1`,
      [pilotId, plan.identity_provider_requirement],
    )).rowCount) missing.push("identity_provider:active_tested_connection");
  }

  return {
    ready: missing.length === 0,
    missing,
    technical: {
      completedParticipations: technical?.completed_participations ?? 0,
      reconciliationFailures: technical?.reconciliation_failures ?? 0,
    },
  };
}

export async function getInstitutionalPilotDashboard(actorUserId: number, spaceId: string) {
  const { membership } = await authorizeStoredMembership(actorUserId, spaceId, "evidence.read_members", pool);
  const access = {
    role: membership.role,
    canManagePilot: membership.role === "owner" || membership.role === "administrator",
    canRecordObservation: ["owner", "administrator", "manager"].includes(membership.role),
  };
  const pilot = (await pool.query(
    `SELECT pilot.*,plan.version AS plan_version,plan.partner_display_name,plan.sector,
            plan.identity_provider_requirement,plan.scim_required,plan.baseline_json,
            plan.success_criteria_json
     FROM institutional_pilots pilot
     JOIN institutional_pilot_plan_versions plan ON plan.id=pilot.current_plan_version_id
     WHERE pilot.space_id=$1`,
    [spaceId],
  )).rows[0];
  if (!pilot) return { access, pilot: null };
  const [observations, attestations, auditPacks, credentials, identityProviders, readiness] = await Promise.all([
    pool.query(
      `SELECT id,observation_type,observation_json,observed_by_user_id,occurred_at
       FROM institutional_pilot_observations WHERE pilot_id=$1 ORDER BY occurred_at DESC`,
      [pilot.id],
    ),
    pool.query(
      `SELECT id,gate_type,outcome,summary,evidence_uri,artifact_hash,open_actions_json,
              audit_pack_id,credential_id,attested_by_user_id,role_snapshot,occurred_at
       FROM institutional_pilot_gate_attestations WHERE pilot_id=$1 ORDER BY occurred_at DESC`,
      [pilot.id],
    ),
    pool.query(
      "SELECT id,report_format_version,status,created_at FROM audit_packs WHERE space_id=$1 ORDER BY created_at DESC",
      [spaceId],
    ),
    pool.query(
      `SELECT credential.id,credential.display_code,credential.status,credential.issued_at
       FROM credential_records credential
       JOIN assignment_versions version ON version.id=credential.assignment_version_id
       JOIN space_assignments assignment ON assignment.id=version.assignment_id
       WHERE assignment.space_id=$1 ORDER BY credential.issued_at DESC`,
      [spaceId],
    ),
    pool.query(
      "SELECT id,protocol,status,issuer,created_at,activated_at FROM space_identity_providers WHERE space_id=$1 ORDER BY created_at DESC",
      [spaceId],
    ),
    pilotReadiness(pool, pilot.id),
  ]);
  return {
    access,
    pilot: {
      id: pilot.id,
      status: pilot.status,
      createdAt: pilot.created_at,
      startedAt: pilot.started_at,
      completedAt: pilot.completed_at,
    },
    plan: {
      version: pilot.plan_version,
      partnerDisplayName: pilot.partner_display_name,
      sector: pilot.sector,
      identityProviderRequirement: pilot.identity_provider_requirement,
      scimRequired: pilot.scim_required === 1,
      baseline: JSON.parse(pilot.baseline_json),
      successCriteria: JSON.parse(pilot.success_criteria_json),
    },
    observations: observations.rows.map((row) => ({
      ...row,
      observation: JSON.parse(row.observation_json),
      observation_json: undefined,
    })),
    attestations: attestations.rows.map((row) => ({
      ...row,
      openActions: JSON.parse(row.open_actions_json),
      open_actions_json: undefined,
    })),
    evidenceCandidates: {
      auditPacks: auditPacks.rows,
      credentials: credentials.rows,
      identityProviders: identityProviders.rows,
    },
    readiness,
  };
}

export async function completeInstitutionalPilot(actorUserId: number, spaceId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const pilot = (await client.query<{ id: string; status: string }>(
      "SELECT id,status FROM institutional_pilots WHERE space_id=$1 FOR UPDATE",
      [spaceId],
    )).rows[0];
    if (!pilot) throw new InstitutionalPilotError("Pilot record not found");
    if (pilot.status === "completed") return { pilotId: pilot.id, status: pilot.status };
    if (pilot.status !== "active") throw new InstitutionalPilotError("Only an active pilot can complete");
    const readiness = await pilotReadiness(client, pilot.id);
    if (!readiness.ready) {
      throw new InstitutionalPilotError("Pilot release gates are not complete", readiness.missing);
    }
    const at = nowIso();
    await client.query(
      "UPDATE institutional_pilots SET status='completed',completed_at=$2 WHERE id=$1",
      [pilot.id, at],
    );
    await client.query(
      `INSERT INTO institutional_pilot_status_events (pilot_id,status,actor_user_id,reason,occurred_at)
       VALUES ($1,'completed',$2,'All governed pilot gates passed',$3)`,
      [pilot.id, actorUserId, at],
    );
    return { pilotId: pilot.id, status: "completed", completedAt: at };
  });
}
