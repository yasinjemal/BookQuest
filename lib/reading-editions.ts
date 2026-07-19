import type { Chapter } from "./extract";
import { many, one, q, tx } from "./pg";
import {
  cleanBookTitle,
  deriveReadingEditionProfile,
  parseReadingEditionProfile,
} from "./reading-vibe";
import type {
  ReadingEditionListItem,
  ReadingEditionMetadata,
  ReadingProgress,
  ReadingSearchResult,
  ReadingUnit,
  ReadingUnitOutline,
  ReadingUnitKind,
  ReadingVibeId,
} from "./reading-types";
import { ensurePersonalSpaceForUser } from "./spaces";

interface ReadingEditionRow {
  id: number;
  owner_id: number;
  owning_space_id: string;
  title: string;
  source_filename: string;
  chapter_outline_json: string;
  source_chapter_count: number;
  word_count: number;
  estimated_minutes: number;
  unit_kind: ReadingUnitKind;
  vibe_id: ReadingVibeId;
  profile_json: string;
  created_at: string;
  updated_at: string;
  progress_unit_index: number | null;
  progress_unit: number | null;
  progress_overall: number | null;
  progress_updated_at: string | null;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

function outlineFrom(value: string): ReadingUnitOutline[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, fallbackIndex) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<ReadingUnitOutline>;
      if (typeof candidate.title !== "string") return [];
      return [{
        index: Number.isInteger(candidate.index) ? Number(candidate.index) : fallbackIndex,
        title: candidate.title,
        wordCount: Math.max(0, Number(candidate.wordCount) || 0),
      }];
    });
  } catch {
    return [];
  }
}

function progressFrom(row: ReadingEditionRow): ReadingProgress | null {
  if (row.progress_updated_at === null || row.progress_unit_index === null) return null;
  return {
    unitIndex: Number(row.progress_unit_index),
    unitProgress: clampPercent(Number(row.progress_unit) || 0),
    overallProgress: clampPercent(Number(row.progress_overall) || 0),
    updatedAt: row.progress_updated_at,
  };
}

function listItem(row: ReadingEditionRow): ReadingEditionListItem {
  return {
    id: Number(row.id),
    title: row.title,
    sourceFilename: row.source_filename,
    sourceChapterCount: Number(row.source_chapter_count),
    wordCount: Number(row.word_count),
    estimatedMinutes: Number(row.estimated_minutes),
    unitKind: row.unit_kind,
    vibeId: row.vibe_id,
    createdAt: row.created_at,
    progress: progressFrom(row),
  };
}

const READING_SELECT = `
  SELECT edition.id, edition.owner_id, edition.owning_space_id, edition.title,
    edition.source_filename, edition.chapter_outline_json,
    edition.source_chapter_count, edition.word_count, edition.estimated_minutes,
    edition.unit_kind, edition.vibe_id, edition.profile_json,
    edition.created_at, edition.updated_at,
    progress.unit_index AS progress_unit_index,
    progress.unit_progress::float8 AS progress_unit,
    progress.overall_progress::float8 AS progress_overall,
    progress.updated_at AS progress_updated_at
  FROM reading_editions edition
  LEFT JOIN reading_progress progress
    ON progress.edition_id = edition.id AND progress.user_id = edition.owner_id`;

