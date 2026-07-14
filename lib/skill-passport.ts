import crypto from "crypto";
import type { PoolClient } from "pg";
import { tx } from "./pg";
import { authorizeStoredMembership } from "./spaces";
import { snapshotClaimCompetencyAlignments } from "./competency-frameworks";

const MAX_SHARE_DAYS = 30;
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const secretDigest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const DISPUTE_CATEGORIES = new Set([
  "identity_or_name", "course_or_version", "completion_or_score",
  "evidence_or_credential", "other",
]);

export class SkillPassportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillPassportError";
  }
}

type EligibleCredential = {
  credential_id: string;
  user_id: number;
  course_id: number;
  course_version: number;
  course_title: string;
  assignment_version_id: string;
  completion_rule_version_id: string;
  completion_event_id: string;
  participation_id: string;
  evidence_hash: string;
  issued_at: string;
  expires_at: string | null;
  space_id: string;
};

type ClaimRow = {
  claim_id: string;
  claim_version_id: string;
  version: number;
  claim_type: "verified_course_completion";
  title: string;
  statement: string;
  course_id: number;
  course_version: number;
  assignment_version_id: string;
  completion_rule_version_id: string;
  completion_event_id: string;
  participation_id: string;
  credential_id: string;
  evidence_hash: string;
  issued_at: string;
  created_at: string;
  supersedes_claim_version_id: string | null;
};

type EvidenceSummaryRow = {
  score_percent: number | null;
  rule_evaluation_json: string;
  evidence_manifest_json: string;
  completion_rule_version_id: string;
  issued_at: string;
};

