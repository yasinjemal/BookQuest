import crypto from "crypto";
import { newGenerationRunId } from "./generation-run";
import { pool, tx, type Queryable } from "./pg";
import { authorizeStoredMembership } from "./spaces";
import {
  BLOCK_CHANNELS,
  type BlockType,
  validateBlockContent,
} from "./block-registry";

export type SourceKind =
  | "pdf"
  | "docx"
  | "markdown"
  | "text"
  | "pptx"
  | "webpage"
  | "transcript"
  | "manual";

export class StudioConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioConflictError";
  }
}

const nowIso = () => new Date().toISOString();
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export function sourceKindForFilename(filename: string): SourceKind {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "pptx") return "pptx";
  return "text";
}

export async function initializeCourseStudioDraft(
  exec: Queryable,
  input: {
    courseId: number;
    userId: number;
    spaceId: string;
    title: string;
    sourceFilename: string;
    sourceKind?: SourceKind;
    contentVersion?: number;
  }
): Promise<{ sourceId: string; collectionId: string; courseVersionId: string }> {
  const createdAt = nowIso();
  const source = (
    await exec.query<{ id: string }>(
      `INSERT INTO source_assets
        (owning_space_id, created_by_user_id, kind, title, current_version,
         created_at, updated_at)
       VALUES ($1, $2, $3, $4, 0, $5, $5) RETURNING id`,
      [
        input.spaceId,
        input.userId,
        input.sourceKind ?? sourceKindForFilename(input.sourceFilename),
        input.sourceFilename,
        createdAt,
      ]
    )
  ).rows[0];
  const collection = (
    await exec.query<{ id: string }>(
      `INSERT INTO source_collections
        (owning_space_id, name, current_version, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, 0, $3, $4, $4) RETURNING id`,
      [input.spaceId, `${input.title} sources`, input.userId, createdAt]
    )
  ).rows[0];
  await exec.query(
    `INSERT INTO course_source_assets (course_id, source_id, position)
     VALUES ($1, $2, 0)`,
    [input.courseId, source.id]
  );
  const emptyContent = JSON.stringify({ modules: [] });
  const courseVersion = (
    await exec.query<{ id: string }>(
      `INSERT INTO course_versions
        (course_id, version_number, lifecycle_status, title, description,
         outline_json, content_json, content_hash, created_by_user_id,
         created_at, updated_at)
       VALUES ($1, $2, 'draft', $3, '', '{}', $4, $5, $6, $7, $7)
       RETURNING id`,
      [
        input.courseId,
        input.contentVersion ?? 1,
        input.title,
        emptyContent,
        hash(`${input.title}\n${emptyContent}`),
        input.userId,
        createdAt,
      ]
    )
  ).rows[0];
  await exec.query(
    `UPDATE courses SET source_collection_id = $2,
       current_draft_version_id = $3, authoring_status = 'draft'
     WHERE id = $1`,
    [input.courseId, collection.id, courseVersion.id]
  );
  return {
    sourceId: source.id,
    collectionId: collection.id,
    courseVersionId: courseVersion.id,
  };
}

