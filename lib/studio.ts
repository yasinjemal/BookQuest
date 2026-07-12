import crypto from "crypto";
import { newGenerationRunId } from "./generation-run";
import { pool, tx, type Queryable } from "./pg";
import { authorizeStoredMembership } from "./spaces";

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