export async function createReadingEdition(
  ownerId: number,
  sourceFilename: string,
  chapters: readonly Chapter[]
): Promise<{ id: number }> {
  const profile = deriveReadingEditionProfile(sourceFilename, chapters);
  const outline: ReadingUnitOutline[] = chapters.map((chapter, index) => ({
    index,
    title: chapter.title,
    wordCount: chapter.text.trim().match(/\S+/gu)?.length ?? 0,
  }));
  return tx(async (client) => {
    const user = (
      await client.query<{ name: string }>("SELECT name FROM users WHERE id = $1", [ownerId])
    ).rows[0];
    if (!user) throw new Error("Reading Edition owner not found");
    const personal = await ensurePersonalSpaceForUser(ownerId, user.name, client);
    const row = (
      await client.query<{ id: number }>(
        `INSERT INTO reading_editions
          (owner_id, owning_space_id, title, source_filename,
           chapter_outline_json, source_chapter_count, word_count,
           estimated_minutes, unit_kind, vibe_id, profile_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          ownerId,
          personal.space.id,
          cleanBookTitle(sourceFilename),
          sourceFilename,
          JSON.stringify(outline),
          chapters.length,
          profile.wordCount,
          profile.estimatedMinutes,
          profile.unitKind,
          profile.vibeId,
          JSON.stringify(profile),
        ]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO reading_edition_units
        (edition_id, position, title, source_text, word_count)
       SELECT $1, unit.position, unit.title, unit.source_text, unit.word_count
       FROM unnest($2::int[], $3::text[], $4::text[], $5::int[])
         AS unit(position, title, source_text, word_count)`,
      [
        Number(row.id),
        outline.map((item) => item.index),
        chapters.map((chapter) => chapter.title),
        chapters.map((chapter) => chapter.text),
        outline.map((item) => item.wordCount),
      ]
    );
    return { id: Number(row.id) };
  });
}

export async function listOwnedReadingEditions(ownerId: number): Promise<ReadingEditionListItem[]> {
  const rows = await many<ReadingEditionRow>(
    `${READING_SELECT} WHERE edition.owner_id = $1 ORDER BY edition.created_at DESC`,
    [ownerId]
  );
  return rows.map(listItem);
}

export async function getOwnedReadingEditionMetadata(
  editionId: number,
  ownerId: number
): Promise<ReadingEditionMetadata | undefined> {
  const row = await one<ReadingEditionRow>(
    `${READING_SELECT} WHERE edition.id = $1 AND edition.owner_id = $2`,
    [editionId, ownerId]
  );
  if (!row) return undefined;
  return {
    ...listItem(row),
    outline: outlineFrom(row.chapter_outline_json),
    profile: parseReadingEditionProfile(row.profile_json),
  };
}

export async function getOwnedReadingUnit(
  editionId: number,
  ownerId: number,
  index: number
): Promise<ReadingUnit | undefined> {
  const row = await one<{
    position: number;
    title: string;
    source_text: string;
    word_count: number;
    previous_title: string | null;
    next_title: string | null;
  }>(
    `SELECT unit.position, unit.title, unit.source_text, unit.word_count,
       previous.title AS previous_title, next.title AS next_title
     FROM reading_editions edition
     JOIN reading_edition_units unit
       ON unit.edition_id = edition.id AND unit.position = $3
     LEFT JOIN reading_edition_units previous
       ON previous.edition_id = edition.id AND previous.position = unit.position - 1
     LEFT JOIN reading_edition_units next
       ON next.edition_id = edition.id AND next.position = unit.position + 1
     WHERE edition.id = $1 AND edition.owner_id = $2`,
    [editionId, ownerId, index]
  );
  if (!row) return undefined;
  return {
    index,
    title: row.title,
    text: row.source_text,
    wordCount: Number(row.word_count),
    previousTitle: row.previous_title,
    nextTitle: row.next_title,
  };
}

function searchSnippet(text: string, query: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (match < 0) return normalized.slice(0, 180);
  const start = Math.max(0, match - 70);
  const end = Math.min(normalized.length, match + query.length + 110);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

export async function searchOwnedReadingEdition(
  editionId: number,
  ownerId: number,
  query: string
): Promise<ReadingSearchResult[] | undefined> {
  const needle = query.trim().slice(0, 100).toLowerCase();
  if (needle.length < 2) return [];
  const likeNeedle = needle.replace(/[\\%_]/g, (character) => `\\${character}`);
  const owned = await one<{ id: number }>(
    "SELECT id FROM reading_editions WHERE id = $1 AND owner_id = $2",
    [editionId, ownerId]
  );
  if (!owned) return undefined;
  const matches = await many<{ position: number; title: string; source_text: string }>(
    `SELECT position, title, source_text
       FROM reading_edition_units
      WHERE edition_id = $1
        AND (lower(title) LIKE '%' || $2 || '%' ESCAPE '\\'
          OR lower(source_text) LIKE '%' || $2 || '%' ESCAPE '\\')
      ORDER BY position
      LIMIT 24`,
    [editionId, likeNeedle]
  );
  return matches.map((match) => ({
    index: Number(match.position),
    title: match.title,
    snippet: searchSnippet(match.source_text, needle),
  }));
}

export async function saveReadingProgress(args: {
  editionId: number;
  userId: number;
  unitIndex: number;
  unitProgress: number;
  overallProgress: number;
}): Promise<ReadingProgress | undefined> {
  const updatedAt = new Date().toISOString();
  const row = await one<{
    unit_index: number;
    unit_progress: number;
    overall_progress: number;
    updated_at: string;
  }>(
    `INSERT INTO reading_progress
       (edition_id, user_id, unit_index, unit_progress, overall_progress, updated_at)
     SELECT edition.id, $2, $3, $4, $5, $6
       FROM reading_editions edition
      WHERE edition.id = $1 AND edition.owner_id = $2
        AND edition.source_chapter_count > $3
     ON CONFLICT (edition_id, user_id) DO UPDATE SET
       unit_index = EXCLUDED.unit_index,
       unit_progress = EXCLUDED.unit_progress,
       overall_progress = EXCLUDED.overall_progress,
       updated_at = EXCLUDED.updated_at
     RETURNING unit_index, unit_progress::float8 AS unit_progress,
       overall_progress::float8 AS overall_progress, updated_at`,
    [
      args.editionId,
      args.userId,
      args.unitIndex,
      clampPercent(args.unitProgress),
      clampPercent(args.overallProgress),
      updatedAt,
    ]
  );
  if (!row) return undefined;
  return {
    unitIndex: Number(row.unit_index),
    unitProgress: clampPercent(Number(row.unit_progress)),
    overallProgress: clampPercent(Number(row.overall_progress)),
    updatedAt: row.updated_at,
  };
}

export async function deleteReadingEdition(editionId: number, ownerId: number) {
  const result = await q(
    "DELETE FROM reading_editions WHERE id = $1 AND owner_id = $2",
    [editionId, ownerId]
  );
  return result.rowCount === 1;
}