export async function recordExtractedCourseSource(
  exec: Queryable,
  input: {
    courseId: number;
    extractedContentJson: string;
    mimeType?: string | null;
    extractorVersion?: string;
    extractionModel?: string | null;
    provenance?: Record<string, unknown>;
  }
): Promise<{ sourceVersionId: string; collectionVersionId: string }> {
  JSON.parse(input.extractedContentJson);
  const course = (
    await exec.query<{
      owner_id: number;
      source_filename: string;
      source_collection_id: string;
      current_draft_version_id: string;
    }>(
      `SELECT owner_id, source_filename, source_collection_id,
              current_draft_version_id
       FROM courses WHERE id = $1 FOR UPDATE`,
      [input.courseId]
    )
  ).rows[0];
  if (!course?.source_collection_id || !course.current_draft_version_id) {
    throw new StudioConflictError("Course Studio draft is not initialized");
  }
  const source = (
    await exec.query<{ id: string; current_version: number }>(
      `SELECT source.id, source.current_version
       FROM course_source_assets link
       JOIN source_assets source ON source.id = link.source_id
       WHERE link.course_id = $1 AND link.position = 0
       FOR UPDATE OF source`,
      [input.courseId]
    )
  ).rows[0];
  if (!source) throw new StudioConflictError("Course source is missing");
  const sourceVersion = source.current_version + 1;
  const createdAt = nowIso();
  const sourceVersionRow = (
    await exec.query<{ id: string }>(
      `INSERT INTO source_versions
        (source_id, version, content_hash, original_filename, mime_type,
         extracted_content_json, extraction_model, extractor_version,
         provenance_json, created_by_user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        source.id,
        sourceVersion,
        hash(input.extractedContentJson),
        course.source_filename,
        input.mimeType ?? null,
        input.extractedContentJson,
        input.extractionModel ?? null,
        input.extractorVersion ?? "bookquest-extract-v1",
        JSON.stringify(input.provenance ?? {}),
        course.owner_id,
        createdAt,
      ]
    )
  ).rows[0];
  await exec.query(
    "UPDATE source_assets SET current_version = $2, updated_at = $3 WHERE id = $1",
    [source.id, sourceVersion, createdAt]
  );

  const collection = (
    await exec.query<{ current_version: number }>(
      "SELECT current_version FROM source_collections WHERE id = $1 FOR UPDATE",
      [course.source_collection_id]
    )
  ).rows[0];
  if (!collection) throw new StudioConflictError("Course source collection is missing");
  const collectionVersion = collection.current_version + 1;
  const collectionVersionRow = (
    await exec.query<{ id: string }>(
      `INSERT INTO source_collection_versions
        (collection_id, version, status, created_by_user_id, created_at)
       VALUES ($1, $2, 'draft', $3, $4) RETURNING id`,
      [course.source_collection_id, collectionVersion, course.owner_id, createdAt]
    )
  ).rows[0];
  await exec.query(
    `INSERT INTO source_collection_version_items
      (collection_version_id, source_version_id, position, usage_policy)
     VALUES ($1, $2, 0, 'primary')`,
    [collectionVersionRow.id, sourceVersionRow.id]
  );
  await exec.query(
    "UPDATE source_collections SET current_version = $2, updated_at = $3 WHERE id = $1",
    [course.source_collection_id, collectionVersion, createdAt]
  );
  await exec.query(
    `DELETE FROM course_version_sources current_link
     USING source_versions old_version
     WHERE current_link.course_version_id = $1
       AND current_link.source_version_id = old_version.id
       AND old_version.source_id = $2`,
    [course.current_draft_version_id, source.id]
  );
  await exec.query(
    `INSERT INTO course_version_sources
      (course_version_id, source_version_id, position, coverage_json)
     VALUES ($1, $2, 0, '{"status":"pending_review"}')`,
    [course.current_draft_version_id, sourceVersionRow.id]
  );
  await exec.query(
    `UPDATE course_versions SET source_collection_version_id = $2,
       content_hash = $3, updated_at = $4
     WHERE id = $1 AND lifecycle_status = 'draft'`,
    [
      course.current_draft_version_id,
      collectionVersionRow.id,
      hash(`${input.extractedContentJson}\n${sourceVersionRow.id}`),
      createdAt,
    ]
  );
  await exec.query("UPDATE courses SET source_json = $2 WHERE id = $1", [
    input.courseId,
    input.extractedContentJson,
  ]);
  return {
    sourceVersionId: sourceVersionRow.id,
    collectionVersionId: collectionVersionRow.id,
  };
}

export async function createBlankCourseDraft(
  userId: number,
  spaceId: string,
  titleInput: string
): Promise<{ courseId: number; courseVersionId: string }> {
  const title = titleInput.trim();
  if (title.length < 2 || title.length > 120) {
    throw new StudioConflictError("Course title must be between 2 and 120 characters");
  }
  return tx(async (client) => {
    await authorizeStoredMembership(userId, spaceId, "content.create", client);
    const generationRunId = newGenerationRunId();
    const course = (
      await client.query<{ id: number }>(
        `INSERT INTO courses
          (owner_id, owning_space_id, title, source_filename, status,
           generation_run_id, authoring_status)
         VALUES ($1, $2, $3, 'Manual draft', 'ready', $4, 'draft')
         RETURNING id`,
        [userId, spaceId, title, generationRunId]
      )
    ).rows[0];
    const initialized = await initializeCourseStudioDraft(client, {
      courseId: course.id,
      userId,
      spaceId,
      title,
      sourceFilename: "Manual draft",
      sourceKind: "manual",
    });
    await recordExtractedCourseSource(client, {
      courseId: course.id,
      extractedContentJson: "[]",
      extractorVersion: "manual-v1",
      provenance: { origin: "blank_draft" },
    });
    return { courseId: course.id, courseVersionId: initialized.courseVersionId };
  });
}

export async function getStudioDraftOwner(
  courseId: number,
  exec: Queryable = pool
): Promise<{ ownerId: number; spaceId: string; draftVersionId: string | null } | undefined> {
  const row = (
    await exec.query<{
      owner_id: number;
      owning_space_id: string;
      current_draft_version_id: string | null;
    }>(
      `SELECT owner_id, owning_space_id, current_draft_version_id
       FROM courses WHERE id = $1`,
      [courseId]
    )
  ).rows[0];
  return row
    ? {
        ownerId: row.owner_id,
        spaceId: row.owning_space_id,
        draftVersionId: row.current_draft_version_id,
      }
    : undefined;
}

type GeneratedModule = {
  id: number;
  title: string;
  summary: string;
  position: number;
  chapter_indexes: string | null;
};

type GeneratedLesson = {
  id: number;
  module_id: number;
  title: string;
  position: number;
  cards: string;
  generator_model: string | null;
  prompt_version: string | null;
};

function blockTypeForLegacyCard(type: string): string {
  if (type === "concept") return "explanation";
  if (type === "example") return "worked_example";
  if (type === "quiz_mcq") return "multiple_choice";
  if (type === "quiz_truefalse") return "true_false";
  if (type === "quiz_fillblank") return "fill_in";
  if (type === "recap") return "recap";
  return "explanation";
}

export async function syncGeneratedCourseDraft(
  courseId: number,
  generationRunId: string
): Promise<string> {
  return tx(async (client) => {
    const course = (
      await client.query<{
        owner_id: number;
        title: string;
        description: string;
        current_draft_version_id: string;
        content_version: number;
      }>(
        `SELECT owner_id, title, description, current_draft_version_id,
                content_version
         FROM courses
         WHERE id = $1 AND generation_run_id = $2
         FOR UPDATE`,
        [courseId, generationRunId]
      )
    ).rows[0];
    if (!course?.current_draft_version_id) {
      throw new StudioConflictError("Generation draft is missing or stale");
    }
    const version = (
      await client.query<{ id: string; lifecycle_status: string }>(
        "SELECT id, lifecycle_status FROM course_versions WHERE id = $1 FOR UPDATE",
        [course.current_draft_version_id]
      )
    ).rows[0];
    if (!version || version.lifecycle_status !== "draft") {
      throw new StudioConflictError("Generated content can only sync into a draft");
    }
    const existing = Number(
      (
        await client.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM course_blocks WHERE course_version_id = $1",
          [version.id]
        )
      ).rows[0]?.count ?? 0
    );
    if (existing > 0) return version.id;

    const modules = (
      await client.query<GeneratedModule>(
        `SELECT id, title, summary, position, chapter_indexes
         FROM modules
         WHERE course_id = $1 AND generation_run_id = $2
         ORDER BY position, id`,
        [courseId, generationRunId]
      )
    ).rows;
    const lessons = (
      await client.query<GeneratedLesson>(
        `SELECT l.id, l.module_id, l.title, l.position, l.cards,
                l.generator_model, l.prompt_version
         FROM lessons l
         JOIN modules m ON m.id = l.module_id
         WHERE m.course_id = $1 AND l.generation_run_id = $2
         ORDER BY m.position, l.position, l.id`,
        [courseId, generationRunId]
      )
    ).rows;
    const snapshot = {
      modules: modules.map((module) => ({
        key: `module:${module.id}`,
        title: module.title,
        summary: module.summary,
        position: module.position,
        chapterIndexes: module.chapter_indexes
          ? JSON.parse(module.chapter_indexes)
          : [],
        lessons: lessons
          .filter((lesson) => lesson.module_id === module.id)
          .map((lesson) => ({
            key: `lesson:${lesson.id}`,
            title: lesson.title,
            position: lesson.position,
            cards: JSON.parse(lesson.cards),
          })),
      })),
    };
    for (const module of modules) {
      for (const lesson of lessons.filter((item) => item.module_id === module.id)) {
        const cards = JSON.parse(lesson.cards) as Array<Record<string, unknown>>;
        for (let position = 0; position < cards.length; position++) {
          const card = cards[position];
          const block = (
            await client.query<{ id: string }>(
              `INSERT INTO course_blocks
                (course_version_id, lineage_id, module_key, module_title,
                 module_summary, lesson_key, lesson_title, module_position,
                 lesson_position, position, block_type, current_revision)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)
               RETURNING id`,
              [
                version.id,
                `course:${courseId}:lesson:${lesson.id}:card:${position}`,
                `module:${module.id}`,
                module.title,
                module.summary,
                `lesson:${lesson.id}`,
                lesson.title,
                module.position,
                lesson.position,
                position,
                blockTypeForLegacyCard(String(card.type ?? "concept")),
              ]
            )
          ).rows[0];
          await client.query(
            `INSERT INTO course_block_revisions
              (block_id, revision, content_json, source_refs_json,
               accessibility_json, provenance_json, edit_origin, created_by_user_id)
             VALUES ($1, 1, $2, $3, $4, $5, 'generated', NULL)`,
            [
              block.id,
              JSON.stringify(card),
              JSON.stringify({ chapterIndexes: module.chapter_indexes ? JSON.parse(module.chapter_indexes) : [] }),
              JSON.stringify({ status: "needs_review" }),
              JSON.stringify({
                generatorModel: lesson.generator_model,
                promptVersion: lesson.prompt_version,
                generationRunId,
              }),
            ]
          );
        }
      }
    }
    const contentJson = JSON.stringify(snapshot);
    await client.query(
      `UPDATE course_versions SET title = $2, description = $3,
         outline_json = $4, content_json = $5, content_hash = $6,
         updated_at = $7
       WHERE id = $1`,
      [
        version.id,
        course.title,
        course.description,
        JSON.stringify({
          modules: modules.map((module) => ({
            key: `module:${module.id}`,
            title: module.title,
            summary: module.summary,
            position: module.position,
          })),
        }),
        contentJson,
        hash(contentJson),
        nowIso(),
      ]
    );
    return version.id;
  });
}

export async function branchCourseVersionForRegeneration(
  exec: Queryable,
  courseId: number,
  newVersionNumber: number
): Promise<string> {
  const course = (
    await exec.query<{
      owner_id: number;
      title: string;
      description: string;
      current_draft_version_id: string | null;
      published_version_id: string | null;
      source_collection_id: string | null;
    }>(
      `SELECT owner_id, title, description, current_draft_version_id,
              published_version_id, source_collection_id
       FROM courses WHERE id = $1 FOR UPDATE`,
      [courseId]
    )
  ).rows[0];
  if (!course) throw new StudioConflictError("Course not found");
  const parentId = course.current_draft_version_id ?? course.published_version_id;
  const parent = parentId
    ? (
        await exec.query<{
          source_collection_version_id: string | null;
          recipe_version_id: string | null;
        }>(
          `SELECT source_collection_version_id, recipe_version_id
           FROM course_versions WHERE id = $1`,
          [parentId]
        )
      ).rows[0]
    : undefined;
  const emptyContent = JSON.stringify({ modules: [] });
  const createdAt = nowIso();
  const draft = (
    await exec.query<{ id: string }>(
      `INSERT INTO course_versions
        (course_id, version_number, parent_version_id, lifecycle_status,
         title, description, source_collection_version_id, recipe_version_id,
         outline_json, content_json, content_hash, created_by_user_id,
         created_at, updated_at)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, '{}', $8, $9, $10, $11, $11)
       RETURNING id`,
      [
        courseId,
        newVersionNumber,
        parentId,
        course.title,
        course.description,
        parent?.source_collection_version_id ?? null,
        parent?.recipe_version_id ?? null,
        emptyContent,
        hash(emptyContent),
        course.owner_id,
        createdAt,
      ]
    )
  ).rows[0];
  if (parent?.source_collection_version_id) {
    await exec.query(
      `INSERT INTO course_version_sources
        (course_version_id, source_version_id, position, coverage_json)
       SELECT $1, source_version_id, position, coverage_json
       FROM course_version_sources WHERE course_version_id = $2`,
      [draft.id, parentId]
    );
  }
  await exec.query(
    `UPDATE courses SET current_draft_version_id = $2,
       authoring_status = 'draft' WHERE id = $1`,
    [courseId, draft.id]
  );
  return draft.id;
}

export interface SourceSummary {
  id: string;
  owning_space_id: string;
  kind: SourceKind;
  title: string;
  lifecycle_status: "active" | "replaced" | "archived" | "deletion_scheduled";
  access_policy: "owner" | "editors" | "members";
  current_version: number;
  updated_at: string;
  source_version_id: string | null;
  content_hash: string | null;
  original_filename: string | null;
  mime_type: string | null;
}

async function getAuthorizedSource(
  exec: Queryable,
  userId: number,
  sourceId: string,
  capability: "content.read" | "content.update"
) {
  const source = (
    await exec.query<{
      id: string;
      owning_space_id: string;
      created_by_user_id: number;
      current_version: number;
      lifecycle_status: string;
      access_policy: string;
    }>("SELECT * FROM source_assets WHERE id = $1 FOR UPDATE", [sourceId])
  ).rows[0];
  if (!source) throw new StudioConflictError("Source not found");
  const requiredCapability =
    capability === "content.update" && source.access_policy === "owner"
      ? "space.update"
      : capability;
  await authorizeStoredMembership(
    userId,
    source.owning_space_id,
    requiredCapability,
    exec
  );
  return source;
}

async function appendSourceVersionInternal(
  exec: Queryable,
  source: { id: string; current_version: number; created_by_user_id: number },
  input: {
    content: unknown;
    originalFilename?: string | null;
    mimeType?: string | null;
    extractorVersion?: string;
    extractionModel?: string | null;
    provenance?: Record<string, unknown>;
  }
) {
  const serialized = JSON.stringify(input.content);
  const nextVersion = source.current_version + 1;
  const createdAt = nowIso();
  const row = (
    await exec.query<{ id: string }>(
      `INSERT INTO source_versions
        (source_id, version, content_hash, original_filename, mime_type,
         extracted_content_json, extraction_model, extractor_version,
         provenance_json, created_by_user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        source.id,
        nextVersion,
        hash(serialized),
        input.originalFilename ?? null,
        input.mimeType ?? null,
        serialized,
        input.extractionModel ?? null,
        input.extractorVersion ?? "manual-v1",
        JSON.stringify(input.provenance ?? {}),
        source.created_by_user_id,
        createdAt,
      ]
    )
  ).rows[0];
  await exec.query(
    `UPDATE source_assets SET current_version = $2,
       lifecycle_status = 'active', deletion_scheduled_at = NULL,
       updated_at = $3 WHERE id = $1`,
    [source.id, nextVersion, createdAt]
  );
  return { id: row.id, version: nextVersion, contentHash: hash(serialized) };
}

