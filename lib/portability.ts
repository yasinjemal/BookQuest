import crypto from "crypto";
import { z } from "zod/v4";
import { BLOCK_SCHEMAS, validateBlockContent, type BlockType } from "./block-registry";
import { CourseAppearanceSchema, parseCourseAppearance, serializeCourseAppearance } from "./course-appearance";
import { newGenerationRunId } from "./generation-run";
import { pool, tx, type Queryable } from "./pg";
import type { RecipeDefinition, RecipeVisibility } from "./recipes";
import { authorizeStoredMembership } from "./spaces";
import { assertCoverStorageCapacity, insertCoverImage } from "./cover-images";
import { CoverImageError, validateStoredCoverImage, type ProcessedCoverImage } from "./cover-processing";

export const COURSE_ARCHIVE_FORMAT = "bookquest.course" as const;
export const COURSE_ARCHIVE_SCHEMA_VERSION = 2 as const;
const LEGACY_COURSE_ARCHIVE_SCHEMA_VERSION = 1 as const;
export const MAX_COURSE_ARCHIVE_BYTES = 10 * 1024 * 1024;
export const MAX_COURSE_IMPORT_REQUEST_BYTES = MAX_COURSE_ARCHIVE_BYTES + 64 * 1024;
export const RECIPE_ARCHIVE_FORMAT = "bookquest.recipe" as const;
export const RECIPE_ARCHIVE_SCHEMA_VERSION = 1 as const;
export const MAX_RECIPE_ARCHIVE_BYTES = 2 * 1024 * 1024;

export class PortabilityError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PortabilityError";
  }
}

