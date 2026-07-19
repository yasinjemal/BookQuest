import { one, tx, type Queryable } from "./pg";
import { CoverImageError, type ProcessedCoverImage } from "./cover-processing";
import {
  MAX_COVER_STORAGE_BYTES_PER_OWNER,
  MAX_COVER_STORAGE_BYTES_PER_SPACE,
  type CoverRendition,
} from "./cover-contract";

export {
  CoverImageError,
  processCoverFile,
  processCoverImage,
  validateStoredCoverImage,
  type ProcessedCoverImage,
} from "./cover-processing";

export interface StoredCoverImage {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  byteSize: number;
  contentHash: string;
  updatedAt: string;
  rendition: CoverRendition;
}

type StoredCoverRow = {
  served_data: Buffer;
  mime_type: "image/webp";
  served_width: number;
  served_height: number;
  served_byte_size: number;
  content_hash: string;
  updated_at: string;
};

function storedCover(row: StoredCoverRow, rendition: CoverRendition): StoredCoverImage {
  return {
    data: row.served_data,
    mimeType: row.mime_type,
    width: Number(row.served_width),
    height: Number(row.served_height),
    byteSize: Number(row.served_byte_size),
    contentHash: row.content_hash,
    updatedAt: row.updated_at,
    rendition,
  };
}

const COVER_HASH_LOCK_NAMESPACE = 828183;

/** Serialize attachment and orphan cleanup for content-addressed rows. Callers
 * replacing one hash with another should lock both together so swaps cannot
 * deadlock. Re-locking the same advisory key in a transaction is harmless. */
export async function lockCoverHashes(
  exec: Queryable,
  contentHashes: Array<string | null | undefined>
) {
  const hashes = [...new Set(
    contentHashes.filter((hash): hash is string => Boolean(hash))
  )].sort();
  for (const hash of hashes) {
    await exec.query(
      "SELECT pg_advisory_xact_lock($1, hashtext($2))",
      [COVER_HASH_LOCK_NAMESPACE, hash]
    );
  }
}

export async function insertCoverImage(exec: Queryable, cover: ProcessedCoverImage, at: string) {
  await lockCoverHashes(exec, [cover.contentHash]);
  await exec.query(
    `INSERT INTO cover_images
      (content_hash, image_data, mime_type, width, height, byte_size,
       thumbnail_data, thumbnail_width, thumbnail_height, thumbnail_byte_size,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     ON CONFLICT (content_hash) DO NOTHING`,
    [
      cover.contentHash, cover.data, cover.mimeType, cover.width, cover.height,
      cover.byteSize, cover.thumbnailData, cover.thumbnailWidth,
      cover.thumbnailHeight, cover.thumbnailByteSize, at,
    ]
  );
}

type CoverStorageScope = {
  ownerId: number;
  spaceId: string;
};

/** Bound retained cover bytes, including immutable course-version history.
 * Call this inside the same transaction that creates the new reference. */
export async function assertCoverStorageCapacity(
  exec: Queryable,
  scope: CoverStorageScope
) {
  // Owner then Space is a stable lock order across every write path. It keeps
  // concurrent uploads from racing past either quota.
  await exec.query(
    "SELECT pg_advisory_xact_lock(828180, hashtext($1))",
    [`owner:${scope.ownerId}`]
  );
  await exec.query(
    "SELECT pg_advisory_xact_lock(828180, hashtext($1))",
    [`space:${scope.spaceId}`]
  );

  const ownerUsage = (
    await exec.query<{ bytes: string }>(
      `WITH refs AS (
         SELECT cover_image_hash AS content_hash FROM courses
          WHERE owner_id = $1 AND cover_image_hash IS NOT NULL
         UNION
         SELECT version.cover_image_hash FROM course_versions version
          JOIN courses course ON course.id = version.course_id
          WHERE course.owner_id = $1 AND version.cover_image_hash IS NOT NULL
         UNION
         SELECT cover_image_hash FROM reading_editions
          WHERE owner_id = $1 AND cover_image_hash IS NOT NULL
       )
       SELECT COALESCE(SUM(image.byte_size + image.thumbnail_byte_size), 0)::text AS bytes
         FROM refs LEFT JOIN cover_images image USING (content_hash)`,
      [scope.ownerId]
    )
  ).rows[0];
  const spaceUsage = (
    await exec.query<{ bytes: string }>(
      `WITH refs AS (
         SELECT cover_image_hash AS content_hash FROM courses
          WHERE owning_space_id = $1 AND cover_image_hash IS NOT NULL
         UNION
         SELECT version.cover_image_hash FROM course_versions version
          JOIN courses course ON course.id = version.course_id
          WHERE course.owning_space_id = $1 AND version.cover_image_hash IS NOT NULL
         UNION
         SELECT cover_image_hash FROM reading_editions
          WHERE owning_space_id = $1 AND cover_image_hash IS NOT NULL
       )
       SELECT COALESCE(SUM(image.byte_size + image.thumbnail_byte_size), 0)::text AS bytes
         FROM refs LEFT JOIN cover_images image USING (content_hash)`,
      [scope.spaceId]
    )
  ).rows[0];

  const ownerBytes = Number(ownerUsage?.bytes ?? 0);
  const spaceBytes = Number(spaceUsage?.bytes ?? 0);
  if (ownerBytes > MAX_COVER_STORAGE_BYTES_PER_OWNER) {
    throw new CoverImageError(
      "Your retained cover history has reached its 50 MB safety limit. Reuse an existing cover or contact support before uploading another.",
      422
    );
  }
  if (spaceBytes > MAX_COVER_STORAGE_BYTES_PER_SPACE) {
    throw new CoverImageError(
      "This workspace's retained cover history has reached its 50 MB safety limit. Contact a workspace administrator before uploading another.",
      422
    );
  }
}