function mapClaim(row: ClaimRow) {
  return {
    claimId: row.claim_id,
    claimVersionId: row.claim_version_id,
    version: Number(row.version),
    claimType: row.claim_type,
    title: row.title,
    statement: row.statement,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    supersedesClaimVersionId: row.supersedes_claim_version_id,
    evidence: {
      courseId: Number(row.course_id),
      courseVersion: Number(row.course_version),
      assignmentVersionId: row.assignment_version_id,
      completionRuleVersionId: row.completion_rule_version_id,
      completionEventId: row.completion_event_id,
      participationId: row.participation_id,
      credentialId: row.credential_id,
      evidenceHash: row.evidence_hash,
    },
  };
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function evidenceSummary(row: EvidenceSummaryRow) {
  const evaluation = parseJsonObject(row.rule_evaluation_json);
  const manifest = parseJsonObject(row.evidence_manifest_json);
  const lessons = Array.isArray(manifest.lessonCompletions) ? manifest.lessonCompletions.length : 0;
  const attestations = Array.isArray(manifest.attestations) ? manifest.attestations.length : 0;
  const practicalReviews = Array.isArray(manifest.practicalReviews)
    ? manifest.practicalReviews.filter((entry) => entry && typeof entry === "object"
      && (entry as Record<string, unknown>).reviewId).length
    : 0;
  return {
    mastery: {
      status: "not_assessed" as const,
      score: null,
      reason: "Completion evidence is verified, but no validated competency mastery scale is attached.",
    },
    confidence: {
      status: "verified_evidence" as const,
      score: null,
      basis: "Exact assignment, rule, completion, credential and evidence-hash bindings reconcile.",
    },
    evidenceVolume: {
      total: lessons + attestations + practicalReviews,
      lessonCompletions: lessons,
      attestations,
      practicalReviews,
    },
    recency: { evidenceIssuedAt: row.issued_at },
    sources: [
      { type: "lesson_completion" as const, count: lessons },
      { type: "attestation" as const, count: attestations },
      { type: "practical_review" as const, count: practicalReviews },
    ].filter((source) => source.count > 0),
    conditions: {
      completionRuleVersionId: row.completion_rule_version_id,
      minimumScorePercent: typeof evaluation.minimumScorePercent === "number"
        ? evaluation.minimumScorePercent : null,
      observedScorePercent: row.score_percent === null ? null : Number(row.score_percent),
      requiredLessonCount: Array.isArray(evaluation.requiredLessons)
        ? evaluation.requiredLessons.length : null,
      requiredAttestationCount: Array.isArray(evaluation.missingAttestations)
        ? attestations + evaluation.missingAttestations.length : null,
      requiredPracticalReviewCount: Array.isArray(evaluation.missingPracticalReviews)
        ? practicalReviews + evaluation.missingPracticalReviews.length : null,
    },
  };
}

async function claimCompetencyAlignments(client: PoolClient, claimVersionIds: string[]) {
  const result = new Map<string, Array<{
    frameworkId: string; frameworkVersionId: string; frameworkVersion: number;
    frameworkTitle: string; itemId: string; itemVersionId: string;
    itemVersion: number; stableKey: string; sourcedId: string;
    statement: string; conditions: string; mappingBasis: "author_declared";
  }>>();
  if (!claimVersionIds.length) return result;
  const rows = (await client.query<{
    claim_version_id: string; framework_id: string; framework_version_id: string;
    framework_version: number; framework_title: string; item_id: string;
    item_version_id: string; item_version: number; stable_key: string;
    sourced_id: string; full_statement: string; conditions_snapshot: string;
  }>(
    `SELECT alignment.claim_version_id,framework.id AS framework_id,
            framework_version.id AS framework_version_id,
            framework_version.version AS framework_version,
            framework_version.title AS framework_title,item.id AS item_id,
            item_version.id AS item_version_id,item_version.version AS item_version,
            item.stable_key,item.case_item_sourced_id AS sourced_id,
            item_version.full_statement,alignment.conditions_snapshot
     FROM competency_claim_alignments alignment
     JOIN competency_item_versions item_version
       ON item_version.id=alignment.competency_item_version_id
     JOIN competency_items item ON item.id=item_version.competency_item_id
     JOIN competency_framework_versions framework_version
       ON framework_version.id=alignment.framework_version_id
     JOIN competency_frameworks framework ON framework.id=framework_version.framework_id
     WHERE alignment.claim_version_id=ANY($1::text[])
     ORDER BY framework.stable_key,item.stable_key`,
    [claimVersionIds],
  )).rows;
  for (const row of rows) {
    const values = result.get(row.claim_version_id) ?? [];
    values.push({
      frameworkId: row.framework_id,
      frameworkVersionId: row.framework_version_id,
      frameworkVersion: Number(row.framework_version),
      frameworkTitle: row.framework_title,
      itemId: row.item_id,
      itemVersionId: row.item_version_id,
      itemVersion: Number(row.item_version),
      stableKey: row.stable_key,
      sourcedId: row.sourced_id,
      statement: row.full_statement,
      conditions: row.conditions_snapshot,
      mappingBasis: "author_declared",
    });
    result.set(row.claim_version_id, values);
  }
  return result;
}

async function ensurePassport(client: PoolClient, userId: number) {
  const result = await client.query<{ id: string; visibility: "private"; created_at: string }>(
    `INSERT INTO skill_passports (user_id)
     SELECT id FROM users WHERE id=$1 AND account_status='active'
     ON CONFLICT (user_id) DO NOTHING
     RETURNING id,visibility,created_at`,
    [userId],
  );
  const passport = result.rows[0] ?? (await client.query<{
    id: string; visibility: "private"; created_at: string;
  }>("SELECT id,visibility,created_at FROM skill_passports WHERE user_id=$1", [userId])).rows[0];
  if (!passport) throw new SkillPassportError("Passport not found");
  return passport;
}

async function eligibleCredential(client: PoolClient, userId: number, credentialId: string) {
  return (await client.query<EligibleCredential>(
    `SELECT credential.id AS credential_id,credential.user_id,credential.course_id,
            credential.course_version,course_version.title AS course_title,
            credential.assignment_version_id,credential.completion_rule_version_id,
            credential.completion_event_id,credential.participation_id,
            credential.evidence_hash,credential.issued_at,credential.expires_at,
            assignment.space_id
     FROM credential_records credential
     JOIN assignment_completion_events completion
       ON completion.id=credential.completion_event_id
      AND completion.participation_id=credential.participation_id
      AND completion.assignment_version_id=credential.assignment_version_id
      AND completion.completion_rule_version_id=credential.completion_rule_version_id
      AND completion.evidence_hash=credential.evidence_hash
      AND completion.decision='completed'
     JOIN assignment_versions assignment_version
       ON assignment_version.id=credential.assignment_version_id
      AND assignment_version.course_version=credential.course_version
     JOIN space_assignments assignment
       ON assignment.id=assignment_version.assignment_id
      AND assignment.course_id=credential.course_id
     JOIN completion_rule_versions completion_rule
       ON completion_rule.id=credential.completion_rule_version_id
      AND completion_rule.course_id=credential.course_id
      AND completion_rule.space_id=assignment.space_id
     JOIN course_versions course_version
       ON course_version.course_id=credential.course_id
      AND course_version.version_number=credential.course_version
     WHERE credential.id=$1 AND credential.user_id=$2
       AND credential.status='active'
       AND (credential.expires_at IS NULL OR credential.expires_at::timestamptz > now())
     FOR UPDATE OF credential`,
    [credentialId, userId],
  )).rows[0];
}

const CLAIM_SELECT = `
  SELECT claim.id AS claim_id,version.id AS claim_version_id,version.version,
         version.claim_type,version.title,version.statement,version.course_id,
         version.course_version,version.assignment_version_id,
         version.completion_rule_version_id,version.completion_event_id,
         version.participation_id,version.credential_id,version.evidence_hash,
         version.issued_at,version.created_at,version.supersedes_claim_version_id
  FROM competency_claims claim
  JOIN competency_claim_versions version ON version.claim_id=claim.id`;

export async function createCompetencyClaim(userId: number, credentialId: string) {
  return tx(async (client) => {
    const eligible = await eligibleCredential(client, userId, credentialId);
    if (!eligible) throw new SkillPassportError("Eligible credential not found");
    const existing = (await client.query<ClaimRow>(
      `${CLAIM_SELECT} WHERE claim.user_id=$1 AND EXISTS (
         SELECT 1 FROM competency_claim_versions used
         WHERE used.claim_id=claim.id AND used.credential_id=$2
       )
       ORDER BY version.version DESC LIMIT 1`,
      [userId, credentialId],
    )).rows[0];
    if (existing) return mapClaim(existing);

    const passport = await ensurePassport(client, userId);
    const claim = (await client.query<{ id: string }>(
      `INSERT INTO competency_claims
        (passport_id,user_id,claim_type,credential_id)
       VALUES ($1,$2,'verified_course_completion',$3) RETURNING id`,
      [passport.id, userId, credentialId],
    )).rows[0];
    const title = `Completed: ${eligible.course_title}`;
    const statement = `Verified completion of ${eligible.course_title}, version ${eligible.course_version}.`;
    const version = (await client.query<ClaimRow>(
      `INSERT INTO competency_claim_versions
        (claim_id,version,claim_type,title,statement,course_id,course_version,
         assignment_version_id,completion_rule_version_id,completion_event_id,
         participation_id,credential_id,evidence_hash,issued_at)
       VALUES ($1,1,'verified_course_completion',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING $1::text AS claim_id,id AS claim_version_id,version,claim_type,
         title,statement,course_id,course_version,assignment_version_id,
         completion_rule_version_id,completion_event_id,participation_id,
         credential_id,evidence_hash,issued_at,created_at,
         NULL::text AS supersedes_claim_version_id`,
      [claim.id, title, statement, eligible.course_id, eligible.course_version,
       eligible.assignment_version_id, eligible.completion_rule_version_id,
       eligible.completion_event_id, eligible.participation_id,
       eligible.credential_id, eligible.evidence_hash, eligible.issued_at],
    )).rows[0];
    await snapshotClaimCompetencyAlignments(client, {
      claimVersionId: version.claim_version_id,
      spaceId: eligible.space_id,
      courseId: eligible.course_id,
      courseVersion: eligible.course_version,
    });
    await client.query(
      `INSERT INTO skill_passport_entries (passport_id,claim_version_id)
       VALUES ($1,$2)`,
      [passport.id, version.claim_version_id],
    );
    return mapClaim(version);
  });
}

export async function getSkillPassport(actorUserId: number, passportOwnerUserId = actorUserId) {
  if (actorUserId !== passportOwnerUserId) throw new SkillPassportError("Passport not found");
  return tx(async (client) => {
    const passport = await ensurePassport(client, actorUserId);
    const claimRows = (await client.query<(ClaimRow & {
      credential_status: string;
      credential_expires_at: string | null;
      completion_decision: string;
      is_current: boolean;
      score_percent: number | null;
      rule_evaluation_json: string;
      evidence_manifest_json: string;
    })>(
      `SELECT claim.id AS claim_id,version.id AS claim_version_id,version.version,
         version.claim_type,version.title,version.statement,version.course_id,
         version.course_version,version.assignment_version_id,
         version.completion_rule_version_id,version.completion_event_id,
         version.participation_id,version.credential_id,version.evidence_hash,
         version.issued_at,version.created_at,version.supersedes_claim_version_id,
         NOT EXISTS (
           SELECT 1 FROM competency_claim_versions newer
           WHERE newer.claim_id=claim.id AND newer.version>version.version
         ) AS is_current,credential.status AS credential_status,
         credential.expires_at AS credential_expires_at,
         completion.decision AS completion_decision,completion.score_percent,
         completion.rule_evaluation_json,completion.evidence_manifest_json
       FROM competency_claims claim
       JOIN competency_claim_versions version ON version.claim_id=claim.id
       JOIN skill_passport_entries entry ON entry.claim_version_id=version.id
       JOIN credential_records credential ON credential.id=version.credential_id
       JOIN assignment_completion_events completion ON completion.id=version.completion_event_id
       WHERE claim.user_id=$1 AND entry.passport_id=$2
       ORDER BY version.issued_at DESC,version.id`,
      [actorUserId, passport.id],
    )).rows;
    const alignmentsByClaim = await claimCompetencyAlignments(
      client,
      claimRows.map((row) => row.claim_version_id),
    );
    const claims = claimRows.map((row) => {
      const expired = Boolean(row.credential_expires_at && Date.parse(row.credential_expires_at) <= Date.now());
      const shareable = row.is_current && row.credential_status === "active"
        && !expired && row.completion_decision === "completed";
      return {
        ...mapClaim(row),
        competencies: alignmentsByClaim.get(row.claim_version_id) ?? [],
        evidenceSummary: evidenceSummary(row),
        isCurrent: row.is_current,
        shareable,
        availability: !row.is_current ? "superseded" : shareable ? "active"
          : row.credential_status === "revoked" || row.completion_decision !== "completed" ? "revoked"
          : "expired",
      };
    });
    const eligibleCredentials = (await client.query<{
      id: string; course_title: string; course_version: number; issued_at: string; expires_at: string | null;
    }>(
      `SELECT credential.id,course_version.title AS course_title,
              credential.course_version,credential.issued_at,credential.expires_at
       FROM credential_records credential
       JOIN assignment_completion_events completion
         ON completion.id=credential.completion_event_id
        AND completion.decision='completed'
        AND completion.evidence_hash=credential.evidence_hash
       JOIN course_versions course_version
         ON course_version.course_id=credential.course_id
        AND course_version.version_number=credential.course_version
       LEFT JOIN competency_claim_versions used_version
         ON used_version.credential_id=credential.id
       WHERE credential.user_id=$1 AND credential.status='active'
         AND (credential.expires_at IS NULL OR credential.expires_at::timestamptz > now())
         AND used_version.id IS NULL
       ORDER BY credential.issued_at DESC`,
      [actorUserId],
    )).rows.map((row) => ({
      credentialId: row.id,
      courseTitle: row.course_title,
      courseVersion: Number(row.course_version),
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    }));
    const shares = (await client.query<{
      id: string; status: string; include_learner_name: number; expires_at: string;
      created_at: string; claim_count: number;
    }>(
      `SELECT share.id,share.status,share.include_learner_name,share.expires_at,
              share.created_at,COUNT(selected.claim_version_id)::int AS claim_count
       FROM passport_share_grants share
       JOIN passport_share_claims selected ON selected.share_id=share.id
       WHERE share.user_id=$1 AND share.passport_id=$2
       GROUP BY share.id ORDER BY share.created_at DESC`,
      [actorUserId, passport.id],
    )).rows.map((row) => ({
      id: row.id,
      status: row.status,
      includeLearnerName: row.include_learner_name === 1,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      claimCount: Number(row.claim_count),
    }));
    const accessHistory = (await client.query<{
      id: string; share_id: string; claim_count: number;
      learner_name_disclosed: number; occurred_at: string; retain_until: string;
    }>(
      `SELECT event.id,event.share_id,event.claim_count,event.learner_name_disclosed,
              event.occurred_at,event.retain_until
       FROM passport_verification_events event
       JOIN passport_share_grants share ON share.id=event.share_id
       WHERE share.user_id=$1 AND share.passport_id=$2
         AND event.retain_until::timestamptz > now()
       ORDER BY event.occurred_at DESC,event.id DESC LIMIT 50`,
      [actorUserId, passport.id],
    )).rows.map((row) => ({
      id: row.id,
      shareId: row.share_id,
      claimCount: Number(row.claim_count),
      learnerNameDisclosed: row.learner_name_disclosed === 1,
      occurredAt: row.occurred_at,
      retainUntil: row.retain_until,
    }));
    const disputes = (await client.query<{
      id: string; claim_id: string; disputed_claim_version_id: string; category: string;
      status: string; created_at: string; resolved_at: string | null;
      resolution_code: string | null; resulting_claim_version_id: string | null;
      statement: string | null;
    }>(
      `SELECT dispute.id,dispute.claim_id,dispute.disputed_claim_version_id,
              dispute.category,dispute.status,dispute.created_at,dispute.resolved_at,
              dispute.resolution_code,dispute.resulting_claim_version_id,details.statement
       FROM competency_claim_disputes dispute
       LEFT JOIN competency_claim_dispute_details details ON details.dispute_id=dispute.id
       WHERE dispute.learner_user_id=$1
       ORDER BY dispute.created_at DESC,dispute.id DESC`,
      [actorUserId],
    )).rows.map((row) => ({
      id: row.id,
      claimId: row.claim_id,
      disputedClaimVersionId: row.disputed_claim_version_id,
      category: row.category,
      statement: row.statement,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolutionCode: row.resolution_code,
      resultingClaimVersionId: row.resulting_claim_version_id,
    }));
    const signedCredentials = (await client.query<{
      id: string; claim_version_id: string; title: string; status: string;
      issued_at: string; revoked_at: string | null;
    }>(
      `SELECT badge.id,badge.claim_version_id,version.title,badge.status,
              badge.issued_at,badge.revoked_at
       FROM open_badge_credentials badge
       JOIN competency_claim_versions version ON version.id=badge.claim_version_id
       WHERE badge.learner_user_id=$1
       ORDER BY badge.issued_at DESC,badge.id DESC`,
      [actorUserId],
    )).rows.map((row) => ({
      id: row.id,
      claimVersionId: row.claim_version_id,
      title: row.title,
      status: row.status,
      issuedAt: row.issued_at,
      revokedAt: row.revoked_at,
    }));
    return {
      passport: { id: passport.id, visibility: passport.visibility, createdAt: passport.created_at },
      claims,
      eligibleCredentials,
      shares,
      accessHistory,
      disputes,
      signedCredentials,
    };
  });
}

export async function createPassportShare(userId: number, input: {
  claimVersionIds: string[];
  expiresAt: string;
  includeLearnerName?: boolean;
}) {
  const claimVersionIds = [...new Set(input.claimVersionIds)];
  if (!claimVersionIds.length || claimVersionIds.length > 20) {
    throw new SkillPassportError("Select between one and twenty claims");
  }
  const expiresAt = Date.parse(input.expiresAt);
  const now = Date.now();
  if (Number.isNaN(expiresAt) || expiresAt <= now || expiresAt > now + MAX_SHARE_DAYS * 86_400_000) {
    throw new SkillPassportError("Share expiry must be within the next 30 days");
  }
  return tx(async (client) => {
    const passport = await ensurePassport(client, userId);
    const selected = (await client.query<{ id: string }>(
      `SELECT version.id
       FROM competency_claim_versions version
       JOIN competency_claims claim ON claim.id=version.claim_id
       JOIN skill_passport_entries entry ON entry.claim_version_id=version.id
       JOIN credential_records credential
         ON credential.id=version.credential_id AND credential.user_id=claim.user_id
       JOIN assignment_completion_events completion
         ON completion.id=version.completion_event_id
        AND completion.decision='completed'
        AND completion.evidence_hash=version.evidence_hash
       WHERE claim.user_id=$1 AND claim.passport_id=$2 AND entry.passport_id=$2
         AND version.id=ANY($3::text[]) AND credential.status='active'
         AND (credential.expires_at IS NULL OR credential.expires_at::timestamptz > now())
         AND NOT EXISTS (
           SELECT 1 FROM competency_claim_versions newer
           WHERE newer.claim_id=claim.id AND newer.version>version.version
         )
       FOR SHARE OF claim,version,credential`,
      [userId, passport.id, claimVersionIds],
    )).rows;
    if (selected.length !== claimVersionIds.length) {
      throw new SkillPassportError("One or more claims are unavailable");
    }
    const selectedSet = new Set(selected.map((row) => row.id));
    if (claimVersionIds.some((id) => !selectedSet.has(id))) {
      throw new SkillPassportError("One or more claims are unavailable");
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const share = (await client.query<{ id: string; created_at: string }>(
      `INSERT INTO passport_share_grants
        (passport_id,user_id,token_hash,include_learner_name,expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,created_at`,
      [passport.id, userId, secretDigest(token), input.includeLearnerName ? 1 : 0, input.expiresAt],
    )).rows[0];
    for (const [position, claimVersionId] of claimVersionIds.entries()) {
      await client.query(
        `INSERT INTO passport_share_claims (share_id,claim_version_id,position)
         VALUES ($1,$2,$3)`,
        [share.id, claimVersionId, position],
      );
    }
    await client.query(
      `INSERT INTO passport_share_consent_events (share_id,decision,actor_user_id)
       VALUES ($1,'granted',$2)`,
      [share.id, userId],
    );
    await client.query(
      `INSERT INTO passport_share_status_events (share_id,event_type,actor_user_id)
       VALUES ($1,'issued',$2)`,
      [share.id, userId],
    );
    return {
      id: share.id,
      token,
      status: "active" as const,
      claimVersionIds,
      includeLearnerName: input.includeLearnerName === true,
      expiresAt: input.expiresAt,
      createdAt: share.created_at,
    };
  });
}

export async function verifyPassportShare(token: string, at = new Date()) {
  if (!SHARE_TOKEN_PATTERN.test(token)) return null;
  return tx(async (client) => {
    const share = (await client.query<{
      id: string; passport_id: string; user_id: number; status: string;
      include_learner_name: number; expires_at: string; learner_name: string;
      consent_decision: string | null;
    }>(
      `SELECT share.id,share.passport_id,share.user_id,share.status,
              share.include_learner_name,share.expires_at,users.name AS learner_name,
              consent.decision AS consent_decision
       FROM passport_share_grants share
       JOIN users ON users.id=share.user_id
       LEFT JOIN LATERAL (
         SELECT decision FROM passport_share_consent_events
         WHERE share_id=share.id ORDER BY occurred_at DESC,id DESC LIMIT 1
       ) consent ON true
       WHERE share.token_hash=$1
       FOR SHARE OF share`,
      [secretDigest(token)],
    )).rows[0];
    if (!share || share.status !== "active" || share.consent_decision !== "granted"
        || Date.parse(share.expires_at) <= at.getTime()) return null;

    const rows = (await client.query<(ClaimRow & {
      credential_status: string;
      credential_expires_at: string | null;
      completion_decision: string;
      completion_participation_id: string;
      completion_assignment_version_id: string;
      completion_rule_version_id_live: string;
      completion_evidence_hash: string;
      score_percent: number | null;
      rule_evaluation_json: string;
      evidence_manifest_json: string;
    })>(
      `SELECT claim.id AS claim_id,version.id AS claim_version_id,version.version,
              version.claim_type,version.title,version.statement,version.course_id,
              version.course_version,version.assignment_version_id,
              version.completion_rule_version_id,version.completion_event_id,
              version.participation_id,version.credential_id,version.evidence_hash,
              version.issued_at,version.created_at,version.supersedes_claim_version_id,
              credential.status AS credential_status,
              credential.expires_at AS credential_expires_at,
              completion.decision AS completion_decision,
              completion.participation_id AS completion_participation_id,
              completion.assignment_version_id AS completion_assignment_version_id,
              completion.completion_rule_version_id AS completion_rule_version_id_live,
              completion.evidence_hash AS completion_evidence_hash,
              completion.score_percent,completion.rule_evaluation_json,
              completion.evidence_manifest_json
       FROM passport_share_claims selected
       JOIN competency_claim_versions version ON version.id=selected.claim_version_id
       JOIN competency_claims claim
         ON claim.id=version.claim_id AND claim.passport_id=$2 AND claim.user_id=$3
       JOIN credential_records credential ON credential.id=version.credential_id
       JOIN assignment_completion_events completion ON completion.id=version.completion_event_id
       WHERE selected.share_id=$1
         AND NOT EXISTS (
           SELECT 1 FROM competency_claim_versions newer
           WHERE newer.claim_id=claim.id AND newer.version>version.version
         )
       ORDER BY selected.position
       FOR SHARE OF claim,credential`,
      [share.id, share.passport_id, share.user_id],
    )).rows;
    const expected = (await client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM passport_share_claims WHERE share_id=$1",
      [share.id],
    )).rows[0]?.count ?? 0;
    if (!rows.length || rows.length !== Number(expected)) return null;
    for (const row of rows) {
      if (row.credential_status !== "active"
        || (row.credential_expires_at && Date.parse(row.credential_expires_at) <= at.getTime())
        || row.completion_decision !== "completed"
        || row.completion_participation_id !== row.participation_id
        || row.completion_assignment_version_id !== row.assignment_version_id
        || row.completion_rule_version_id_live !== row.completion_rule_version_id
        || row.completion_evidence_hash !== row.evidence_hash) return null;
    }
    const alignmentsByClaim = await claimCompetencyAlignments(
      client,
      rows.map((row) => row.claim_version_id),
    );
    const retainUntil = new Date(at.getTime() + 90 * 86_400_000).toISOString();
    await client.query(
      `INSERT INTO passport_verification_events
        (share_id,claim_count,learner_name_disclosed,occurred_at,retain_until)
       VALUES ($1,$2,$3,$4,$5)`,
      [share.id, rows.length, share.include_learner_name, at.toISOString(), retainUntil],
    );
    return {
      learnerName: share.include_learner_name === 1 ? share.learner_name : null,
      expiresAt: share.expires_at,
      verifiedAt: at.toISOString(),
      claims: rows.map((row) => ({
        ...mapClaim(row),
        competencies: alignmentsByClaim.get(row.claim_version_id) ?? [],
        evidenceSummary: evidenceSummary(row),
      })),
    };
  });
}

export async function createCompetencyClaimDispute(userId: number, input: {
  claimVersionId: string;
  category: string;
  statement: string;
}) {
  const statement = input.statement.trim();
  if (!DISPUTE_CATEGORIES.has(input.category)) {
    throw new SkillPassportError("Choose a valid dispute category");
  }
  if (statement.length < 20 || statement.length > 2000) {
    throw new SkillPassportError("Dispute explanation must be between 20 and 2000 characters");
  }
  return tx(async (client) => {
    const claim = (await client.query<{
      claim_id: string; claim_version_id: string; space_id: string;
    }>(
      `SELECT claim.id AS claim_id,version.id AS claim_version_id,assignment.space_id
       FROM competency_claim_versions version
       JOIN competency_claims claim ON claim.id=version.claim_id
       JOIN assignment_versions assignment_version ON assignment_version.id=version.assignment_version_id
       JOIN space_assignments assignment ON assignment.id=assignment_version.assignment_id
       WHERE version.id=$1 AND claim.user_id=$2
         AND NOT EXISTS (
           SELECT 1 FROM competency_claim_versions newer
           WHERE newer.claim_id=claim.id AND newer.version>version.version
         )
       FOR SHARE OF claim,version`,
      [input.claimVersionId, userId],
    )).rows[0];
    if (!claim) throw new SkillPassportError("Claim not found");
    const open = (await client.query<{ id: string }>(
      `SELECT id FROM competency_claim_disputes
       WHERE disputed_claim_version_id=$1 AND status='open'`,
      [input.claimVersionId],
    )).rows[0];
    if (open) throw new SkillPassportError("An open dispute already exists for this claim version");
    let dispute: {
      id: string; claim_id: string; disputed_claim_version_id: string;
      category: string; status: string; created_at: string;
    };
    try {
      dispute = (await client.query<typeof dispute>(
        `INSERT INTO competency_claim_disputes
          (claim_id,disputed_claim_version_id,learner_user_id,space_id,category)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id,claim_id,disputed_claim_version_id,category,status,created_at`,
        [claim.claim_id, claim.claim_version_id, userId, claim.space_id, input.category],
      )).rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new SkillPassportError("An open dispute already exists for this claim version");
      }
      throw error;
    }
    await client.query(
      `INSERT INTO competency_claim_dispute_details (dispute_id,learner_user_id,statement)
       VALUES ($1,$2,$3)`,
      [dispute.id, userId, statement],
    );
    await client.query(
      `INSERT INTO competency_claim_dispute_events (dispute_id,event_type,actor_user_id)
       VALUES ($1,'submitted',$2)`,
      [dispute.id, userId],
    );
    return {
      id: dispute.id,
      claimId: dispute.claim_id,
      disputedClaimVersionId: dispute.disputed_claim_version_id,
      category: dispute.category,
      status: dispute.status,
      statement,
      createdAt: dispute.created_at,
    };
  });
}