const SourceSchema = z.object({
  portableId: z.string().min(1).max(120),
  kind: z.enum(["pdf", "docx", "markdown", "text", "pptx", "webpage", "transcript", "manual"]),
  title: z.string().min(1).max(240),
  originalFilename: z.string().max(500).nullable(),
  mimeType: z.string().max(200).nullable(),
  usagePolicy: z.enum(["primary", "supporting", "reference", "excluded"]),
  content: z.unknown(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  coverage: z.record(z.string(), z.unknown()),
  provenance: z.record(z.string(), z.unknown()),
});

const PortableBlockType = z.enum(Object.keys(BLOCK_SCHEMAS) as [BlockType, ...BlockType[]]);
const BlockSchema = z.object({
  portableId: z.string().min(1).max(120),
  lineage: z.string().min(1).max(120),
  module: z.object({ key: z.string().min(1).max(160), title: z.string().max(240), summary: z.string().max(2000), position: z.number().int().min(0) }),
  lesson: z.object({ key: z.string().min(1).max(160), title: z.string().max(240), position: z.number().int().min(0) }),
  position: z.number().int().min(0),
  blockType: PortableBlockType,
  content: z.record(z.string(), z.unknown()),
  sourceRefs: z.array(z.record(z.string(), z.unknown())).max(100),
  accessibility: z.record(z.string(), z.unknown()),
  provenance: z.record(z.string(), z.unknown()),
  editOrigin: z.enum(["generated", "manual", "regenerated", "imported"]),
});

const RecipeDefinitionSchema = z.object({
  audience: z.record(z.string(), z.unknown()),
  objectives: z.array(z.string().min(1)).min(1).max(100),
  difficulty: z.string().min(1).max(120),
  durationMinutes: z.number().int().positive().max(100_000),
  lessonSizeMinutes: z.number().int().positive().max(10_000),
  teachingStyle: z.string().min(1).max(120), tone: z.string().min(1).max(120),
  language: z.string().min(1).max(80), readingLevel: z.string().min(1).max(120),
  blockMix: z.record(z.string(), z.number()), assessment: z.record(z.string(), z.unknown()),
  completionRule: z.record(z.string(), z.unknown()), credential: z.record(z.string(), z.unknown()),
  expiry: z.record(z.string(), z.unknown()), delivery: z.record(z.string(), z.unknown()),
  accessibility: z.record(z.string(), z.unknown()),
  sourceTracePolicy: z.enum(["required", "recommended", "manual_only"]),
  safetyBoundaries: z.array(z.string()).max(100),
});

const RecipeSchema = z.object({
  portableId: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  visibility: z.enum(["private", "space", "unlisted", "public"]),
  version: z.number().int().positive(),
  status: z.enum(["draft", "published", "archived"]),
  definition: RecipeDefinitionSchema,
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const CoverSchema = z.object({
  mimeType: z.literal("image/webp"),
  width: z.number().int().positive().max(1600),
  height: z.number().int().positive().max(2400),
  byteSize: z.number().int().positive().max(1_500_000),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  dataBase64: z.string().min(1).max(2_100_000),
});

const PortableCourseSchemaV1 = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(5000),
  category: z.string().max(120),
  appearance: CourseAppearanceSchema,
  sourceVersionNumber: z.number().int().positive(),
  sourceLifecycle: z.enum(["draft", "review", "approved", "published", "superseded", "archived"]),
});

const PortableCourseSchema = PortableCourseSchemaV1.extend({
  cover: CoverSchema.optional(),
});

const ArchiveCoreSchemaV1 = z.object({
  format: z.literal(COURSE_ARCHIVE_FORMAT),
  schemaVersion: z.literal(LEGACY_COURSE_ARCHIVE_SCHEMA_VERSION),
  archiveId: z.string().min(1).max(240),
  exportedAt: z.string().datetime({ offset: true }),
  payload: z.object({
    course: PortableCourseSchemaV1,
    sources: z.array(SourceSchema).max(50),
    recipe: RecipeSchema.nullable(),
    blocks: z.array(BlockSchema).max(5000),
  }),
});

const ArchiveCoreSchema = z.object({
  format: z.literal(COURSE_ARCHIVE_FORMAT),
  schemaVersion: z.literal(COURSE_ARCHIVE_SCHEMA_VERSION),
  archiveId: z.string().min(1).max(240),
  exportedAt: z.string().datetime({ offset: true }),
  payload: z.object({
    course: PortableCourseSchema,
    sources: z.array(SourceSchema).max(50),
    recipe: RecipeSchema.nullable(),
    blocks: z.array(BlockSchema).max(5000),
  }),
});

export const CourseArchiveSchema = ArchiveCoreSchema.extend({
  integrity: z.object({ algorithm: z.literal("sha256"), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
});
export type CourseArchive = z.infer<typeof CourseArchiveSchema>;

const CourseArchiveSchemaV1 = ArchiveCoreSchemaV1.extend({
  integrity: z.object({ algorithm: z.literal("sha256"), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
});
const AnyCourseArchiveSchema = z.discriminatedUnion("schemaVersion", [
  CourseArchiveSchemaV1,
  CourseArchiveSchema,
]);
type ParsedCourseArchive = z.infer<typeof AnyCourseArchiveSchema>;

const RecipeArchiveCoreSchema = z.object({
  format: z.literal(RECIPE_ARCHIVE_FORMAT),
  schemaVersion: z.literal(RECIPE_ARCHIVE_SCHEMA_VERSION),
  archiveId: z.string().min(1).max(240),
  exportedAt: z.string().datetime({ offset: true }),
  payload: z.object({ recipe: RecipeSchema }),
});

export const RecipeArchiveSchema = RecipeArchiveCoreSchema.extend({
  integrity: z.object({ algorithm: z.literal("sha256"), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
});
export type RecipeArchive = z.infer<typeof RecipeArchiveSchema>;

export interface ImportIssue {
  severity: "error" | "warning" | "info";
  code: string;
  path?: string;
  message: string;
}

export interface CourseImportReport {
  format: typeof COURSE_ARCHIVE_FORMAT;
  schemaVersion: typeof LEGACY_COURSE_ARCHIVE_SCHEMA_VERSION | typeof COURSE_ARCHIVE_SCHEMA_VERSION;
  archiveId: string;
  archiveSha256: string;
  canImport: boolean;
  proposedTitle: string;
  counts: { sources: number; blocks: number; modules: number; lessons: number; recipe: number };
  issues: ImportIssue[];
}

export interface RecipeImportReport {
  format: typeof RECIPE_ARCHIVE_FORMAT;
  schemaVersion: typeof RECIPE_ARCHIVE_SCHEMA_VERSION;
  archiveId: string;
  archiveSha256: string;
  canImport: boolean;
  proposedTitle: string;
  issues: ImportIssue[];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonical(value));
}

export function portableSha256(value: unknown) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function portableCoverBytes(cover: z.infer<typeof CoverSchema>) {
  const bytes = Buffer.from(cover.dataBase64, "base64");
  if (bytes.length !== cover.byteSize || bytes.toString("base64") !== cover.dataBase64) {
    throw new PortabilityError("Course cover bytes are not valid base64 or do not match their declared size");
  }
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== cover.contentHash) {
    throw new PortabilityError("Course cover integrity check failed");
  }
  return bytes;
}

async function validatePortableCover(
  archive: ParsedCourseArchive
): Promise<ProcessedCoverImage | null> {
  if (archive.schemaVersion !== COURSE_ARCHIVE_SCHEMA_VERSION) return null;
  const declaration = archive.payload.course.cover;
  if (!declaration) return null;
  try {
    const cover = await validateStoredCoverImage(portableCoverBytes(declaration));
    if (
      cover.mimeType !== declaration.mimeType ||
      cover.width !== declaration.width ||
      cover.height !== declaration.height ||
      cover.byteSize !== declaration.byteSize ||
      cover.contentHash !== declaration.contentHash
    ) {
      throw new PortabilityError("Course cover metadata does not match its image bytes", 422);
    }
    return cover;
  } catch (error) {
    if (error instanceof PortabilityError) throw error;
    if (error instanceof CoverImageError) {
      throw new PortabilityError(`Course cover is not restorable: ${error.message}`, 422);
    }
    throw error;
  }
}

function safeJson(value: string | null | undefined, fallback: unknown) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(password|secret|token|raw_storage|user_?id|generation_?run_?id|api_?key)/i.test(key))
    .map(([key, child]) => [key, sanitizeMetadata(child)]));
}

function recipeDefinition(row: Record<string, unknown>): RecipeDefinition {
  return {
    audience: safeJson(String(row.audience_json ?? "{}"), {}),
    objectives: safeJson(String(row.objectives_json ?? "[]"), []),
    difficulty: String(row.difficulty), durationMinutes: Number(row.duration_minutes),
    lessonSizeMinutes: Number(row.lesson_size_minutes), teachingStyle: String(row.teaching_style),
    tone: String(row.tone), language: String(row.language), readingLevel: String(row.reading_level),
    blockMix: safeJson(String(row.block_mix_json ?? "{}"), {}),
    assessment: safeJson(String(row.assessment_json ?? "{}"), {}),
    completionRule: safeJson(String(row.completion_rule_json ?? "{}"), {}),
    credential: safeJson(String(row.credential_json ?? "{}"), {}),
    expiry: safeJson(String(row.expiry_json ?? "{}"), {}),
    delivery: safeJson(String(row.delivery_json ?? "{}"), {}),
    accessibility: safeJson(String(row.accessibility_json ?? "{}"), {}),
    sourceTracePolicy: row.source_trace_policy as RecipeDefinition["sourceTracePolicy"],
    safetyBoundaries: safeJson(String(row.safety_boundaries_json ?? "[]"), []),
  };
}

function replaceSourceRefs(value: unknown, sourceIds: Map<string, string>, importing = false): unknown {
  if (Array.isArray(value)) return value.map((child) => replaceSourceRefs(child, sourceIds, importing));
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (!importing && key === "sourceVersionId") {
      const portable = sourceIds.get(String(child));
      if (!portable) throw new PortabilityError("Course block cites a source outside the exported course version");
      output.sourcePortableId = portable;
      continue;
    }
    if (importing && key === "sourcePortableId") {
      const internal = sourceIds.get(String(child));
      if (!internal) throw new PortabilityError("Course block cites a source missing from the archive");
      output.sourceVersionId = internal;
      continue;
    }
    if (importing && key === "sourceVersionId") {
      throw new PortabilityError("Archive citations cannot contain installation-specific sourceVersionId values");
    }
    output[key] = replaceSourceRefs(child, sourceIds, importing);
  }
  return output;
}

function inspectSourceReferences(value: unknown, sourceIds: Set<string>, path: string, issues: ImportIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => inspectSourceReferences(child, sourceIds, `${path}.${index}`, issues));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "sourceVersionId") {
      issues.push({
        severity: "error",
        code: "installation_source_reference",
        path,
        message: "Archive citations cannot contain installation-specific sourceVersionId values.",
      });
      continue;
    }
    if (key === "sourcePortableId") {
      if (typeof child !== "string" || !sourceIds.has(child)) {
        issues.push({
          severity: "error",
          code: "unknown_source_reference",
          path,
          message: `Block references unknown source ${String(child)}.`,
        });
      }
      continue;
    }
    inspectSourceReferences(child, sourceIds, `${path}.${key}`, issues);
  }
}