export async function deleteCoverIfUnreferenced(exec: Queryable, contentHash: string | null) {
  if (!contentHash) return;
  await lockCoverHashes(exec, [contentHash]);
  await exec.query(
    `DELETE FROM cover_images image
      WHERE image.content_hash = $1
        AND NOT EXISTS (SELECT 1 FROM courses WHERE cover_image_hash = image.content_hash)
        AND NOT EXISTS (SELECT 1 FROM course_versions WHERE cover_image_hash = image.content_hash)
        AND NOT EXISTS (SELECT 1 FROM reading_editions WHERE cover_image_hash = image.content_hash)`,
    [contentHash]
  );
}

export async function getStoredCoverImage(
  contentHash: string,
  rendition: CoverRendition = "full"
) {
  const row = await one<StoredCoverRow>(
    `SELECT CASE WHEN $2 = 'thumbnail' THEN thumbnail_data ELSE image_data END AS served_data,
            mime_type,
            CASE WHEN $2 = 'thumbnail' THEN thumbnail_width ELSE width END AS served_width,
            CASE WHEN $2 = 'thumbnail' THEN thumbnail_height ELSE height END AS served_height,
            CASE WHEN $2 = 'thumbnail' THEN thumbnail_byte_size ELSE byte_size END AS served_byte_size,
            content_hash, updated_at
       FROM cover_images WHERE content_hash = $1`,
    [contentHash, rendition]
  );
  return row ? storedCover(row, rendition) : undefined;
}

export async function getCourseDisplayCoverHash(courseId: number, preferDraft = false) {
  const row = await one<{ cover_image_hash: string | null }>(
    `SELECT CASE
       WHEN $2::boolean AND course.current_draft_version_id IS NOT NULL
         THEN draft.cover_image_hash
       ELSE course.cover_image_hash
     END AS cover_image_hash
     FROM courses course
     LEFT JOIN course_versions draft ON draft.id = course.current_draft_version_id
     WHERE course.id = $1`,
    [courseId, preferDraft]
  );
  return row?.cover_image_hash ?? null;
}

export async function getOwnedReadingEditionCoverImage(
  editionId: number,
  ownerId: number,
  contentHash: string,
  rendition: CoverRendition = "full"
) {
  const row = await one<StoredCoverRow>(
    `SELECT CASE WHEN $4 = 'thumbnail' THEN image.thumbnail_data ELSE image.image_data END AS served_data,
            image.mime_type,
            CASE WHEN $4 = 'thumbnail' THEN image.thumbnail_width ELSE image.width END AS served_width,
            CASE WHEN $4 = 'thumbnail' THEN image.thumbnail_height ELSE image.height END AS served_height,
            CASE WHEN $4 = 'thumbnail' THEN image.thumbnail_byte_size ELSE image.byte_size END AS served_byte_size,
            image.content_hash, image.updated_at
       FROM reading_editions edition
       JOIN cover_images image ON image.content_hash = edition.cover_image_hash
      WHERE edition.id = $1 AND edition.owner_id = $2 AND image.content_hash = $3`,
    [editionId, ownerId, contentHash, rendition]
  );
  return row ? storedCover(row, rendition) : undefined;
}

export async function saveOwnedReadingEditionCover(
  editionId: number,
  ownerId: number,
  cover: ProcessedCoverImage
) {
  return tx(async (client) => {
    const edition = (
      await client.query<{ cover_image_hash: string | null; owning_space_id: string }>(
        "SELECT cover_image_hash, owning_space_id FROM reading_editions WHERE id = $1 AND owner_id = $2 FOR UPDATE",
        [editionId, ownerId]
      )
    ).rows[0];
    if (!edition) return undefined;
    const at = new Date().toISOString();
    await lockCoverHashes(client, [edition.cover_image_hash, cover.contentHash]);
    await insertCoverImage(client, cover, at);
    await client.query(
      "UPDATE reading_editions SET cover_image_hash = $3, updated_at = $4 WHERE id = $1 AND owner_id = $2",
      [editionId, ownerId, cover.contentHash, at]
    );
    await deleteCoverIfUnreferenced(client, edition.cover_image_hash);
    await assertCoverStorageCapacity(client, { ownerId, spaceId: edition.owning_space_id });
    return cover.contentHash;
  });
}

export async function removeOwnedReadingEditionCover(editionId: number, ownerId: number) {
  return tx(async (client) => {
    const edition = (
      await client.query<{ cover_image_hash: string | null }>(
        "SELECT cover_image_hash FROM reading_editions WHERE id = $1 AND owner_id = $2 FOR UPDATE",
        [editionId, ownerId]
      )
    ).rows[0];
    if (!edition) return undefined;
    await client.query(
      "UPDATE reading_editions SET cover_image_hash = NULL, updated_at = $3 WHERE id = $1 AND owner_id = $2",
      [editionId, ownerId, new Date().toISOString()]
    );
    await deleteCoverIfUnreferenced(client, edition.cover_image_hash);
    return edition.cover_image_hash !== null;
  });
}