export async function withdrawCompetencyClaimDispute(userId: number, disputeId: string) {
  return tx(async (client) => {
    const dispute = (await client.query<{ id: string; status: string }>(
      `SELECT id,status FROM competency_claim_disputes
       WHERE id=$1 AND learner_user_id=$2 FOR UPDATE`,
      [disputeId, userId],
    )).rows[0];
    if (!dispute) throw new SkillPassportError("Dispute not found");
    if (dispute.status !== "open") throw new SkillPassportError("Dispute state is terminal");
    const at = new Date().toISOString();
    const updated = (await client.query<{ id: string; status: string }>(
      `UPDATE competency_claim_disputes
       SET status='withdrawn',resolved_at=$2,resolved_by_user_id=$3,
           resolution_code='learner_withdrew'
       WHERE id=$1 RETURNING id,status`,
      [disputeId, at, userId],
    )).rows[0];
    await client.query(
      `INSERT INTO competency_claim_dispute_events
        (dispute_id,event_type,actor_user_id,resolution_code,occurred_at)
       VALUES ($1,'withdrawn',$2,'learner_withdrew',$3)`,
      [disputeId, userId, at],
    );
    return updated;
  });
}

type SpaceDisputeRow = {
  id: string; claim_id: string; disputed_claim_version_id: string;
  learner_user_id: number; learner_name: string; space_id: string; category: string;
  status: string; created_at: string; resolved_at: string | null;
  resolution_code: string | null; resulting_claim_version_id: string | null;
  statement: string | null; title: string; course_id: number; course_version: number;
  disputed_credential_id: string;
};