export async function exportCourseArchive(actorUserId: number, courseId: number): Promise<CourseArchive> {
  return tx(async (client) => {
    const course = (await client.query<{
      id: number; owning_space_id: string; title: string; description: string; category: string;
      public_slug: string; current_draft_version_id: string | null; published_version_id: string | null;
    }>(`SELECT id,owning_space_id,title,description,category,public_slug,
             current_draft_version_id,published_version_id
          FROM courses WHERE id=$1 FOR SHARE`, [courseId])).rows[0];
    if (!course) throw new PortabilityError("Course not found", 404);
    await authorizeStoredMembership(actorUserId, course.owning_space_id, "content.update", client);
    const versionId = course.current_draft_version_id ?? course.published_version_id;
    if (!versionId) throw new PortabilityError("Course version not found", 404);
    const version = (await client.query<Record<string, unknown>>(
      `SELECT * FROM course_versions WHERE id=$1 AND course_id=$2`, [versionId, courseId])).rows[0];
    if (!version) throw new PortabilityError("Course version not found", 404);
    const sourceRows = (await client.query<Record<string, unknown>>(
      `SELECT source.id AS source_id,source.kind,source.title,source_version.id AS source_version_id,
              source_version.original_filename,source_version.mime_type,source_version.extracted_content_json,
              source_version.provenance_json,link.position,link.coverage_json,
              COALESCE(item.usage_policy,'primary') AS usage_policy
       FROM course_version_sources link
       JOIN source_versions source_version ON source_version.id=link.source_version_id
       JOIN source_assets source ON source.id=source_version.source_id
       LEFT JOIN source_collection_version_items item
         ON item.collection_version_id=$2 AND item.source_version_id=source_version.id
       WHERE link.course_version_id=$1 ORDER BY link.position`, [versionId, version.source_collection_version_id ?? null])).rows;
    const sourceIdMap = new Map<string, string>();
    const sources = sourceRows.map((row, index) => {
      const portableId = `source-${index + 1}`;
      sourceIdMap.set(String(row.source_version_id), portableId);
      const content = safeJson(String(row.extracted_content_json ?? "[]"), []);
      return {
        portableId, kind: row.kind as z.infer<typeof SourceSchema>["kind"], title: String(row.title),
        originalFilename: row.original_filename ? String(row.original_filename) : null,
        mimeType: row.mime_type ? String(row.mime_type) : null,
        usagePolicy: row.usage_policy as z.infer<typeof SourceSchema>["usagePolicy"],
        content, contentSha256: portableSha256(content),
        coverage: safeJson(String(row.coverage_json ?? "{}"), {}),
        provenance: sanitizeMetadata(safeJson(String(row.provenance_json ?? "{}"), {})) as Record<string, unknown>,
      };
    });
    const blockRows = (await client.query<Record<string, unknown>>(
      `SELECT block.*,revision.content_json,revision.source_refs_json,
              revision.accessibility_json,revision.provenance_json,revision.edit_origin
       FROM course_blocks block JOIN course_block_revisions revision
         ON revision.block_id=block.id AND revision.revision=block.current_revision
       WHERE block.course_version_id=$1 AND block.deleted_at IS NULL
       ORDER BY block.module_position,block.lesson_position,block.position`, [versionId])).rows;
    const archiveScope = portableSha256(`${course.public_slug}:${version.content_hash}`).slice(0, 24);
    const blocks = blockRows.map((row, index) => ({
      portableId: `block-${index + 1}`,
      lineage: portableSha256(`${archiveScope}:${row.lineage_id}`).slice(0, 40),
      module: { key: String(row.module_key), title: String(row.module_title), summary: String(row.module_summary), position: Number(row.module_position) },
      lesson: { key: String(row.lesson_key), title: String(row.lesson_title), position: Number(row.lesson_position) },
      position: Number(row.position), blockType: row.block_type as BlockType,
      content: safeJson(String(row.content_json), {}),
      sourceRefs: replaceSourceRefs(safeJson(String(row.source_refs_json ?? "[]"), []), sourceIdMap) as Array<Record<string, unknown>>,
      accessibility: safeJson(String(row.accessibility_json ?? "{}"), {}),
      provenance: sanitizeMetadata(safeJson(String(row.provenance_json ?? "{}"), {})) as Record<string, unknown>,
      editOrigin: row.edit_origin as z.infer<typeof BlockSchema>["editOrigin"],
    }));
    let recipe: z.infer<typeof RecipeSchema> | null = null;
    if (version.recipe_version_id) {
      const row = (await client.query<Record<string, unknown>>(
        `SELECT recipe.title,recipe.visibility,recipe_version.*
         FROM recipe_versions recipe_version JOIN recipes recipe ON recipe.id=recipe_version.recipe_id
         WHERE recipe_version.id=$1`, [version.recipe_version_id])).rows[0];
      if (row) {
        const definition = recipeDefinition(row);
        recipe = { portableId: "recipe-1", title: String(row.title), visibility: row.visibility as RecipeVisibility,
          version: Number(row.version), status: row.status as z.infer<typeof RecipeSchema>["status"],
          definition, contentSha256: portableSha256(definition) };
      }
    }
    let cover: z.infer<typeof CoverSchema> | undefined;
    if (version.cover_image_hash) {
      const image = (
        await client.query<{
          image_data: Buffer;
          mime_type: "image/webp";
          width: number;
          height: number;
          byte_size: number;
          content_hash: string;
        }>("SELECT image_data, mime_type, width, height, byte_size, content_hash FROM cover_images WHERE content_hash = $1", [version.cover_image_hash])
      ).rows[0];
      if (image) {
        cover = {
          mimeType: image.mime_type,
          width: Number(image.width),
          height: Number(image.height),
          byteSize: Number(image.byte_size),
          contentHash: image.content_hash,
          dataBase64: image.image_data.toString("base64"),
        };
      }
    }
    const core: z.infer<typeof ArchiveCoreSchema> = {
      format: COURSE_ARCHIVE_FORMAT, schemaVersion: COURSE_ARCHIVE_SCHEMA_VERSION,
      archiveId: `urn:bookquest:course:${archiveScope}:v${Number(version.version_number)}`,
      exportedAt: new Date().toISOString(),
      payload: { course: { title: String(version.title), description: String(version.description),
        category: course.category, appearance: parseCourseAppearance(version.appearance_json),
        ...(cover ? { cover } : {}),
        sourceVersionNumber: Number(version.version_number), sourceLifecycle: version.lifecycle_status as z.infer<typeof ArchiveCoreSchema>["payload"]["course"]["sourceLifecycle"] },
        sources, recipe, blocks },
    };
    const archive = CourseArchiveSchema.parse({
      ...core,
      integrity: { algorithm: "sha256", sha256: portableSha256(core) },
    });
    if (Buffer.byteLength(JSON.stringify(archive), "utf8") > MAX_COURSE_ARCHIVE_BYTES) {
      throw new PortabilityError(
        "Course archive exceeds the 10 MB portable limit. Remove unusually large source content or the cover before exporting.",
        413
      );
    }
    return archive;
  });
}

