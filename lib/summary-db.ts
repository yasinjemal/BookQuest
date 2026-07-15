import { newGenerationRunId } from "./generation-run";
import { many, one, q, tx } from "./pg";
import { ensurePersonalSpaceForUser } from "./spaces";
import type {
  SummaryDocumentKind,
  SummaryListItem,
  SummaryStatus,
} from "./summary-types";

const nowIso = () => new Date().toISOString();

export interface SummaryRow {
  id: number;
  owner_id: number;
  owning_space_id: string;
  course_id: number | null;
  title: string;
  description: string;
  thesis: string;
  document_kind: SummaryDocumentKind;
  estimated_minutes: number;
  source_filename: string;
  source_json: string | null;
  source_chapter_count: number;
  status: SummaryStatus;
  error: string | null;
  generation_run_id: string;
  generation_heartbeat: string | null;
  generation_attempts: number;
  generator_model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface SummarySectionRow {
  id: number;
  summary_id: number;
  title: string;
  hook: string;
  position: number;
  chapter_indexes: string;
  content_json: string | null;
  status: "pending" | "generating" | "ready" | "error";
  attempts: number;
  error: string | null;
  generation_run_id: string;
  generator_model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
}

export class StaleSummaryGenerationError extends Error {
  constructor() {
    super("Summary generation run is no longer active");
    this.name = "StaleSummaryGenerationError";
  }
}

export async function createSummary(
  ownerId: number,
  sourceFilename: string,
  courseId?: number | null
): Promise<{ id: number; generationRunId: string }> {
  return tx(async (client) => {
    const user = (
      await client.query<{ name: string }>("SELECT name FROM users WHERE id = $1", [
        ownerId,
      ])
    ).rows[0];
    if (!user) throw new Error("Summary owner not found");
    const personal = await ensurePersonalSpaceForUser(ownerId, user.name, client);
    const generationRunId = newGenerationRunId();
    const row = (
      await client.query<{ id: number }>(
        `INSERT INTO summaries
          (owner_id, owning_space_id, course_id, title, source_filename,
           generation_run_id)
         VALUES ($1, $2, $3, $4, $4, $5)
         RETURNING id`,
        [ownerId, personal.space.id, courseId ?? null, sourceFilename, generationRunId]
      )
    ).rows[0];
    return { id: Number(row.id), generationRunId };
  });
}

export async function setSummarySource(
  summaryId: number,
  sourceJson: string,
  sourceChapterCount: number,
  generationRunId?: string
) {
  const result = await q(
    `UPDATE summaries
     SET source_json = $1, source_chapter_count = $2, updated_at = $3
     WHERE id = $4 AND ($5::text IS NULL OR generation_run_id = $5)`,
    [sourceJson, sourceChapterCount, nowIso(), summaryId, generationRunId ?? null]
  );
  if (generationRunId && result.rowCount !== 1) {
    throw new StaleSummaryGenerationError();
  }
}

export async function getSummary(summaryId: number): Promise<SummaryRow | undefined> {
  return (await one<SummaryRow>("SELECT * FROM summaries WHERE id = $1", [summaryId]));
}

export async function getOwnedSummary(
  summaryId: number,
  ownerId: number
): Promise<SummaryRow | undefined> {
  return await one<SummaryRow>(
    "SELECT * FROM summaries WHERE id = $1 AND owner_id = $2",
    [summaryId, ownerId]
  );
}

export async function listOwnedSummaries(ownerId: number): Promise<SummaryListItem[]> {
  const rows = await many<SummaryListItem>(
    `SELECT summary.id, summary.title, summary.description,
       summary.source_filename, summary.status, summary.error,
       summary.document_kind, summary.estimated_minutes,
       summary.source_chapter_count, summary.course_id, summary.created_at,
       COUNT(section.id)::int AS section_count,
       COUNT(section.id) FILTER (WHERE section.status = 'ready')::int AS ready_section_count
     FROM summaries summary
     LEFT JOIN summary_sections section ON section.summary_id = summary.id
       AND section.generation_run_id = summary.generation_run_id
     WHERE summary.owner_id = $1
     GROUP BY summary.id
     ORDER BY summary.created_at DESC`,
    [ownerId]
  );
  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    course_id: row.course_id === null ? null : Number(row.course_id),
    estimated_minutes: Number(row.estimated_minutes),
    section_count: Number(row.section_count),
    ready_section_count: Number(row.ready_section_count),
    source_chapter_count: Number(row.source_chapter_count),
  }));
}

