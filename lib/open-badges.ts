import crypto, { type JsonWebKey } from "crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { one, tx } from "./pg";
import { SkillPassportError } from "./skill-passport";
import { authorizeStoredMembership } from "./spaces";
import { enqueueWebhookEvent } from "./integrations";

export const OPEN_BADGES_CONTEXT = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json";
export const VC_CONTEXT = "https://www.w3.org/ns/credentials/v2";
export const OPEN_BADGES_SCHEMA = "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json";
export const OPEN_BADGES_EXPORT_PROFILE = "bookquest-open-badges-3.0-jsonld-document-v1";

const uri = z.string().url().or(z.string().regex(/^urn:[a-z0-9][a-z0-9-]{0,31}:.+/i));
const openBadgeDocumentSchema = z.object({
  "@context": z.tuple([z.literal(VC_CONTEXT), z.literal(OPEN_BADGES_CONTEXT)]),
  id: uri,
  type: z.array(z.string()).superRefine((types, context) => {
    for (const required of ["VerifiableCredential", "OpenBadgeCredential"]) {
      if (!types.includes(required)) context.addIssue({ code: "custom", message: `type must include ${required}` });
    }
  }),
  issuer: z.object({ id: uri, type: z.array(z.string()).refine((value) => value.includes("Profile")), name: z.string().min(1) }),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
  credentialSubject: z.object({
    id: uri,
    type: z.array(z.string()).refine((value) => value.includes("AchievementSubject")),
    name: z.string().min(1).optional(),
    achievement: z.object({
      id: uri,
      type: z.array(z.string()).refine((value) => value.includes("Achievement")),
      name: z.string().min(1),
      description: z.string().min(1),
      criteria: z.object({ narrative: z.string().min(1) }),
      alignment: z.array(z.object({
        type: z.array(z.string()).refine((value) => value.includes("Alignment")),
        targetCode: z.string().min(1),
        targetFramework: z.string().min(1),
        targetName: z.string().min(1),
        targetType: z.string().min(1),
        targetUrl: uri,
      })).optional(),
    }),
  }),
  evidence: z.array(z.object({ id: uri, type: z.array(z.string()).refine((value) => value.includes("Evidence")), name: z.string().min(1), description: z.string().min(1) })).min(1),
  credentialSchema: z.array(z.object({
    id: z.literal(OPEN_BADGES_SCHEMA),
    type: z.literal("1EdTechJsonSchemaValidator2019"),
  })).min(1),
  credentialStatus: z.object({ id: uri, type: z.literal("BookQuestCredentialStatus2026") }).optional(),
}).strict();

export type OpenBadgeDocument = z.infer<typeof openBadgeDocumentSchema>;