export function parseCourseArchive(input: unknown): ParsedCourseArchive {
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_COURSE_ARCHIVE_BYTES) {
    throw new PortabilityError("Course archive exceeds the 10 MB limit", 413);
  }
  const result = AnyCourseArchiveSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new PortabilityError(`Invalid course archive at ${issue?.path.join(".") || "document"}: ${issue?.message || "validation failed"}`);
  }
  const { integrity, ...core } = result.data;
  if (portableSha256(core) !== integrity.sha256) throw new PortabilityError("Course archive integrity check failed");
  if (result.data.schemaVersion === COURSE_ARCHIVE_SCHEMA_VERSION && result.data.payload.course.cover) {
    portableCoverBytes(result.data.payload.course.cover);
  }
  return result.data;
}

export async function exportRecipeArchive(actorUserId: number, recipeId: string): Promise<RecipeArchive> {
  return tx(async (client) => {
    const row = (await client.query<Record<string, unknown>>(
      `SELECT recipe.id,recipe.owning_space_id,recipe.title,recipe.visibility,
              recipe.current_version,version.*
       FROM recipes recipe JOIN recipe_versions version
         ON version.recipe_id=recipe.id AND version.version=recipe.current_version
       WHERE recipe.id=$1`, [recipeId])).rows[0];
    if (!row) throw new PortabilityError("Recipe not found", 404);
    await authorizeStoredMembership(actorUserId, String(row.owning_space_id), "content.update", client);
    const definition = recipeDefinition(row);
    const archiveScope = portableSha256(`${String(row.id)}:${String(row.content_hash)}`).slice(0, 24);
    const recipe: z.infer<typeof RecipeSchema> = {
      portableId: "recipe-1",
      title: String(row.title),
      visibility: row.visibility as RecipeVisibility,
      version: Number(row.current_version),
      status: row.status as z.infer<typeof RecipeSchema>["status"],
      definition,
      contentSha256: portableSha256(definition),
    };
    const core: z.infer<typeof RecipeArchiveCoreSchema> = {
      format: RECIPE_ARCHIVE_FORMAT,
      schemaVersion: RECIPE_ARCHIVE_SCHEMA_VERSION,
      archiveId: `urn:bookquest:recipe:${archiveScope}:v${recipe.version}`,
      exportedAt: new Date().toISOString(),
      payload: { recipe },
    };
    return RecipeArchiveSchema.parse({
      ...core,
      integrity: { algorithm: "sha256", sha256: portableSha256(core) },
    });
  });
}