export async function listSourcesForSpace(
  userId: number,
  spaceId: string
): Promise<SourceSummary[]> {
  return tx(async (client) => {
    await authorizeStoredMembership(userId, spaceId, "content.read", client);
    return (
      await client.query<SourceSummary>(
        `SELECT source.id, source.owning_space_id, source.kind, source.title,
                source.lifecycle_status, source.access_policy,
                source.current_version, source.updated_at,
                version.id AS source_version_id, version.content_hash,
                version.original_filename, version.mime_type
         FROM source_assets source
         LEFT JOIN source_versions version
           ON version.source_id = source.id
          AND version.version = source.current_version
         WHERE source.owning_space_id = $1
           AND source.lifecycle_status <> 'deletion_scheduled'
         ORDER BY source.updated_at DESC`,
        [spaceId]
      )
    ).rows;
  });
}

export async function createTextSource(
  userId: number,
  spaceId: string,
  input: {
    title: string;
    kind: Extract<SourceKind, "text" | "markdown" | "webpage" | "transcript" | "manual">;
    content: unknown;
    provenance?: Record<string, unknown>;
    accessPolicy?: "owner" | "editors" | "members";
  }
): Promise<{ sourceId: string; sourceVersionId: string }> {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 180) {
    throw new StudioConflictError("Source title must be between 2 and 180 characters");
  }
  return tx(async (client) => {
    await authorizeStoredMembership(userId, spaceId, "content.create", client);
    const source = (
      await client.query<{ id: string; created_by_user_id: number; current_version: number }>(
        `INSERT INTO source_assets
          (owning_space_id, created_by_user_id, kind, title, access_policy,
           current_version)
         VALUES ($1, $2, $3, $4, $5, 0)
         RETURNING id, created_by_user_id, current_version`,
        [spaceId, userId, input.kind, title, input.accessPolicy ?? "editors"]
      )
    ).rows[0];
    const version = await appendSourceVersionInternal(client, source, {
      content: input.content,
      extractorVersion: input.kind === "webpage" ? "webpage-import-v1" : "manual-v1",
      provenance: input.provenance,
    });
    return { sourceId: source.id, sourceVersionId: version.id };
  });
}