export function validateOpenBadgeDocument(value: unknown) {
  const result = openBadgeDocumentSchema.safeParse(value);
  return result.success
    ? { valid: true as const, profile: OPEN_BADGES_EXPORT_PROFILE, errors: [] as string[] }
    : { valid: false as const, profile: OPEN_BADGES_EXPORT_PROFILE, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}

export async function createOpenBadgeDocument(userId: number, claimVersionId: string, options: { includeLearnerName?: boolean } = {}) {
  return tx(async (client) => {
    const row = (await client.query<{
      claim_id: string; claim_version_id: string; version: number; title: string; statement: string;
      course_id: number; course_version: number; assignment_version_id: string;
      completion_rule_version_id: string; completion_event_id: string; participation_id: string;
      credential_id: string; evidence_hash: string; issued_at: string; expires_at: string | null;
      learner_name: string; space_id: string; space_name: string;
    }>(
      `SELECT claim.id AS claim_id,version.id AS claim_version_id,version.version,
              version.title,version.statement,version.course_id,version.course_version,
              version.assignment_version_id,version.completion_rule_version_id,
              version.completion_event_id,version.participation_id,version.credential_id,
              version.evidence_hash,version.issued_at,credential.expires_at,
              learner.name AS learner_name,assignment.space_id,space.name AS space_name
       FROM competency_claim_versions version
       JOIN competency_claims claim ON claim.id=version.claim_id AND claim.user_id=$1
       JOIN users learner ON learner.id=claim.user_id AND learner.account_status='active'
       JOIN credential_records credential ON credential.id=version.credential_id
         AND credential.user_id=claim.user_id AND credential.status='active'
         AND (credential.expires_at IS NULL OR credential.expires_at::timestamptz > now())
       JOIN assignment_completion_events completion ON completion.id=version.completion_event_id
         AND completion.decision='completed' AND completion.participation_id=version.participation_id
         AND completion.assignment_version_id=version.assignment_version_id
         AND completion.completion_rule_version_id=version.completion_rule_version_id
         AND completion.evidence_hash=version.evidence_hash
       JOIN assignment_versions assignment_version ON assignment_version.id=version.assignment_version_id
         AND assignment_version.course_version=version.course_version
       JOIN space_assignments assignment ON assignment.id=assignment_version.assignment_id
         AND assignment.course_id=version.course_id
       JOIN spaces space ON space.id=assignment.space_id
       WHERE version.id=$2 AND NOT EXISTS (
         SELECT 1 FROM competency_claim_versions newer
         WHERE newer.claim_id=claim.id AND newer.version>version.version
       )
       FOR SHARE OF claim,version,credential,completion`,
      [userId, claimVersionId],
    )).rows[0];
    if (!row) throw new SkillPassportError("Claim export not found");

    const alignments = (await client.query<{
      sourced_id: string; target_code: string; framework_title: string;
      framework_version: number; full_statement: string;
    }>(
      `SELECT item.case_item_sourced_id AS sourced_id,
              COALESCE(item_version.human_coding_scheme,item.stable_key) AS target_code,
              framework_version.title AS framework_title,
              framework_version.version AS framework_version,
              item_version.full_statement
       FROM competency_claim_alignments claim_alignment
       JOIN competency_item_versions item_version
         ON item_version.id=claim_alignment.competency_item_version_id
       JOIN competency_items item ON item.id=item_version.competency_item_id
       JOIN competency_framework_versions framework_version
         ON framework_version.id=claim_alignment.framework_version_id
       WHERE claim_alignment.claim_version_id=$1
       ORDER BY framework_version.title,item.stable_key`,
      [row.claim_version_id],
    )).rows;

    const document: OpenBadgeDocument = {
      "@context": [VC_CONTEXT, OPEN_BADGES_CONTEXT],
      id: `urn:uuid:${row.claim_version_id}`,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      issuer: { id: `urn:uuid:${row.space_id}`, type: ["Profile"], name: row.space_name },
      validFrom: new Date(row.issued_at).toISOString(),
      ...(row.expires_at ? { validUntil: new Date(row.expires_at).toISOString() } : {}),
      credentialSubject: {
        id: `urn:uuid:${row.claim_id}`,
        type: ["AchievementSubject"],
        ...(options.includeLearnerName ? { name: row.learner_name } : {}),
        achievement: {
          id: `urn:bookquest:course:${row.course_id}:version:${row.course_version}`,
          type: ["Achievement"],
          name: row.title,
          description: row.statement,
          criteria: { narrative: "Completion was awarded under the exact BookQuest assignment and completion-rule versions recorded in the evidence entry." },
          ...(alignments.length ? { alignment: alignments.map((alignment) => ({
            type: ["Alignment"],
            targetCode: alignment.target_code,
            targetFramework: `${alignment.framework_title} (version ${alignment.framework_version})`,
            targetName: alignment.full_statement,
            targetType: "CFItem",
            targetUrl: `urn:uuid:${alignment.sourced_id}`,
          })) } : {}),
        },
      },
      evidence: [{
        id: `urn:bookquest:evidence:sha256:${row.evidence_hash}`,
        type: ["Evidence"],
        name: "BookQuest verified completion evidence",
        description: `claimVersion=${row.claim_version_id}; claimVersionNumber=${row.version}; course=${row.course_id}; courseVersion=${row.course_version}; assignmentVersion=${row.assignment_version_id}; completionRuleVersion=${row.completion_rule_version_id}; completionDecision=${row.completion_event_id}; participation=${row.participation_id}; credential=${row.credential_id}; evidenceHash=${row.evidence_hash}`,
      }],
      credentialSchema: [{ id: OPEN_BADGES_SCHEMA, type: "1EdTechJsonSchemaValidator2019" }],
    };
    const validation = validateOpenBadgeDocument(document);
    if (!validation.valid) throw new Error(`Generated Open Badges document failed ${validation.profile}: ${validation.errors.join("; ")}`);
    return { profile: validation.profile, proof: "unsigned" as const, credential: document };
  });
}

const digest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const b64urlJson = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function canonicalOrigin(requestOrigin: string) {
  const configured = process.env.APP_URL?.trim();
  const origin = new URL(configured || requestOrigin).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
    throw new Error("Open Badges issuance requires an HTTPS APP_URL");
  }
  return origin;
}