export function parseRecipeArchive(input: unknown): RecipeArchive {
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_RECIPE_ARCHIVE_BYTES) {
    throw new PortabilityError("Recipe archive exceeds the 2 MB limit", 413);
  }
  const result = RecipeArchiveSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new PortabilityError(`Invalid recipe archive at ${issue?.path.join(".") || "document"}: ${issue?.message || "validation failed"}`);
  }
  const { integrity, ...core } = result.data;
  if (portableSha256(core) !== integrity.sha256) throw new PortabilityError("Recipe archive integrity check failed");
  return result.data;
}

async function analyzeParsedRecipeArchive(
  exec: Queryable,
  actorUserId: number,
  targetSpaceId: string,
  archive: RecipeArchive,
  titleOverride?: string
): Promise<RecipeImportReport> {
  await authorizeStoredMembership(actorUserId, targetSpaceId, "content.create", exec);
  const issues: ImportIssue[] = [];
  const requestedTitle = titleOverride?.trim() || archive.payload.recipe.title;
  if (requestedTitle.length < 2 || requestedTitle.length > 240) {
    issues.push({ severity: "error", code: "invalid_title", path: "title", message: "Imported recipe title must be between 2 and 240 characters." });
  }
  if (portableSha256(archive.payload.recipe.definition) !== archive.payload.recipe.contentSha256) {
    issues.push({ severity: "error", code: "recipe_hash_mismatch", path: "payload.recipe", message: "Recipe failed its integrity check." });
  }
  const duplicate = await exec.query(
    "SELECT 1 FROM portable_recipe_imports WHERE target_space_id=$1 AND archive_sha256=$2",
    [targetSpaceId, archive.integrity.sha256]
  );
  if (duplicate.rowCount) {
    issues.push({ severity: "error", code: "archive_already_imported", message: "This exact recipe archive has already been imported into the target Space." });
  }
  const title = await exec.query(
    "SELECT 1 FROM recipes WHERE owning_space_id=$1 AND lower(title)=lower($2) LIMIT 1",
    [targetSpaceId, requestedTitle]
  );
  const proposedTitle = title.rowCount ? `${requestedTitle.slice(0, 229).trimEnd()} (imported)` : requestedTitle;
  if (title.rowCount) {
    issues.push({ severity: "warning", code: "title_conflict", message: `A recipe with this title already exists; the imported private draft will be named “${proposedTitle}”.` });
  }
  return {
    format: RECIPE_ARCHIVE_FORMAT,
    schemaVersion: RECIPE_ARCHIVE_SCHEMA_VERSION,
    archiveId: archive.archiveId,
    archiveSha256: archive.integrity.sha256,
    canImport: !issues.some((issue) => issue.severity === "error"),
    proposedTitle,
    issues,
  };
}

export async function analyzeRecipeArchive(
  actorUserId: number,
  targetSpaceId: string,
  input: unknown,
  titleOverride?: string
): Promise<RecipeImportReport> {
  return analyzeParsedRecipeArchive(pool, actorUserId, targetSpaceId, parseRecipeArchive(input), titleOverride);
}