export async function listSpaceCompetencyClaimDisputes(actorUserId: number, spaceId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    const disputes = (await client.query<SpaceDisputeRow>(
      `SELECT dispute.id,dispute.claim_id,dispute.disputed_claim_version_id,
              dispute.learner_user_id,learner.name AS learner_name,dispute.space_id,
              dispute.category,dispute.status,dispute.created_at,dispute.resolved_at,
              dispute.resolution_code,dispute.resulting_claim_version_id,details.statement,
              version.title,version.course_id,version.course_version,
              version.credential_id AS disputed_credential_id
       FROM competency_claim_disputes dispute
       JOIN users learner ON learner.id=dispute.learner_user_id
       JOIN competency_claim_versions version ON version.id=dispute.disputed_claim_version_id
       LEFT JOIN competency_claim_dispute_details details ON details.dispute_id=dispute.id
       WHERE dispute.space_id=$1
       ORDER BY (dispute.status='open') DESC,dispute.created_at DESC,dispute.id DESC
       LIMIT 50`,
      [spaceId],
    )).rows;
    const result = [];
    for (const dispute of disputes) {
      const replacements = (await client.query<{
        id: string; course_version: number; issued_at: string; expires_at: string | null;
      }>(
        `SELECT credential.id,credential.course_version,credential.issued_at,credential.expires_at
         FROM credential_records credential
         JOIN assignment_completion_events completion
           ON completion.id=credential.completion_event_id
          AND completion.participation_id=credential.participation_id
          AND completion.assignment_version_id=credential.assignment_version_id
          AND completion.completion_rule_version_id=credential.completion_rule_version_id
          AND completion.evidence_hash=credential.evidence_hash
          AND completion.decision='completed'
         JOIN assignment_versions assignment_version
           ON assignment_version.id=credential.assignment_version_id
         JOIN space_assignments assignment
           ON assignment.id=assignment_version.assignment_id
          AND assignment.course_id=credential.course_id
         LEFT JOIN competency_claim_versions used ON used.credential_id=credential.id
         WHERE credential.user_id=$1 AND credential.course_id=$2
           AND assignment.space_id=$3 AND credential.id<>$4
           AND credential.status='active'
           AND (credential.expires_at IS NULL OR credential.expires_at::timestamptz>now())
           AND used.id IS NULL
         ORDER BY credential.issued_at DESC`,
        [dispute.learner_user_id, dispute.course_id, spaceId, dispute.disputed_credential_id],
      )).rows.map((row) => ({
        credentialId: row.id,
        courseVersion: Number(row.course_version),
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
      }));
      result.push({
        id: dispute.id,
        claimId: dispute.claim_id,
        disputedClaimVersionId: dispute.disputed_claim_version_id,
        learnerUserId: dispute.learner_user_id,
        learnerName: dispute.learner_name,
        category: dispute.category,
        statement: dispute.statement,
        status: dispute.status,
        title: dispute.title,
        courseId: Number(dispute.course_id),
        courseVersion: Number(dispute.course_version),
        createdAt: dispute.created_at,
        resolvedAt: dispute.resolved_at,
        resolutionCode: dispute.resolution_code,
        resultingClaimVersionId: dispute.resulting_claim_version_id,
        replacementCredentials: replacements,
      });
    }
    return result;
  });
}