function keyEncryptionKey() {
  const material = process.env.OPEN_BADGES_KEY_ENCRYPTION_KEY
    || process.env.MFA_ENCRYPTION_KEY || process.env.GENERATION_SECRET;
  if (!material && process.env.NODE_ENV === "production") {
    throw new Error("OPEN_BADGES_KEY_ENCRYPTION_KEY or MFA_ENCRYPTION_KEY is required in production");
  }
  return crypto.createHash("sha256").update(material || "bookquest-local-open-badges-key").digest();
}

function encryptPrivateKey(privateKey: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

function decryptPrivateKey(row: { private_key_ciphertext: string; private_key_iv: string; private_key_auth_tag: string }) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyEncryptionKey(), Buffer.from(row.private_key_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.private_key_auth_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.private_key_ciphertext, "base64")), decipher.final()]).toString("utf8");
}

type IssuerKeyRow = {
  id: string; public_jwk: JsonWebKey; private_key_ciphertext: string;
  private_key_iv: string; private_key_auth_tag: string;
};

async function activeIssuerKey(client: PoolClient, spaceId: string): Promise<IssuerKeyRow> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [spaceId]);
  const existing = (await client.query<IssuerKeyRow>(
    `SELECT id,public_jwk,private_key_ciphertext,private_key_iv,private_key_auth_tag
     FROM open_badge_issuer_keys WHERE space_id=$1 AND status='active' FOR UPDATE`,
    [spaceId],
  )).rows[0];
  if (existing) return existing;
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" });
  const encrypted = encryptPrivateKey(privateKey.export({ format: "pem", type: "pkcs8" }).toString());
  return (await client.query<IssuerKeyRow>(
    `INSERT INTO open_badge_issuer_keys
      (space_id,algorithm,public_jwk,private_key_ciphertext,private_key_iv,private_key_auth_tag)
     VALUES ($1,'RS256',$2::jsonb,$3,$4,$5)
     RETURNING id,public_jwk,private_key_ciphertext,private_key_iv,private_key_auth_tag`,
    [spaceId, JSON.stringify(publicJwk), encrypted.ciphertext, encrypted.iv, encrypted.authTag],
  )).rows[0];
}

function parseCompactJws(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Record<string, unknown>,
      payload: JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: Buffer.from(parts[2], "base64url"),
    };
  } catch { return null; }
}