async function analyzeParsedArchive(exec: Queryable, actorUserId: number, targetSpaceId: string, archive: ParsedCourseArchive, titleOverride?: string): Promise<CourseImportReport> {
  await authorizeStoredMembership(actorUserId, targetSpaceId, "content.create", exec);
  const issues: ImportIssue[] = [];
  const requestedTitle = titleOverride?.trim() || archive.payload.course.title;
  if (requestedTitle.length < 2 || requestedTitle.length > 120) {
    issues.push({ severity: "error", code: "invalid_title", path: "title", message: "Imported course title must be between 2 and 120 characters." });
  }
  const sourceIds = new Set<string>();
  for (const [index, source] of archive.payload.sources.entries()) {
    if (sourceIds.has(source.portableId)) issues.push({ severity: "error", code: "duplicate_source_id", path: `payload.sources.${index}.portableId`, message: "Source portable IDs must be unique." });
    sourceIds.add(source.portableId);
    if (portableSha256(source.content) !== source.contentSha256) issues.push({ severity: "error", code: "source_hash_mismatch", path: `payload.sources.${index}`, message: `Source ${source.portableId} failed its integrity check.` });
  }
  const blockIds = new Set<string>();
  const positions = new Set<string>();
  for (const [index, block] of archive.payload.blocks.entries()) {
    if (blockIds.has(block.portableId)) issues.push({ severity: "error", code: "duplicate_block_id", path: `payload.blocks.${index}.portableId`, message: "Block portable IDs must be unique." });
    blockIds.add(block.portableId);
    const position = `${block.module.position}:${block.lesson.position}:${block.position}`;
    if (positions.has(position)) issues.push({ severity: "error", code: "duplicate_block_position", path: `payload.blocks.${index}`, message: "Two blocks occupy the same module, lesson and block position." });
    positions.add(position);
    const validation = validateBlockContent(block.blockType, block.content);
    if (!validation.valid) issues.push({ severity: "error", code: "invalid_block", path: `payload.blocks.${index}.content`, message: validation.issues.join("; ") });
    inspectSourceReferences(block.sourceRefs, sourceIds, `payload.blocks.${index}.sourceRefs`, issues);
  }
  if (archive.payload.recipe && portableSha256(archive.payload.recipe.definition) !== archive.payload.recipe.contentSha256) {
    issues.push({ severity: "error", code: "recipe_hash_mismatch", path: "payload.recipe", message: "Recipe failed its integrity check." });
  }
  const duplicate = await exec.query("SELECT 1 FROM portable_course_imports WHERE target_space_id=$1 AND archive_sha256=$2", [targetSpaceId, archive.integrity.sha256]);
  if (duplicate.rowCount) issues.push({ severity: "error", code: "archive_already_imported", message: "This exact archive has already been imported into the target Space." });
  const title = await exec.query("SELECT 1 FROM courses WHERE owning_space_id=$1 AND lower(title)=lower($2) LIMIT 1", [targetSpaceId, requestedTitle]);
  const conflictTitle = `${requestedTitle.slice(0, 109).trimEnd()} (imported)`;
  const proposedTitle = title.rowCount ? conflictTitle : requestedTitle;
  if (title.rowCount) issues.push({ severity: "warning", code: "title_conflict", message: `A course with this title already exists; the imported draft will be named “${proposedTitle}”.` });
  for (const source of archive.payload.sources) {
    const match = await exec.query(
      `SELECT 1 FROM source_versions version JOIN source_assets source ON source.id=version.source_id
       WHERE source.owning_space_id=$1 AND version.content_hash=$2 LIMIT 1`, [targetSpaceId, source.contentSha256]);
    if (match.rowCount) issues.push({ severity: "info", code: "source_content_exists", path: `payload.sources.${source.portableId}`, message: "Matching source content exists; import creates an isolated owned copy." });
  }
  return { format: COURSE_ARCHIVE_FORMAT, schemaVersion: archive.schemaVersion,
    archiveId: archive.archiveId, archiveSha256: archive.integrity.sha256,
    canImport: !issues.some((issue) => issue.severity === "error"), proposedTitle,
    counts: { sources: archive.payload.sources.length, blocks: archive.payload.blocks.length,
      modules: new Set(archive.payload.blocks.map((block) => block.module.key)).size,
      lessons: new Set(archive.payload.blocks.map((block) => `${block.module.key}:${block.lesson.key}`)).size,
      recipe: archive.payload.recipe ? 1 : 0 }, issues };
}

export async function analyzeCourseArchive(actorUserId: number, targetSpaceId: string, input: unknown, titleOverride?: string) {
  const archive = parseCourseArchive(input);
  const report = await analyzeParsedArchive(pool, actorUserId, targetSpaceId, archive, titleOverride);
  if (report.canImport) await validatePortableCover(archive);
  return report;
}

function importedContentSnapshot(blocks: ParsedCourseArchive["payload"]["blocks"]) {
  const modules = [...new Map(blocks.map((block) => [block.module.key, block.module])).values()]
    .sort((a, b) => a.position - b.position)
    .map((module) => ({ key: module.key, title: module.title, summary: module.summary, position: module.position,
      lessons: [...new Map(blocks.filter((block) => block.module.key === module.key).map((block) => [block.lesson.key, block.lesson])).values()]
        .sort((a, b) => a.position - b.position).map((lesson) => ({ key: lesson.key, title: lesson.title, position: lesson.position })) }));
  return { modules };
}