export async function resolveCompetencyClaimDispute(
  actorUserId: number,
  spaceId: string,
  disputeId: string,
  input: {
    decision: "accepted" | "rejected";
    resolutionCode: "corrected_with_replacement" | "evidence_confirmed" | "insufficient_information";
    replacementCredentialId?: string;
  },
) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    const dispute = (await client.query<SpaceDisputeRow>(
      `SELECT dispute.id,dispute.claim_id,dispute.disputed_claim_version_id,
              dispute.learner_user_id,learner.name AS learner_name,dispute.space_id,
              dispute.category,dispute.status,dispute.created_at,dispute.resolved_at,
              dispute.resolution_code,dispute.resulting_claim_version_id,details.statement,
              version.title,version.course_id,version.course_version,
              version.credential_id AS disputed_credential_id
       FROM competency_claim_disputes dispute
       JOIN users learner ON learner.id=dispute.learner_user_id
       JOIN competency_claim_versions version ON version.id=dispute.disputed_claim_version_id
       LEFT JOIN competency_claim_dispute_details details ON details.dispute_id=dispute.id
       WHERE dispute.id=$1 AND dispute.space_id=$2
       FOR UPDATE OF dispute`,
      [disputeId, spaceId],
    )).rows[0];
    if (!dispute) throw new SkillPassportError("Dispute not found");
    if (dispute.status !== "open") throw new SkillPassportError("Dispute state is terminal");
    const at = new Date().toISOString();
    if (input.decision === "rejected") {
      if (!new Set(["evidence_confirmed", "insufficient_information"]).has(input.resolutionCode)) {
        throw new SkillPassportError("Choose a valid rejection result");
      }
      const updated = (await client.query<{
        id: string; status: string; resolution_code: string;
      }>(
        `UPDATE competency_claim_disputes
         SET status='rejected',resolved_at=$2,resolved_by_user_id=$3,resolution_code=$4
         WHERE id=$1 RETURNING id,status,resolution_code`,
        [disputeId, at, actorUserId, input.resolutionCode],
      )).rows[0];
      await client.query(
        `INSERT INTO competency_claim_dispute_events
          (dispute_id,event_type,actor_user_id,resolution_code,occurred_at)
         VALUES ($1,'rejected',$2,$3,$4)`,
        [disputeId, actorUserId, input.resolutionCode, at],
      );
      return { id: updated.id, status: updated.status, resolutionCode: updated.resolution_code };
    }
    if (input.resolutionCode !== "corrected_with_replacement" || !input.replacementCredentialId) {
      throw new SkillPassportError("Accepted corrections require replacement credential evidence");
    }
    await client.query("SELECT id FROM competency_claims WHERE id=$1 FOR UPDATE", [dispute.claim_id]);
    const latest = (await client.query<{ id: string; version: number }>(
      `SELECT id,version FROM competency_claim_versions
       WHERE claim_id=$1 ORDER BY version DESC LIMIT 1`,
      [dispute.claim_id],
    )).rows[0];
    if (!latest || latest.id !== dispute.disputed_claim_version_id) {
      throw new SkillPassportError("Dispute state is terminal");
    }
    const replacement = await eligibleCredential(
      client,
      dispute.learner_user_id,
      input.replacementCredentialId,
    );
    const alreadyUsed = replacement ? (await client.query<{ id: string }>(
      "SELECT id FROM competency_claim_versions WHERE credential_id=$1",
      [replacement.credential_id],
    )).rows[0] : null;
    if (!replacement || alreadyUsed || replacement.credential_id === dispute.disputed_credential_id
        || replacement.course_id !== Number(dispute.course_id) || replacement.space_id !== spaceId) {
      throw new SkillPassportError("Replacement credential unavailable");
    }
    const title = `Completed: ${replacement.course_title}`;
    const statement = `Verified completion of ${replacement.course_title}, version ${replacement.course_version}.`;
    const version = (await client.query<ClaimRow>(
      `INSERT INTO competency_claim_versions
        (claim_id,version,claim_type,title,statement,course_id,course_version,
         assignment_version_id,completion_rule_version_id,completion_event_id,
         participation_id,credential_id,evidence_hash,issued_at,supersedes_claim_version_id)
       VALUES ($1,$2,'verified_course_completion',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING $1::text AS claim_id,id AS claim_version_id,version,claim_type,
         title,statement,course_id,course_version,assignment_version_id,
         completion_rule_version_id,completion_event_id,participation_id,
         credential_id,evidence_hash,issued_at,created_at,supersedes_claim_version_id`,
      [dispute.claim_id, Number(latest.version) + 1, title, statement,
       replacement.course_id, replacement.course_version,replacement.assignment_version_id,
       replacement.completion_rule_version_id,replacement.completion_event_id,
       replacement.participation_id,replacement.credential_id,replacement.evidence_hash,
       replacement.issued_at,dispute.disputed_claim_version_id],
    )).rows[0];
    await snapshotClaimCompetencyAlignments(client, {
      claimVersionId: version.claim_version_id,
      spaceId,
      courseId: replacement.course_id,
      courseVersion: replacement.course_version,
    });
    const passportId = (await client.query<{ passport_id: string }>(
      "SELECT passport_id FROM competency_claims WHERE id=$1",
      [dispute.claim_id],
    )).rows[0].passport_id;
    await client.query(
      `INSERT INTO skill_passport_entries (passport_id,claim_version_id) VALUES ($1,$2)`,
      [passportId, version.claim_version_id],
    );
    await client.query(
      `UPDATE competency_claim_disputes
       SET status='accepted',resolved_at=$2,resolved_by_user_id=$3,
           resolution_code='corrected_with_replacement',replacement_credential_id=$4,
           resulting_claim_version_id=$5
       WHERE id=$1`,
      [disputeId, at, actorUserId, replacement.credential_id, version.claim_version_id],
    );
    await client.query(
      `INSERT INTO competency_claim_dispute_events
        (dispute_id,event_type,actor_user_id,resolution_code,resulting_claim_version_id,occurred_at)
       VALUES ($1,'accepted',$2,'corrected_with_replacement',$3,$4)`,
      [disputeId, actorUserId, version.claim_version_id, at],
    );
    return {
      id: disputeId,
      status: "accepted" as const,
      resolutionCode: "corrected_with_replacement" as const,
      resultingClaim: mapClaim(version),
    };
  });
}