export async function deleteSummary(summaryId: number, ownerId: number) {
  await q("DELETE FROM summaries WHERE id = $1 AND owner_id = $2", [summaryId, ownerId]);
}

export async function prepareSummaryRetry(
  summaryId: number,
  ownerId: number
): Promise<string | undefined> {
  return tx(async (client) => {
    const summary = (
      await client.query<{ generation_run_id: string }>(
        `SELECT generation_run_id FROM summaries
         WHERE id = $1 AND owner_id = $2 AND status = 'error'
           AND source_json IS NOT NULL
         FOR UPDATE`,
        [summaryId, ownerId]
      )
    ).rows[0];
    if (!summary) return undefined;

    const sectionCount = Number(
      (
        await client.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM summary_sections
           WHERE summary_id = $1 AND generation_run_id = $2`,
          [summaryId, summary.generation_run_id]
        )
      ).rows[0]?.n ?? 0
    );
    await client.query(
      `UPDATE summaries
       SET status = $3, error = NULL, generation_heartbeat = NULL,
           generation_attempts = 0, updated_at = $4
       WHERE id = $1 AND owner_id = $2 AND status = 'error'`,
      [summaryId, ownerId, sectionCount > 0 ? "generating" : "outlining", nowIso()]
    );
    // Preserve every completed section. Only unfinished work is reset, so a
    // transient provider outage never destroys a readable partial summary.
    await client.query(
      `UPDATE summary_sections
       SET status = 'pending', attempts = 0, error = NULL, content_json = NULL,
           generator_model = NULL, prompt_version = NULL, updated_at = $3
       WHERE summary_id = $1 AND generation_run_id = $2 AND status <> 'ready'`,
      [summaryId, summary.generation_run_id, nowIso()]
    );
    return summary.generation_run_id;
  });
}

export async function setSummaryStatus(
  summaryId: number,
  status: SummaryStatus,
  error?: string,
  generationRunId?: string
) {
  const result = await q(
    `UPDATE summaries SET status = $1, error = $2, updated_at = $3
     WHERE id = $4 AND ($5::text IS NULL OR generation_run_id = $5)`,
    [status, error ?? null, nowIso(), summaryId, generationRunId ?? null]
  );
  if (generationRunId && result.rowCount !== 1) {
    throw new StaleSummaryGenerationError();
  }
}

export async function setSummaryMeta(
  summaryId: number,
  meta: {
    title: string;
    description: string;
    thesis: string;
    documentKind: SummaryDocumentKind;
    estimatedMinutes: number;
  },
  generationRunId?: string
) {
  const result = await q(
    `UPDATE summaries
     SET title = $1, description = $2, thesis = $3, document_kind = $4,
         estimated_minutes = $5, updated_at = $6
     WHERE id = $7 AND ($8::text IS NULL OR generation_run_id = $8)`,
    [
      meta.title,
      meta.description,
      meta.thesis,
      meta.documentKind,
      meta.estimatedMinutes,
      nowIso(),
      summaryId,
      generationRunId ?? null,
    ]
  );
  if (generationRunId && result.rowCount !== 1) {
    throw new StaleSummaryGenerationError();
  }
}

export async function commitSummaryOutline(
  summaryId: number,
  meta: {
    title: string;
    description: string;
    thesis: string;
    documentKind: SummaryDocumentKind;
    estimatedMinutes: number;
  },
  sections: Array<{
    title: string;
    hook: string;
    chapterIndexes: number[];
  }>,
  provenance: {
    generatorModel: string;
    promptVersion: string;
    generationRunId: string;
  }
) {
  await tx(async (client) => {
    const updated = await client.query(
      `UPDATE summaries
       SET title = $1, description = $2, thesis = $3, document_kind = $4,
           estimated_minutes = $5, status = 'generating', error = NULL,
           generator_model = $6, prompt_version = $7, updated_at = $8
       WHERE id = $9 AND generation_run_id = $10`,
      [
        meta.title,
        meta.description,
        meta.thesis,
        meta.documentKind,
        meta.estimatedMinutes,
        provenance.generatorModel,
        provenance.promptVersion,
        nowIso(),
        summaryId,
        provenance.generationRunId,
      ]
    );
    if (updated.rowCount !== 1) throw new StaleSummaryGenerationError();

    for (let position = 0; position < sections.length; position += 1) {
      const section = sections[position];
      await client.query(
        `INSERT INTO summary_sections
          (summary_id, title, hook, position, chapter_indexes, generation_run_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          summaryId,
          section.title,
          section.hook,
          position,
          JSON.stringify(section.chapterIndexes),
          provenance.generationRunId,
        ]
      );
    }
  });
}