export async function issueSignedOpenBadge(userId: number, claimVersionId: string, requestOrigin: string) {
  const portable = await createOpenBadgeDocument(userId, claimVersionId);
  const origin = canonicalOrigin(requestOrigin);
  return tx(async (client) => {
    const eligible = (await client.query<{ space_id: string }>(
      `SELECT assignment.space_id
       FROM competency_claim_versions version
       JOIN competency_claims claim ON claim.id=version.claim_id AND claim.user_id=$1
       JOIN users learner ON learner.id=claim.user_id AND learner.account_status='active'
       JOIN credential_records credential ON credential.id=version.credential_id
         AND credential.status='active'
         AND (credential.expires_at IS NULL OR credential.expires_at::timestamptz>now())
       JOIN assignment_completion_events completion ON completion.id=version.completion_event_id
         AND completion.decision='completed' AND completion.evidence_hash=version.evidence_hash
       JOIN assignment_versions assignment_version ON assignment_version.id=version.assignment_version_id
       JOIN space_assignments assignment ON assignment.id=assignment_version.assignment_id
       WHERE version.id=$2 AND NOT EXISTS (
         SELECT 1 FROM competency_claim_versions newer
         WHERE newer.claim_id=claim.id AND newer.version>version.version)
       FOR SHARE OF claim,version,credential,completion`,
      [userId, claimVersionId],
    )).rows[0];
    if (!eligible) throw new SkillPassportError("Signed credential not found");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [eligible.space_id]);
    const existing = (await client.query<{ id: string; compact_jws: string; issued_at: string }>(
      `SELECT id,compact_jws,issued_at FROM open_badge_credentials
       WHERE learner_user_id=$1 AND claim_version_id=$2 AND status='active'`,
      [userId, claimVersionId],
    )).rows[0];
    if (existing) return { id: existing.id, compactJws: existing.compact_jws, issuedAt: existing.issued_at, proof: "VC-JWT RS256" as const };

    const issuerKey = await activeIssuerKey(client, eligible.space_id);
    const id = crypto.randomUUID();
    const statusToken = crypto.randomBytes(32).toString("base64url");
    const issuedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
    const credential: OpenBadgeDocument = {
      ...portable.credential,
      id: `${origin}/api/open-badges/credentials/${id}`,
      issuer: { ...portable.credential.issuer, id: `${origin}/api/open-badges/issuers/${eligible.space_id}` },
      validFrom: issuedAt,
      credentialSubject: { ...portable.credential.credentialSubject, name: undefined },
      credentialStatus: {
        id: `${origin}/api/open-badges/status/${statusToken}`,
        type: "BookQuestCredentialStatus2026",
      },
    };
    const validation = validateOpenBadgeDocument(credential);
    if (!validation.valid) throw new Error(`Signed credential failed profile validation: ${validation.errors.join("; ")}`);
    const header = { alg: "RS256", kid: `${origin}/api/open-badges/keys/${issuerKey.id}`, typ: "JWT" };
    const payload = {
      iss: credential.issuer.id,
      sub: credential.credentialSubject.id,
      nbf: Math.floor(Date.parse(credential.validFrom) / 1000),
      jti: credential.id,
      ...(credential.validUntil ? { exp: Math.floor(Date.parse(credential.validUntil) / 1000) } : {}),
      vc: credential,
    };
    const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
    const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), decryptPrivateKey(issuerKey)).toString("base64url");
    const compactJws = `${signingInput}.${signature}`;
    await client.query(
      `INSERT INTO open_badge_credentials
        (id,learner_user_id,claim_version_id,space_id,issuer_key_id,status_token_hash,compact_jws,issued_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, userId, claimVersionId, eligible.space_id, issuerKey.id, digest(statusToken), compactJws, issuedAt],
    );
    await client.query(
      `INSERT INTO open_badge_credential_events (open_badge_credential_id,event_type,actor_user_id,occurred_at)
       VALUES ($1,'issued',$2,$3)`,
      [id, userId, issuedAt],
    );
    await enqueueWebhookEvent(client, {
      spaceId: eligible.space_id,
      eventType: "credential.issued",
      resourceId: id,
      dedupeKey: `credential.issued:${id}`,
      occurredAt: issuedAt,
      data: { spaceId: eligible.space_id, credentialId: id, claimVersionId, issuedAt },
    });
    return { id, compactJws, issuedAt, proof: "VC-JWT RS256" as const };
  });
}

export async function publicOpenBadgeKey(keyId: string) {
  const row = await one<{ public_jwk: JsonWebKey }>(
    "SELECT public_jwk FROM open_badge_issuer_keys WHERE id=$1",
    [keyId],
  );
  return row?.public_jwk ?? null;
}

export async function rotateOpenBadgeIssuerKey(actorUserId: number, spaceId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [spaceId]);
    const active = (await client.query<{ id: string }>(
      "SELECT id FROM open_badge_issuer_keys WHERE space_id=$1 AND status='active' FOR UPDATE",
      [spaceId],
    )).rows[0];
    if (!active) throw new SkillPassportError("Issuer key not found");
    const retiredAt = new Date().toISOString();
    await client.query(
      "UPDATE open_badge_issuer_keys SET status='retired',retired_at=$2 WHERE id=$1",
      [active.id, retiredAt],
    );
    const replacement = await activeIssuerKey(client, spaceId);
    return { retiredKeyId: active.id, keyId: replacement.id, algorithm: "RS256" as const, publicJwk: replacement.public_jwk, rotatedAt: retiredAt };
  });
}

export async function verifySignedOpenBadge(compactJws: string, at = new Date()) {
  if (compactJws.length > 100_000) return null;
  const parsed = parseCompactJws(compactJws);
  if (!parsed || parsed.header.alg !== "RS256" || parsed.header.typ !== "JWT"
      || typeof parsed.header.kid !== "string" || Object.keys(parsed.header).some((key) => !["alg", "kid", "typ"].includes(key))) return null;
  const keyId = parsed.header.kid.split("/").at(-1);
  const jti = parsed.payload.jti;
  const badgeId = typeof jti === "string" ? jti.split("/").at(-1) : null;
  if (!keyId || !badgeId) return null;
  return tx(async (client) => {
    const row = (await client.query<{
      id: string; compact_jws: string; status: string; public_jwk: JsonWebKey;
      credential_status: string; credential_expires_at: string | null; completion_decision: string;
      account_status: string; is_current: boolean;
    }>(
      `SELECT badge.id,badge.compact_jws,badge.status,key.public_jwk,
            credential.status AS credential_status,credential.expires_at AS credential_expires_at,
            completion.decision AS completion_decision,learner.account_status,
            NOT EXISTS (SELECT 1 FROM competency_claim_versions newer
              WHERE newer.claim_id=claim.id AND newer.version>version.version) AS is_current
     FROM open_badge_credentials badge
     JOIN open_badge_issuer_keys key ON key.id=badge.issuer_key_id
     JOIN competency_claim_versions version ON version.id=badge.claim_version_id
     JOIN competency_claims claim ON claim.id=version.claim_id
     JOIN credential_records credential ON credential.id=version.credential_id
     JOIN assignment_completion_events completion ON completion.id=version.completion_event_id
     JOIN users learner ON learner.id=badge.learner_user_id
     WHERE badge.id=$1 AND key.id=$2
     FOR SHARE OF badge,key,version,claim,credential,completion,learner`,
      [badgeId, keyId],
    )).rows[0];
    if (!row || row.compact_jws !== compactJws) return null;
    const publicKey = crypto.createPublicKey({ key: row.public_jwk, format: "jwk" });
    if (!crypto.verify("RSA-SHA256", Buffer.from(parsed.signingInput), publicKey, parsed.signature)) return null;
    const credential = parsed.payload.vc as unknown;
    const validation = validateOpenBadgeDocument(credential);
    if (!validation.valid || !credential || typeof credential !== "object") return null;
    const vc = credential as OpenBadgeDocument;
    const nbf = Number(parsed.payload.nbf);
    const exp = parsed.payload.exp === undefined ? null : Number(parsed.payload.exp);
    const validUntil = vc.validUntil
      ? Math.floor(Date.parse(vc.validUntil) / 1000)
      : null;
    if (parsed.payload.iss !== vc.issuer.id || parsed.payload.sub !== vc.credentialSubject.id
        || parsed.payload.jti !== vc.id || nbf !== Math.floor(Date.parse(vc.validFrom) / 1000)
        || exp !== validUntil) return null;
    const live = row.status === "active" && row.credential_status === "active"
      && row.completion_decision === "completed" && row.account_status === "active" && row.is_current
      && nbf <= Math.floor(at.getTime() / 1000)
      && (!exp || exp > Math.floor(at.getTime() / 1000))
      && (!row.credential_expires_at || Date.parse(row.credential_expires_at) > at.getTime());
    return { valid: live, status: live ? "active" as const : "revoked_or_expired" as const, credential: vc, keyId };
  });
}

export async function openBadgeStatus(statusToken: string, at = new Date()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(statusToken)) return null;
  const row = await one<{ compact_jws: string }>(
    "SELECT compact_jws FROM open_badge_credentials WHERE status_token_hash=$1",
    [digest(statusToken)],
  );
  if (!row) return null;
  const verified = await verifySignedOpenBadge(row.compact_jws, at);
  return verified ? { active: verified.valid, status: verified.status } : { active: false, status: "invalid" as const };
}

export async function revokeSignedOpenBadge(userId: number, badgeId: string) {
  return tx(async (client) => {
    const row = (await client.query<{ id: string; space_id: string }>(
      `SELECT id,space_id FROM open_badge_credentials
       WHERE id=$1 AND learner_user_id=$2 AND status='active' FOR UPDATE`,
      [badgeId, userId],
    )).rows[0];
    if (!row) throw new SkillPassportError("Signed credential not found");
    const at = new Date().toISOString();
    await client.query("UPDATE open_badge_credentials SET status='revoked',revoked_at=$2 WHERE id=$1", [badgeId, at]);
    await client.query(
      `INSERT INTO open_badge_credential_events (open_badge_credential_id,event_type,actor_user_id,occurred_at)
       VALUES ($1,'revoked',$2,$3)`,
      [badgeId, userId, at],
    );
    await enqueueWebhookEvent(client, {
      spaceId: row.space_id,
      eventType: "credential.revoked",
      resourceId: badgeId,
      dedupeKey: `credential.revoked:${badgeId}`,
      occurredAt: at,
      data: { spaceId: row.space_id, credentialId: badgeId, revokedAt: at },
    });
    return { id: badgeId, status: "revoked" as const, revokedAt: at };
  });
}
