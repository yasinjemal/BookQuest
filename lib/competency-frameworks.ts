import type { PoolClient } from "pg";
import { tx } from "./pg";
import { authorizeStoredMembership } from "./spaces";

const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{1,99}$/;

export class CompetencyFrameworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetencyFrameworkError";
  }
}

function requiredText(value: string, label: string, min: number, max: number) {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new CompetencyFrameworkError(`${label} must be between ${min} and ${max} characters`);
  }
  return normalized;
}

function stableKey(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!KEY_PATTERN.test(normalized)) {
    throw new CompetencyFrameworkError(`${label} must use lowercase letters, numbers, dots, dashes or underscores`);
  }
  return normalized;
}

type PublishedItem = {
  itemId: string;
  itemVersionId: string;
  stableKey: string;
  sourcedId: string;
  version: number;
  fullStatement: string;
  humanCodingScheme: string | null;
  notes: string;
};

export async function publishCompetencyFrameworkVersion(actorUserId: number, spaceId: string, input: {
  frameworkId?: string;
  stableKey: string;
  title: string;
  description?: string;
  items: Array<{
    stableKey: string;
    fullStatement: string;
    humanCodingScheme?: string;
    notes?: string;
  }>;
}) {
  const frameworkStableKey = stableKey(input.stableKey, "Framework key");
  const title = requiredText(input.title, "Framework title", 2, 200);
  const description = (input.description ?? "").trim().slice(0, 4000);
  if (!input.items.length || input.items.length > 100) {
    throw new CompetencyFrameworkError("Publish between 1 and 100 competency items");
  }
  const items = input.items.map((item) => ({
    stableKey: stableKey(item.stableKey, "Competency key"),
    fullStatement: requiredText(item.fullStatement, "Competency statement", 3, 2000),
    humanCodingScheme: item.humanCodingScheme?.trim().slice(0, 100) || null,
    notes: item.notes?.trim().slice(0, 4000) || "",
  }));
  if (new Set(items.map((item) => item.stableKey)).size !== items.length) {
    throw new CompetencyFrameworkError("Competency keys must be unique within a version");
  }

  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    const lockKey = `competency-framework:${spaceId}:${input.frameworkId || frameworkStableKey}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

    let framework: { id: string; stable_key: string } | undefined;
    if (input.frameworkId) {
      framework = (await client.query<{ id: string; stable_key: string }>(
        "SELECT id,stable_key FROM competency_frameworks WHERE id=$1 AND space_id=$2 FOR SHARE",
        [input.frameworkId, spaceId],
      )).rows[0];
      if (!framework || framework.stable_key !== frameworkStableKey) {
        throw new CompetencyFrameworkError("Competency framework not found");
      }
    } else {
      framework = (await client.query<{ id: string; stable_key: string }>(
        `INSERT INTO competency_frameworks (space_id,stable_key,created_by_user_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (space_id,stable_key) DO NOTHING
         RETURNING id,stable_key`,
        [spaceId, frameworkStableKey, actorUserId],
      )).rows[0];
      framework ??= (await client.query<{ id: string; stable_key: string }>(
        "SELECT id,stable_key FROM competency_frameworks WHERE space_id=$1 AND stable_key=$2",
        [spaceId, frameworkStableKey],
      )).rows[0];
    }
    if (!framework) throw new CompetencyFrameworkError("Competency framework not found");

    const nextVersion = Number((await client.query<{ version: number }>(
      "SELECT COALESCE(MAX(version),0)+1 AS version FROM competency_framework_versions WHERE framework_id=$1",
      [framework.id],
    )).rows[0].version);
    const frameworkVersion = (await client.query<{
      id: string; case_document_sourced_id: string; published_at: string;
    }>(
      `INSERT INTO competency_framework_versions
        (framework_id,version,title,description,created_by_user_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id,case_document_sourced_id,published_at`,
      [framework.id, nextVersion, title, description, actorUserId],
    )).rows[0];

    const publishedItems: PublishedItem[] = [];
    for (const item of items) {
      let stableItem = (await client.query<{ id: string; case_item_sourced_id: string }>(
        `INSERT INTO competency_items (framework_id,stable_key)
         VALUES ($1,$2)
         ON CONFLICT (framework_id,stable_key) DO NOTHING
         RETURNING id,case_item_sourced_id`,
        [framework.id, item.stableKey],
      )).rows[0];
      stableItem ??= (await client.query<{ id: string; case_item_sourced_id: string }>(
        `SELECT id,case_item_sourced_id FROM competency_items
         WHERE framework_id=$1 AND stable_key=$2`,
        [framework.id, item.stableKey],
      )).rows[0];
      const itemVersion = Number((await client.query<{ version: number }>(
        "SELECT COALESCE(MAX(version),0)+1 AS version FROM competency_item_versions WHERE competency_item_id=$1",
        [stableItem.id],
      )).rows[0].version);
      const versionRow = (await client.query<{ id: string }>(
        `INSERT INTO competency_item_versions
          (competency_item_id,framework_version_id,version,full_statement,human_coding_scheme,notes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [stableItem.id, frameworkVersion.id, itemVersion, item.fullStatement,
         item.humanCodingScheme, item.notes],
      )).rows[0];
      publishedItems.push({
        itemId: stableItem.id,
        itemVersionId: versionRow.id,
        stableKey: item.stableKey,
        sourcedId: stableItem.case_item_sourced_id,
        version: itemVersion,
        fullStatement: item.fullStatement,
        humanCodingScheme: item.humanCodingScheme,
        notes: item.notes,
      });
    }

    return {
      frameworkId: framework.id,
      stableKey: framework.stable_key,
      frameworkVersionId: frameworkVersion.id,
      version: nextVersion,
      sourcedId: frameworkVersion.case_document_sourced_id,
      caseVersion: "1.1" as const,
      title,
      description,
      publishedAt: frameworkVersion.published_at,
      items: publishedItems,
    };
  });
}