export async function replaceSourceContent(
  userId: number,
  sourceId: string,
  input: {
    content: unknown;
    originalFilename?: string | null;
    mimeType?: string | null;
    extractorVersion?: string;
    provenance?: Record<string, unknown>;
  }
) {
  return tx(async (client) => {
    const source = await getAuthorizedSource(client, userId, sourceId, "content.update");
    if (source.lifecycle_status === "archived") {
      throw new StudioConflictError("Restore the source before replacing it");
    }
    return appendSourceVersionInternal(client, source, input);
  });
}

export async function updateSourceGovernance(
  userId: number,
  sourceId: string,
  input: {
    lifecycleStatus?: "active" | "archived" | "deletion_scheduled";
    accessPolicy?: "owner" | "editors" | "members";
    retentionPolicy?: Record<string, unknown>;
  }
) {
  return tx(async (client) => {
    const source = await getAuthorizedSource(client, userId, sourceId, "content.update");
    const status = input.lifecycleStatus ?? source.lifecycle_status;
    const at = nowIso();
    const row = (
      await client.query<SourceSummary>(
        `UPDATE source_assets SET
           lifecycle_status = $2,
           access_policy = COALESCE($3, access_policy),
           retention_policy_json = COALESCE($4, retention_policy_json),
           deletion_scheduled_at = CASE WHEN $2 = 'deletion_scheduled' THEN $5 ELSE NULL END,
           updated_at = $5
         WHERE id = $1 RETURNING *`,
        [
          sourceId,
          status,
          input.accessPolicy ?? null,
          input.retentionPolicy === undefined ? null : JSON.stringify(input.retentionPolicy),
          at,
        ]
      )
    ).rows[0];
    return row;
  });
}