async function transitionShare(
  userId: number,
  shareId: string,
  action: "revoked" | "consent_withdrawn",
) {
  return tx(async (client) => {
    const share = (await client.query<{ id: string; status: string }>(
      `SELECT id,status FROM passport_share_grants
       WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [shareId, userId],
    )).rows[0];
    if (!share) throw new SkillPassportError("Share not found");
    if (share.status !== "active") throw new SkillPassportError("Share state is terminal");
    const at = new Date().toISOString();
    const timestampColumn = action === "revoked" ? "revoked_at" : "consent_withdrawn_at";
    const updated = (await client.query<{ id: string; status: string }>(
      `UPDATE passport_share_grants SET status=$2,${timestampColumn}=$3
       WHERE id=$1 RETURNING id,status`,
      [shareId, action, at],
    )).rows[0];
    if (action === "consent_withdrawn") {
      await client.query(
        `INSERT INTO passport_share_consent_events (share_id,decision,actor_user_id,occurred_at)
         VALUES ($1,'withdrawn',$2,$3)`,
        [shareId, userId, at],
      );
    }
    await client.query(
      `INSERT INTO passport_share_status_events (share_id,event_type,actor_user_id,occurred_at)
       VALUES ($1,$2,$3,$4)`,
      [shareId, action, userId, at],
    );
    return updated;
  });
}

export async function revokePassportShare(userId: number, shareId: string) {
  return transitionShare(userId, shareId, "revoked");
}

export async function withdrawPassportShareConsent(userId: number, shareId: string) {
  return transitionShare(userId, shareId, "consent_withdrawn");
}
