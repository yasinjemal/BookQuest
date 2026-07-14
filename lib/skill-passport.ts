import crypto from "crypto";
import type { PoolClient } from "pg";
import { pool, ready, tx } from "./pg";

const MAX_SHARE_DAYS = 30;
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const secretDigest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

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
            credential.evidence_hash,credential.issued_at,credential.expires_at
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
         version.issued_at,version.created_at
  FROM competency_claims claim
  JOIN competency_claim_versions version ON version.claim_id=claim.id`;

export async function createCompetencyClaim(userId: number, credentialId: string) {
  return tx(async (client) => {
    const eligible = await eligibleCredential(client, userId, credentialId);
    if (!eligible) throw new SkillPassportError("Eligible credential not found");
    const existing = (await client.query<ClaimRow>(
      `${CLAIM_SELECT} WHERE claim.user_id=$1 AND claim.credential_id=$2`,
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
         credential_id,evidence_hash,issued_at,created_at`,
      [claim.id, title, statement, eligible.course_id, eligible.course_version,
       eligible.assignment_version_id, eligible.completion_rule_version_id,
       eligible.completion_event_id, eligible.participation_id,
       eligible.credential_id, eligible.evidence_hash, eligible.issued_at],
    )).rows[0];
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
    })>(
      `SELECT claim.id AS claim_id,version.id AS claim_version_id,version.version,
         version.claim_type,version.title,version.statement,version.course_id,
         version.course_version,version.assignment_version_id,
         version.completion_rule_version_id,version.completion_event_id,
         version.participation_id,version.credential_id,version.evidence_hash,
         version.issued_at,version.created_at,credential.status AS credential_status,
         credential.expires_at AS credential_expires_at,
         completion.decision AS completion_decision
       FROM competency_claims claim
       JOIN competency_claim_versions version ON version.claim_id=claim.id
       JOIN skill_passport_entries entry ON entry.claim_version_id=version.id
       JOIN credential_records credential ON credential.id=version.credential_id
       JOIN assignment_completion_events completion ON completion.id=version.completion_event_id
       WHERE claim.user_id=$1 AND entry.passport_id=$2
       ORDER BY version.issued_at DESC,version.id`,
      [actorUserId, passport.id],
    )).rows;
    const claims = claimRows.map((row) => {
      const expired = Boolean(row.credential_expires_at && Date.parse(row.credential_expires_at) <= Date.now());
      const shareable = row.credential_status === "active" && !expired && row.completion_decision === "completed";
      return {
        ...mapClaim(row),
        shareable,
        availability: shareable ? "active"
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
       LEFT JOIN competency_claims claim
         ON claim.credential_id=credential.id AND claim.user_id=credential.user_id
       WHERE credential.user_id=$1 AND credential.status='active'
         AND (credential.expires_at IS NULL OR credential.expires_at::timestamptz > now())
         AND claim.id IS NULL
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
    return {
      passport: { id: passport.id, visibility: passport.visibility, createdAt: passport.created_at },
      claims,
      eligibleCredentials,
      shares,
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
       FOR SHARE OF version,credential`,
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
  await ready();
  const share = (await pool.query<{
    id: string; passport_id: string; user_id: number; status: string;
    include_learner_name: number; expires_at: string; learner_name: string; consent_decision: string | null;
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
     WHERE share.token_hash=$1`,
    [secretDigest(token)],
  )).rows[0];
  if (!share || share.status !== "active" || share.consent_decision !== "granted"
      || Date.parse(share.expires_at) <= at.getTime()) return null;

  const rows = (await pool.query<(ClaimRow & {
    credential_status: string;
    credential_expires_at: string | null;
    completion_decision: string;
    completion_participation_id: string;
    completion_assignment_version_id: string;
    completion_rule_version_id_live: string;
    completion_evidence_hash: string;
  })>(
    `SELECT claim.id AS claim_id,version.id AS claim_version_id,version.version,
            version.claim_type,version.title,version.statement,version.course_id,
            version.course_version,version.assignment_version_id,
            version.completion_rule_version_id,version.completion_event_id,
            version.participation_id,version.credential_id,version.evidence_hash,
            version.issued_at,version.created_at,credential.status AS credential_status,
            credential.expires_at AS credential_expires_at,
            completion.decision AS completion_decision,
            completion.participation_id AS completion_participation_id,
            completion.assignment_version_id AS completion_assignment_version_id,
            completion.completion_rule_version_id AS completion_rule_version_id_live,
            completion.evidence_hash AS completion_evidence_hash
     FROM passport_share_claims selected
     JOIN competency_claim_versions version ON version.id=selected.claim_version_id
     JOIN competency_claims claim
       ON claim.id=version.claim_id AND claim.passport_id=$2 AND claim.user_id=$3
     JOIN credential_records credential ON credential.id=version.credential_id
     JOIN assignment_completion_events completion ON completion.id=version.completion_event_id
     WHERE selected.share_id=$1
     ORDER BY selected.position`,
    [share.id, share.passport_id, share.user_id],
  )).rows;
  const expected = (await pool.query<{ count: number }>(
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
  return {
    learnerName: share.include_learner_name === 1 ? share.learner_name : null,
    expiresAt: share.expires_at,
    verifiedAt: at.toISOString(),
    claims: rows.map(mapClaim),
  };
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