export async function createCourseDraftFromSources(
  userId: number,
  spaceId: string,
  input: { title: string; sourceVersionIds: string[] }
): Promise<{ courseId: number; courseVersionId: string }> {
  const title = input.title.trim();
  const sourceVersionIds = [...new Set(input.sourceVersionIds)];
  if (title.length < 2 || title.length > 120) {
    throw new StudioConflictError("Course title must be between 2 and 120 characters");
  }
  if (sourceVersionIds.length < 1 || sourceVersionIds.length > 20) {
    throw new StudioConflictError("Choose between 1 and 20 source versions");
  }
  return tx(async (client) => {
    await authorizeStoredMembership(userId, spaceId, "content.create", client);
    const sources = (
      await client.query<{
        id: string;
        source_id: string;
        extracted_content_json: string | null;
      }>(
        `SELECT version.id, version.source_id, version.extracted_content_json
         FROM source_versions version
         JOIN source_assets source ON source.id = version.source_id
         WHERE version.id = ANY($1::text[])
           AND source.owning_space_id = $2 AND source.lifecycle_status = 'active'`,
        [sourceVersionIds, spaceId]
      )
    ).rows;
    if (sources.length !== sourceVersionIds.length) {
      throw new StudioConflictError("One or more sources are unavailable in this Space");
    }
    const byId = new Map(sources.map((source) => [source.id, source]));
    const ordered = sourceVersionIds.map((id) => byId.get(id)!);
    if (new Set(ordered.map((source) => source.source_id)).size !== ordered.length) {
      throw new StudioConflictError("Choose only one version of each source");
    }
    const runId = newGenerationRunId();
    const combined = ordered.map((source) => ({
      sourceVersionId: source.id,
      content: source.extracted_content_json
        ? JSON.parse(source.extracted_content_json)
        : null,
    }));
    const course = (
      await client.query<{ id: number }>(
        `INSERT INTO courses
          (owner_id, owning_space_id, title, source_filename, source_json,
           status, generation_run_id, authoring_status)
         VALUES ($1, $2, $3, $4, $5, 'ready', $6, 'draft')
         RETURNING id`,
        [
          userId,
          spaceId,
          title,
          `${ordered.length} source${ordered.length === 1 ? "" : "s"}`,
          JSON.stringify(combined),
          runId,
        ]
      )
    ).rows[0];
    const collection = (
      await client.query<{ id: string }>(
        `INSERT INTO source_collections
          (owning_space_id, name, current_version, created_by_user_id)
         VALUES ($1, $2, 1, $3) RETURNING id`,
        [spaceId, `${title} sources`, userId]
      )
    ).rows[0];
    const collectionVersion = (
      await client.query<{ id: string }>(
        `INSERT INTO source_collection_versions
          (collection_id, version, status, created_by_user_id)
         VALUES ($1, 1, 'draft', $2) RETURNING id`,
        [collection.id, userId]
      )
    ).rows[0];
    for (let position = 0; position < ordered.length; position++) {
      const source = ordered[position];
      await client.query(
        `INSERT INTO source_collection_version_items
          (collection_version_id, source_version_id, position, usage_policy)
         VALUES ($1, $2, $3, $4)`,
        [collectionVersion.id, source.id, position, position === 0 ? "primary" : "supporting"]
      );
      await client.query(
        `INSERT INTO course_source_assets (course_id, source_id, position)
         VALUES ($1, $2, $3)`,
        [course.id, source.source_id, position]
      );
    }
    const emptyContent = JSON.stringify({ modules: [] });
    const courseVersion = (
      await client.query<{ id: string }>(
        `INSERT INTO course_versions
          (course_id, version_number, lifecycle_status, title, description,
           source_collection_version_id, outline_json, content_json,
           content_hash, created_by_user_id)
         VALUES ($1, 1, 'draft', $2, '', $3, '{}', $4, $5, $6)
         RETURNING id`,
        [course.id, title, collectionVersion.id, emptyContent, hash(emptyContent), userId]
      )
    ).rows[0];
    for (let position = 0; position < ordered.length; position++) {
      await client.query(
        `INSERT INTO course_version_sources
          (course_version_id, source_version_id, position, coverage_json)
         VALUES ($1, $2, $3, '{"status":"pending_review"}')`,
        [courseVersion.id, ordered[position].id, position]
      );
    }
    await client.query(
      `UPDATE courses SET source_collection_id = $2,
         current_draft_version_id = $3 WHERE id = $1`,
      [course.id, collection.id, courseVersion.id]
    );
    return { courseId: course.id, courseVersionId: courseVersion.id };
  });
}