export interface GenerationSummary {
  id: number;
  status: SummaryStatus;
  source_json: string | null;
  generation_run_id: string;
}

export async function getGenerationSummary(
  summaryId: number
): Promise<GenerationSummary | undefined> {
  return await one<GenerationSummary>(
    `SELECT id, status, source_json, generation_run_id
     FROM summaries WHERE id = $1`,
    [summaryId]
  );
}

export async function touchSummaryGenerationHeartbeat(
  summaryId: number,
  generationRunId: string
) {
  const result = await q(
    `UPDATE summaries SET generation_heartbeat = $1, updated_at = $1
     WHERE id = $2 AND generation_run_id = $3`,
    [nowIso(), summaryId, generationRunId]
  );
  if (result.rowCount !== 1) throw new StaleSummaryGenerationError();
}

export async function bumpSummaryGenerationAttempts(
  summaryId: number,
  generationRunId: string
): Promise<number> {
  const row = await one<{ generation_attempts: number }>(
    `UPDATE summaries SET generation_attempts = generation_attempts + 1,
       updated_at = $1
     WHERE id = $2 AND generation_run_id = $3
     RETURNING generation_attempts`,
    [nowIso(), summaryId, generationRunId]
  );
  if (!row) throw new StaleSummaryGenerationError();
  return Number(row.generation_attempts);
}

export async function countSummarySections(
  summaryId: number,
  generationRunId?: string
): Promise<number> {
  const row = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM summary_sections
     WHERE summary_id = $1 AND ($2::text IS NULL OR generation_run_id = $2)`,
    [summaryId, generationRunId ?? null]
  );
  return Number(row?.n ?? 0);
}

export async function countUnfinishedSummarySections(
  summaryId: number,
  generationRunId?: string
): Promise<number> {
  const row = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM summary_sections
     WHERE summary_id = $1 AND status IN ('pending','generating')
       AND ($2::text IS NULL OR generation_run_id = $2)`,
    [summaryId, generationRunId ?? null]
  );
  return Number(row?.n ?? 0);
}

export async function countFailedSummarySections(
  summaryId: number,
  generationRunId?: string
): Promise<number> {
  const row = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM summary_sections
     WHERE summary_id = $1 AND status = 'error'
       AND ($2::text IS NULL OR generation_run_id = $2)`,
    [summaryId, generationRunId ?? null]
  );
  return Number(row?.n ?? 0);
}

export async function createSummarySection(
  summaryId: number,
  title: string,
  hook: string,
  position: number,
  chapterIndexes: number[],
  generationRunId: string
): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO summary_sections
      (summary_id, title, hook, position, chapter_indexes, generation_run_id)
     SELECT id, $2, $3, $4, $5, $6 FROM summaries
     WHERE id = $1 AND generation_run_id = $6
     RETURNING id`,
    [summaryId, title, hook, position, JSON.stringify(chapterIndexes), generationRunId]
  );
  if (!row) throw new StaleSummaryGenerationError();
  return Number(row.id);
}

export interface ClaimedSummarySection {
  id: number;
  title: string;
  hook: string;
  chapter_indexes: number[];
  attempts: number;
}

export async function claimNextSummarySection(
  summaryId: number,
  maxAttempts: number,
  generationRunId: string
): Promise<ClaimedSummarySection | undefined> {
  const row = await one<{
    id: number;
    title: string;
    hook: string;
    chapter_indexes: string;
    attempts: number;
  }>(
    `WITH next AS (
       SELECT id FROM summary_sections
       WHERE summary_id = $1 AND status = 'pending' AND attempts < $2
         AND generation_run_id = $3
         AND EXISTS (
           SELECT 1 FROM summaries s
           WHERE s.id = $1 AND s.generation_run_id = $3
         )
       ORDER BY position
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE summary_sections section
     SET status = 'generating', attempts = section.attempts + 1,
         updated_at = $4
     FROM next WHERE section.id = next.id
     RETURNING section.id, section.title, section.hook,
       section.chapter_indexes, section.attempts`,
    [summaryId, maxAttempts, generationRunId, nowIso()]
  );
  if (!row) return undefined;
  return {
    id: Number(row.id),
    title: row.title,
    hook: row.hook,
    chapter_indexes: JSON.parse(row.chapter_indexes) as number[],
    attempts: Number(row.attempts),
  };
}