async function insertImportedRecipe(exec: Queryable, actorUserId: number, targetSpaceId: string, recipe: NonNullable<ParsedCourseArchive["payload"]["recipe"]>) {
  const created = (await exec.query<{ id: string }>(
    `INSERT INTO recipes (owning_space_id,title,visibility,created_by_user_id)
     VALUES ($1,$2,'private',$3) RETURNING id`, [targetSpaceId, recipe.title, actorUserId])).rows[0];
  const d = recipe.definition as unknown as RecipeDefinition;
  const version = (await exec.query<{ id: string }>(
    `INSERT INTO recipe_versions
      (recipe_id,version,status,audience_json,objectives_json,difficulty,duration_minutes,
       lesson_size_minutes,teaching_style,tone,language,reading_level,block_mix_json,
       assessment_json,completion_rule_json,credential_json,expiry_json,delivery_json,
       accessibility_json,source_trace_policy,safety_boundaries_json,content_hash,created_by_user_id)
     VALUES ($1,1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id`, [created.id, JSON.stringify(d.audience), JSON.stringify(d.objectives), d.difficulty,
      d.durationMinutes, d.lessonSizeMinutes, d.teachingStyle, d.tone, d.language, d.readingLevel,
      JSON.stringify(d.blockMix), JSON.stringify(d.assessment), JSON.stringify(d.completionRule),
      JSON.stringify(d.credential), JSON.stringify(d.expiry), JSON.stringify(d.delivery),
      JSON.stringify(d.accessibility), d.sourceTracePolicy, JSON.stringify(d.safetyBoundaries),
      portableSha256(d), actorUserId])).rows[0];
  return version.id;
}