async function authorizeCourseStudio(
  exec: Queryable,
  userId: number,
  courseId: number,
  capability: "content.read" | "content.update" | "content.review" | "content.publish"
) {
  const course = (
    await exec.query<{
      id: number;
      owning_space_id: string;
      current_draft_version_id: string | null;
      published_version_id: string | null;
    }>("SELECT id, owning_space_id, current_draft_version_id, published_version_id FROM courses WHERE id = $1", [courseId])
  ).rows[0];
  if (!course) throw new StudioConflictError("Course not found");
  await authorizeStoredMembership(userId, course.owning_space_id, capability, exec);
  return course;
}

export interface StudioBlock {
  id: string;
  lineageId: string;
  moduleKey: string;
  moduleTitle: string;
  moduleSummary: string;
  lessonKey: string;
  lessonTitle: string;
  modulePosition: number;
  lessonPosition: number;
  position: number;
  blockType: BlockType;
  revision: number;
  content: unknown;
  sourceRefs: unknown[];
  accessibility: Record<string, unknown>;
  editOrigin: string;
}

async function readStudioBlocks(exec: Queryable, versionId: string): Promise<StudioBlock[]> {
  const rows = (
    await exec.query<{
      id: string;
      lineage_id: string;
      module_key: string;
      module_title: string;
      module_summary: string;
      lesson_key: string;
      lesson_title: string;
      module_position: number;
      lesson_position: number;
      position: number;
      block_type: BlockType;
      current_revision: number;
      content_json: string;
      source_refs_json: string;
      accessibility_json: string;
      edit_origin: string;
    }>(
      `SELECT block.*, revision.content_json, revision.source_refs_json,
              revision.accessibility_json, revision.edit_origin
       FROM course_blocks block
       JOIN course_block_revisions revision
         ON revision.block_id = block.id AND revision.revision = block.current_revision
       WHERE block.course_version_id = $1
       ORDER BY block.module_position, block.lesson_position, block.position`,
      [versionId]
    )
  ).rows;
  return rows.map((row) => ({
    id: row.id,
    lineageId: row.lineage_id,
    moduleKey: row.module_key,
    moduleTitle: row.module_title,
    moduleSummary: row.module_summary,
    lessonKey: row.lesson_key,
    lessonTitle: row.lesson_title,
    modulePosition: row.module_position,
    lessonPosition: row.lesson_position,
    position: row.position,
    blockType: row.block_type,
    revision: row.current_revision,
    content: JSON.parse(row.content_json),
    sourceRefs: JSON.parse(row.source_refs_json),
    accessibility: JSON.parse(row.accessibility_json),
    editOrigin: row.edit_origin,
  }));
}