export async function setSummarySectionContent(
  sectionId: number,
  contentJson: string,
  provenance: {
    generatorModel?: string;
    promptVersion?: string;
    generationRunId: string;
  }
) {
  const result = await q(
    `UPDATE summary_sections section
     SET content_json = $1, generator_model = $2, prompt_version = $3,
          status = 'ready', error = NULL, updated_at = $4
     WHERE section.id = $5 AND section.generation_run_id = $6
       AND EXISTS (
         SELECT 1 FROM summaries summary
         WHERE summary.id = section.summary_id
           AND summary.generation_run_id = $6
       )`,
    [
      contentJson,
      provenance.generatorModel ?? null,
      provenance.promptVersion ?? null,
      nowIso(),
      sectionId,
      provenance.generationRunId,
    ]
  );
  if (result.rowCount !== 1) throw new StaleSummaryGenerationError();
}

export async function setSummarySectionStatus(
  sectionId: number,
  status: SummarySectionRow["status"],
  generationRunId: string,
  error?: string
) {
  const result = await q(
    `UPDATE summary_sections section SET status = $1, error = $2, updated_at = $3
     WHERE section.id = $4 AND section.generation_run_id = $5
       AND EXISTS (
         SELECT 1 FROM summaries summary
         WHERE summary.id = section.summary_id
           AND summary.generation_run_id = $5
       )`,
    [status, error ?? null, nowIso(), sectionId, generationRunId]
  );
  if (result.rowCount !== 1) throw new StaleSummaryGenerationError();
}

export async function recoverStuckSummarySections(
  summaryId: number,
  maxAttempts: number,
  generationRunId: string
) {
  const active = await getGenerationSummary(summaryId);
  if (!active || active.generation_run_id !== generationRunId) {
    throw new StaleSummaryGenerationError();
  }
  await q(
    `UPDATE summary_sections SET status = 'error',
       error = COALESCE(error, 'Section generation exhausted its retry limit'),
       updated_at = $1
     WHERE summary_id = $2 AND status = 'generating' AND attempts >= $3
       AND generation_run_id = $4`,
    [nowIso(), summaryId, maxAttempts, generationRunId]
  );
  await q(
    `UPDATE summary_sections SET status = 'pending', error = NULL, updated_at = $1
     WHERE summary_id = $2 AND status = 'generating' AND attempts < $3
       AND generation_run_id = $4`,
    [nowIso(), summaryId, maxAttempts, generationRunId]
  );
}

export async function getSummarySections(summaryId: number): Promise<SummarySectionRow[]> {
  return await many<SummarySectionRow>(
    `SELECT section.* FROM summary_sections section
     JOIN summaries summary ON summary.id = section.summary_id
     WHERE section.summary_id = $1
       AND section.generation_run_id = summary.generation_run_id
     ORDER BY section.position`,
    [summaryId]
  );
}

export async function claimStalledSummaries(
  ownerId: number,
  staleBeforeIso: string,
  claimedAtIso: string
): Promise<{ id: number; generation_run_id: string }[]> {
  return await many<{ id: number; generation_run_id: string }>(
    `WITH stalled AS (
       SELECT id FROM summaries
        WHERE owner_id = $1 AND status IN ('extracting','outlining','generating')
         AND (generation_heartbeat IS NULL OR generation_heartbeat < $2)
       FOR UPDATE SKIP LOCKED
     )
     UPDATE summaries summary SET generation_heartbeat = $3, updated_at = $3
     FROM stalled WHERE summary.id = stalled.id
     RETURNING summary.id, summary.generation_run_id`,
    [ownerId, staleBeforeIso, claimedAtIso]
  );
}

export async function claimStalledSummary(
  summaryId: number,
  ownerId: number,
  staleBeforeIso: string,
  claimedAtIso: string
): Promise<{ id: number; generation_run_id: string } | undefined> {
  return await one<{ id: number; generation_run_id: string }>(
    `WITH stalled AS (
       SELECT id FROM summaries
       WHERE id = $1 AND owner_id = $2
         AND status IN ('extracting','outlining','generating')
         AND (generation_heartbeat IS NULL OR generation_heartbeat < $3)
       FOR UPDATE SKIP LOCKED
     )
     UPDATE summaries summary SET generation_heartbeat = $4, updated_at = $4
     FROM stalled WHERE summary.id = stalled.id
     RETURNING summary.id, summary.generation_run_id`,
    [summaryId, ownerId, staleBeforeIso, claimedAtIso]
  );
}