export async function importRecipeArchive(
  actorUserId: number,
  targetSpaceId: string,
  input: unknown,
  titleOverride?: string
) {
  const archive = parseRecipeArchive(input);
  return tx(async (client) => {
    const report = await analyzeParsedRecipeArchive(client, actorUserId, targetSpaceId, archive, titleOverride);
    if (!report.canImport) {
      throw new PortabilityError(
        report.issues.find((issue) => issue.severity === "error")?.message ?? "Recipe archive cannot be imported",
        409
      );
    }
    const importedRecipe = { ...archive.payload.recipe, title: report.proposedTitle };
    const recipeVersionId = await insertImportedRecipe(client, actorUserId, targetSpaceId, importedRecipe);
    const recipeRow = (await client.query<{ recipe_id: string }>(
      "SELECT recipe_id FROM recipe_versions WHERE id=$1",
      [recipeVersionId]
    )).rows[0];
    const at = new Date().toISOString();
    await client.query(
      `INSERT INTO portable_recipe_imports
        (target_space_id,archive_id,archive_sha256,imported_recipe_id,
         imported_by_user_id,report_json,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        targetSpaceId,
        archive.archiveId,
        archive.integrity.sha256,
        recipeRow.recipe_id,
        actorUserId,
        JSON.stringify(report),
        at,
      ]
    );
    return { recipeId: recipeRow.recipe_id, recipeVersionId, report };
  });
}

export async function importCourseArchive(actorUserId: number, targetSpaceId: string, input: unknown, titleOverride?: string) {
  const archive = parseCourseArchive(input);
  const preflight = await analyzeParsedArchive(pool, actorUserId, targetSpaceId, archive, titleOverride);
  if (!preflight.canImport) {
    throw new PortabilityError(
      preflight.issues.find((issue) => issue.severity === "error")?.message ?? "Archive cannot be imported",
      409
    );
  }
  const importedCover = await validatePortableCover(archive);
  return tx(async (client) => {
    const report = await analyzeParsedArchive(client, actorUserId, targetSpaceId, archive, titleOverride);
    if (!report.canImport) throw new PortabilityError(report.issues.find((issue) => issue.severity === "error")?.message ?? "Archive cannot be imported", 409);
    const at = new Date().toISOString();
    if (importedCover) {
      await insertCoverImage(client, importedCover, at);
    }
    const recipeVersionId = archive.payload.recipe ? await insertImportedRecipe(client, actorUserId, targetSpaceId, archive.payload.recipe) : null;
    const course = (await client.query<{ id: number }>(
      `INSERT INTO courses
        (owner_id,owning_space_id,title,description,source_filename,status,generation_run_id,
         authoring_status,category,appearance_json,cover_image_hash,published)
       VALUES ($1,$2,$3,$4,$5,'ready',$6,'draft',$7,$8,$9,0) RETURNING id`,
      [actorUserId, targetSpaceId, report.proposedTitle, archive.payload.course.description,
       archive.payload.sources[0]?.originalFilename ?? "BookQuest course archive",
       newGenerationRunId(), archive.payload.course.category,
       serializeCourseAppearance(archive.payload.course.appearance), importedCover?.contentHash ?? null])).rows[0];
    const collection = (await client.query<{ id: string }>(
      `INSERT INTO source_collections (owning_space_id,name,current_version,created_by_user_id,created_at,updated_at)
       VALUES ($1,$2,1,$3,$4,$4) RETURNING id`, [targetSpaceId, `${report.proposedTitle} sources`, actorUserId, at])).rows[0];
    const collectionVersion = (await client.query<{ id: string }>(
      `INSERT INTO source_collection_versions (collection_id,version,status,created_by_user_id,created_at)
       VALUES ($1,1,'draft',$2,$3) RETURNING id`, [collection.id, actorUserId, at])).rows[0];
    const sourceVersionIds = new Map<string, string>();
    for (const [position, source] of archive.payload.sources.entries()) {
      const sourceRow = (await client.query<{ id: string }>(
        `INSERT INTO source_assets
          (owning_space_id,created_by_user_id,kind,title,current_version,created_at,updated_at)
         VALUES ($1,$2,$3,$4,1,$5,$5) RETURNING id`, [targetSpaceId, actorUserId, source.kind, source.title, at])).rows[0];
      const contentJson = stableJson(source.content);
      const version = (await client.query<{ id: string }>(
        `INSERT INTO source_versions
          (source_id,version,content_hash,original_filename,mime_type,extracted_content_json,
           extractor_version,provenance_json,created_by_user_id,created_at)
         VALUES ($1,1,$2,$3,$4,$5,'bookquest-course-archive-v1',$6,$7,$8) RETURNING id`,
        [sourceRow.id, source.contentSha256, source.originalFilename, source.mimeType, contentJson,
         JSON.stringify({ ...source.provenance, importedFromArchive: archive.archiveId }), actorUserId, at])).rows[0];
      sourceVersionIds.set(source.portableId, version.id);
      await client.query("INSERT INTO course_source_assets (course_id,source_id,position) VALUES ($1,$2,$3)", [course.id, sourceRow.id, position]);
      await client.query(
        `INSERT INTO source_collection_version_items (collection_version_id,source_version_id,position,usage_policy)
         VALUES ($1,$2,$3,$4)`, [collectionVersion.id, version.id, position, source.usagePolicy]);
    }
    const snapshot = importedContentSnapshot(archive.payload.blocks);
    const courseVersion = (await client.query<{ id: string }>(
      `INSERT INTO course_versions
        (course_id,version_number,lifecycle_status,title,description,source_collection_version_id,
         recipe_version_id,outline_json,content_json,content_hash,appearance_json,
         cover_image_hash,created_by_user_id,created_at,updated_at)
       VALUES ($1,1,'draft',$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
      [course.id, report.proposedTitle, archive.payload.course.description, collectionVersion.id,
       recipeVersionId, JSON.stringify(snapshot), archive.integrity.sha256,
       serializeCourseAppearance(archive.payload.course.appearance), importedCover?.contentHash ?? null,
       actorUserId, at])).rows[0];
    for (const [position, source] of archive.payload.sources.entries()) {
      await client.query(
        `INSERT INTO course_version_sources (course_version_id,source_version_id,position,coverage_json)
         VALUES ($1,$2,$3,$4)`, [courseVersion.id, sourceVersionIds.get(source.portableId), position, JSON.stringify(source.coverage)]);
    }
    for (const block of archive.payload.blocks) {
      const row = (await client.query<{ id: string }>(
        `INSERT INTO course_blocks
          (course_version_id,lineage_id,module_key,module_title,module_summary,lesson_key,lesson_title,
           module_position,lesson_position,position,block_type,current_revision,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,$12) RETURNING id`,
        [courseVersion.id, `import:${archive.integrity.sha256.slice(0, 16)}:${block.lineage}`,
         block.module.key, block.module.title, block.module.summary, block.lesson.key, block.lesson.title,
         block.module.position, block.lesson.position, block.position, block.blockType, at])).rows[0];
      await client.query(
        `INSERT INTO course_block_revisions
          (block_id,revision,content_json,source_refs_json,accessibility_json,provenance_json,
           edit_origin,created_by_user_id,created_at)
         VALUES ($1,1,$2,$3,$4,$5,'imported',$6,$7)`,
        [row.id, JSON.stringify(block.content),
         JSON.stringify(replaceSourceRefs(block.sourceRefs, sourceVersionIds, true)),
         JSON.stringify(block.accessibility), JSON.stringify({ ...block.provenance, importedFromArchive: archive.archiveId }),
         actorUserId, at]);
    }
    await client.query(
      `UPDATE courses SET source_collection_id=$2,current_draft_version_id=$3,source_json=$4 WHERE id=$1`,
      [course.id, collection.id, courseVersion.id, stableJson(archive.payload.sources[0]?.content ?? [])]);
    if (importedCover) {
      await assertCoverStorageCapacity(
        client,
        { ownerId: actorUserId, spaceId: targetSpaceId }
      );
    }
    await client.query(
      `INSERT INTO portable_course_imports
        (target_space_id,archive_id,archive_sha256,imported_course_id,imported_by_user_id,report_json,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [targetSpaceId, archive.archiveId, archive.integrity.sha256, course.id, actorUserId, JSON.stringify(report), at]);
    return { courseId: course.id, courseVersionId: courseVersion.id, report };
  });
}

export function portabilityApiError(error: unknown) {
  if (error instanceof PortabilityError) return { status: error.status, error: error.message };
  if (error instanceof CoverImageError) return { status: error.status, error: error.message };
  return undefined;
}