export async function getCourseStudio(userId: number, courseId: number) {
  return tx(async (client) => {
    const course = await authorizeCourseStudio(client, userId, courseId, "content.update");
    const versionId = course.current_draft_version_id ?? course.published_version_id;
    if (!versionId) throw new StudioConflictError("Course version not found");
    const version = (
      await client.query(
        `SELECT id, course_id, version_number, parent_version_id,
                lifecycle_status, title, description, outline_json,
                source_collection_version_id, recipe_version_id,
                created_at, updated_at
         FROM course_versions WHERE id = $1`,
        [versionId]
      )
    ).rows[0];
    const sources = (
      await client.query(
        `SELECT source.id AS source_id, source.title, source.kind,
                version.id AS source_version_id, version.version,
                link.position, link.coverage_json
         FROM course_version_sources link
         JOIN source_versions version ON version.id = link.source_version_id
         JOIN source_assets source ON source.id = version.source_id
         WHERE link.course_version_id = $1 ORDER BY link.position`,
        [versionId]
      )
    ).rows;
    return { course, version, sources, blocks: await readStudioBlocks(client, versionId) };
  });
}

async function validateSourceRefs(
  exec: Queryable,
  versionId: string,
  sourceRefs: unknown[]
) {
  const requested = sourceRefs
    .map((ref) =>
      ref && typeof ref === "object" && "sourceVersionId" in ref
        ? String((ref as { sourceVersionId: unknown }).sourceVersionId)
        : null
    )
    .filter((value): value is string => !!value);
  if (requested.length === 0) return;
  const result = await exec.query<{ id: string }>(
    `SELECT source_version_id AS id FROM course_version_sources
     WHERE course_version_id = $1 AND source_version_id = ANY($2::text[])`,
    [versionId, requested]
  );
  if (new Set(result.rows.map((row) => row.id)).size !== new Set(requested).size) {
    throw new StudioConflictError("A source reference is outside this course version");
  }
}

export async function updateCourseBlock(
  userId: number,
  courseId: number,
  blockId: string,
  input: { expectedRevision: number; content: unknown; sourceRefs?: unknown[] }
): Promise<StudioBlock> {
  return tx(async (client) => {
    const course = await authorizeCourseStudio(client, userId, courseId, "content.update");
    if (!course.current_draft_version_id) throw new StudioConflictError("Branch a draft before editing");
    const block = (
      await client.query<{
        id: string;
        course_version_id: string;
        block_type: BlockType;
        current_revision: number;
      }>(
        `SELECT block.id, block.course_version_id, block.block_type,
                block.current_revision
         FROM course_blocks block
         JOIN course_versions version ON version.id = block.course_version_id
         WHERE block.id = $1 AND block.course_version_id = $2
           AND version.lifecycle_status = 'draft'
         FOR UPDATE OF block`,
        [blockId, course.current_draft_version_id]
      )
    ).rows[0];
    if (!block) throw new StudioConflictError("Editable block not found");
    if (block.current_revision !== input.expectedRevision) {
      throw new StudioConflictError("This block changed since it was opened");
    }
    const validation = validateBlockContent(block.block_type, input.content);
    if (!validation.valid) throw new StudioConflictError(validation.issues.join("; "));
    const sourceRefs = input.sourceRefs ?? [];
    await validateSourceRefs(client, block.course_version_id, sourceRefs);
    const revision = block.current_revision + 1;
    const at = nowIso();
    await client.query(
      `INSERT INTO course_block_revisions
        (block_id, revision, content_json, source_refs_json,
         accessibility_json, provenance_json, edit_origin,
         created_by_user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, $8)`,
      [
        block.id,
        revision,
        JSON.stringify(input.content),
        JSON.stringify(sourceRefs),
        JSON.stringify({ status: "checked", issues: validation.issues }),
        JSON.stringify({ editor: "studio-v1" }),
        userId,
        at,
      ]
    );
    await client.query(
      `UPDATE course_blocks SET current_revision = $2, updated_at = $3
       WHERE id = $1`,
      [block.id, revision, at]
    );
    await client.query(
      `UPDATE course_versions SET content_hash = $2, updated_at = $3
       WHERE id = $1`,
      [block.course_version_id, hash(`${block.id}:${revision}:${JSON.stringify(input.content)}`), at]
    );
    return (await readStudioBlocks(client, block.course_version_id)).find(
      (candidate) => candidate.id === block.id
    )!;
  });
}