export async function alignCourseVersionToCompetency(actorUserId: number, spaceId: string, input: {
  courseId: number;
  courseVersion: number;
  competencyItemVersionId: string;
  conditions: string;
}) {
  const conditions = requiredText(input.conditions, "Alignment conditions", 3, 1000);
  if (!Number.isInteger(input.courseId) || input.courseId <= 0
      || !Number.isInteger(input.courseVersion) || input.courseVersion <= 0) {
    throw new CompetencyFrameworkError("Choose a valid course version");
  }
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    const eligible = (await client.query<{
      item_version_id: string; framework_version_id: string;
    }>(
      `SELECT item_version.id AS item_version_id,
              item_version.framework_version_id
       FROM competency_item_versions item_version
       JOIN competency_items item ON item.id=item_version.competency_item_id
       JOIN competency_frameworks framework ON framework.id=item.framework_id
       JOIN space_courses attached ON attached.space_id=framework.space_id
         AND attached.course_id=$3
       JOIN course_versions course_version ON course_version.course_id=attached.course_id
         AND course_version.version_number=$4
       WHERE framework.space_id=$1 AND item_version.id=$2`,
      [spaceId, input.competencyItemVersionId, input.courseId, input.courseVersion],
    )).rows[0];
    if (!eligible) throw new CompetencyFrameworkError("Competency or course version not found");
    const row = (await client.query<{ id: string; created_at: string }>(
      `INSERT INTO course_competency_alignments
        (space_id,course_id,course_version,competency_item_version_id,
         mapping_basis,conditions,created_by_user_id)
       VALUES ($1,$2,$3,$4,'author_declared',$5,$6)
       ON CONFLICT (space_id,course_id,course_version,competency_item_version_id)
       DO NOTHING RETURNING id,created_at`,
      [spaceId, input.courseId, input.courseVersion,
       input.competencyItemVersionId, conditions, actorUserId],
    )).rows[0] ?? (await client.query<{ id: string; created_at: string }>(
      `SELECT id,created_at FROM course_competency_alignments
       WHERE space_id=$1 AND course_id=$2 AND course_version=$3
         AND competency_item_version_id=$4`,
      [spaceId, input.courseId, input.courseVersion, input.competencyItemVersionId],
    )).rows[0];
    return {
      id: row.id,
      spaceId,
      courseId: input.courseId,
      courseVersion: input.courseVersion,
      competencyItemVersionId: eligible.item_version_id,
      frameworkVersionId: eligible.framework_version_id,
      mappingBasis: "author_declared" as const,
      conditions,
      createdAt: row.created_at,
    };
  });
}

export async function listSpaceCompetencyFrameworks(actorUserId: number, spaceId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "assignments.manage", client);
    return (await client.query<{
      framework_id: string; stable_key: string; framework_version_id: string;
      version: number; sourced_id: string; title: string; description: string;
      published_at: string; item_version_id: string; item_id: string;
      item_stable_key: string; item_sourced_id: string; item_version: number;
      full_statement: string; human_coding_scheme: string | null; notes: string;
    }>(
      `SELECT framework.id AS framework_id,framework.stable_key,
              version.id AS framework_version_id,version.version,
              version.case_document_sourced_id AS sourced_id,version.title,
              version.description,version.published_at,item_version.id AS item_version_id,
              item.id AS item_id,item.stable_key AS item_stable_key,
              item.case_item_sourced_id AS item_sourced_id,item_version.version AS item_version,
              item_version.full_statement,item_version.human_coding_scheme,item_version.notes
       FROM competency_frameworks framework
       JOIN competency_framework_versions version ON version.framework_id=framework.id
       JOIN competency_item_versions item_version ON item_version.framework_version_id=version.id
       JOIN competency_items item ON item.id=item_version.competency_item_id
       WHERE framework.space_id=$1
       ORDER BY version.published_at DESC,version.version DESC,item.stable_key`,
      [spaceId],
    )).rows;
  });
}

export function competencyFrameworkApiError(error: unknown) {
  if (!(error instanceof CompetencyFrameworkError)) return null;
  return { status: /not found/i.test(error.message) ? 404 : 400, error: error.message };
}

export async function snapshotClaimCompetencyAlignments(client: PoolClient, input: {
  claimVersionId: string;
  spaceId: string;
  courseId: number;
  courseVersion: number;
}) {
  await client.query(
    `INSERT INTO competency_claim_alignments
      (claim_version_id,alignment_id,competency_item_version_id,
       framework_version_id,conditions_snapshot)
     SELECT $1,alignment.id,alignment.competency_item_version_id,
            item_version.framework_version_id,alignment.conditions
     FROM course_competency_alignments alignment
     JOIN competency_item_versions item_version
       ON item_version.id=alignment.competency_item_version_id
     WHERE alignment.space_id=$2 AND alignment.course_id=$3
       AND alignment.course_version=$4
     ON CONFLICT DO NOTHING`,
    [input.claimVersionId, input.spaceId, input.courseId, input.courseVersion],
  );
}
