import { z } from "zod";
import { tx } from "./pg";
import { SkillPassportError } from "./skill-passport";

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
    }),
  }),
  evidence: z.array(z.object({ id: uri, type: z.array(z.string()).refine((value) => value.includes("Evidence")), name: z.string().min(1), description: z.string().min(1) })).min(1),
  credentialSchema: z.array(z.object({
    id: z.literal(OPEN_BADGES_SCHEMA),
    type: z.literal("1EdTechJsonSchemaValidator2019"),
  })).min(1),
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