export async function addCourseBlock(
  userId: number,
  courseId: number,
  input: {
    moduleKey: string;
    moduleTitle: string;
    moduleSummary?: string;
    lessonKey: string;
    lessonTitle: string;
    modulePosition: number;
    lessonPosition: number;
    blockType: BlockType;
    content: unknown;
    sourceRefs?: unknown[];
  }
): Promise<StudioBlock> {
  const validation = validateBlockContent(input.blockType, input.content);
  if (!validation.valid) throw new StudioConflictError(validation.issues.join("; "));
  return tx(async (client) => {
    const course = await authorizeCourseStudio(client, userId, courseId, "content.update");
    if (!course.current_draft_version_id) throw new StudioConflictError("Branch a draft before editing");
    await validateSourceRefs(client, course.current_draft_version_id, input.sourceRefs ?? []);
    const position = Number(
      (
        await client.query<{ position: number }>(
          `SELECT COALESCE(MAX(position), -1) + 1 AS position
           FROM course_blocks WHERE course_version_id = $1 AND lesson_key = $2`,
          [course.current_draft_version_id, input.lessonKey]
        )
      ).rows[0]?.position ?? 0
    );
    const block = (
      await client.query<{ id: string }>(
        `INSERT INTO course_blocks
          (course_version_id, lineage_id, module_key, module_title,
           module_summary, lesson_key, lesson_title, module_position,
           lesson_position, position, block_type, current_revision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)
         RETURNING id`,
        [
          course.current_draft_version_id,
          crypto.randomUUID(),
          input.moduleKey,
          input.moduleTitle,
          input.moduleSummary ?? "",
          input.lessonKey,
          input.lessonTitle,
          input.modulePosition,
          input.lessonPosition,
          position,
          input.blockType,
        ]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO course_block_revisions
        (block_id, revision, content_json, source_refs_json,
         accessibility_json, provenance_json, edit_origin, created_by_user_id)
       VALUES ($1, 1, $2, $3, $4, $5, 'manual', $6)`,
      [
        block.id,
        JSON.stringify(input.content),
        JSON.stringify(input.sourceRefs ?? []),
        JSON.stringify({ status: "checked", issues: validation.issues }),
        JSON.stringify({ editor: "studio-v1" }),
        userId,
      ]
    );
    return (await readStudioBlocks(client, course.current_draft_version_id)).find(
      (candidate) => candidate.id === block.id
    )!;
  });
}

export async function reorderLessonBlocks(
  userId: number,
  courseId: number,
  lessonKey: string,
  orderedBlockIds: string[]
): Promise<void> {
  await tx(async (client) => {
    const course = await authorizeCourseStudio(client, userId, courseId, "content.update");
    if (!course.current_draft_version_id) throw new StudioConflictError("Branch a draft before editing");
    const rows = (
      await client.query<{ id: string }>(
        `SELECT id FROM course_blocks
         WHERE course_version_id = $1 AND lesson_key = $2
         ORDER BY position FOR UPDATE`,
        [course.current_draft_version_id, lessonKey]
      )
    ).rows;
    const current = rows.map((row) => row.id);
    if (
      current.length !== orderedBlockIds.length ||
      current.some((id) => !orderedBlockIds.includes(id)) ||
      new Set(orderedBlockIds).size !== orderedBlockIds.length
    ) {
      throw new StudioConflictError("Block order must contain the complete lesson exactly once");
    }
    await client.query(
      `UPDATE course_blocks SET position = position + 1000000
       WHERE course_version_id = $1 AND lesson_key = $2`,
      [course.current_draft_version_id, lessonKey]
    );
    for (let position = 0; position < orderedBlockIds.length; position++) {
      await client.query(
        "UPDATE course_blocks SET position = $2, updated_at = $3 WHERE id = $1",
        [orderedBlockIds[position], position, nowIso()]
      );
    }
  });
}

export async function analyzeCourseVersion(
  userId: number,
  courseId: number
) {
  return tx(async (client) => {
    const course = await authorizeCourseStudio(client, userId, courseId, "content.read");
    const versionId = course.current_draft_version_id ?? course.published_version_id;
    if (!versionId) throw new StudioConflictError("Course version not found");
    const blocks = await readStudioBlocks(client, versionId);
    const linked = new Set(
      (
        await client.query<{ source_version_id: string }>(
          "SELECT source_version_id FROM course_version_sources WHERE course_version_id = $1",
          [versionId]
        )
      ).rows.map((row) => row.source_version_id)
    );
    const results = blocks.map((block) => {
      const validation = validateBlockContent(block.blockType, block.content);
      const refs = block.sourceRefs
        .map((ref) =>
          ref && typeof ref === "object" && "sourceVersionId" in ref
            ? String((ref as { sourceVersionId: unknown }).sourceVersionId)
            : null
        )
        .filter((value): value is string => !!value);
      const traced = refs.length > 0 && refs.every((id) => linked.has(id));
      return {
        blockId: block.id,
        lineageId: block.lineageId,
        blockType: block.blockType,
        traced,
        accessibilityValid: validation.valid,
        issues: validation.issues,
        offline: BLOCK_CHANNELS[block.blockType].offline,
        chat: BLOCK_CHANNELS[block.blockType].chat,
        fallback: BLOCK_CHANNELS[block.blockType].fallback,
      };
    });
    return {
      versionId,
      totalBlocks: results.length,
      tracedBlocks: results.filter((result) => result.traced).length,
      unsupportedBlockIds: results.filter((result) => !result.traced).map((result) => result.blockId),
      accessibilityIssueBlockIds: results
        .filter((result) => !result.accessibilityValid)
        .map((result) => result.blockId),
      blocks: results,
    };
  });
}
