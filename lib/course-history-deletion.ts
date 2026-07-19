import type { Queryable } from "./pg";

export type CourseHistoryDeletionMode = "all" | "unpublished";

/** Remove append-only children while their parent rows still exist, allowing
 * migration 28's exact-course guard to verify every delete. Parent/version
 * deletion follows in the same transaction; calling this helper alone is not a
 * complete course deletion operation. */
export async function deleteControlledCourseVersionChildren(
  exec: Queryable,
  courseId: number,
  mode: CourseHistoryDeletionMode
) {
  const unpublishedOnly = mode === "unpublished";
  // These row locks conflict with the FK key-share locks taken by concurrent
  // review/block/revision inserts. Once the leaf deletes start, no new guarded
  // child can appear and surprise the later parent cascade.
  await exec.query(
    `SELECT version.id FROM course_versions version
      WHERE version.course_id = $1
        AND (NOT $2::boolean OR (
          version.published_at IS NULL AND
          version.lifecycle_status NOT IN ('published','superseded')
        ))
      ORDER BY version.id FOR UPDATE OF version`,
    [courseId, unpublishedOnly]
  );
  await exec.query(
    `SELECT block.id FROM course_blocks block
      JOIN course_versions version ON version.id = block.course_version_id
      WHERE version.course_id = $1
        AND (NOT $2::boolean OR (
          version.published_at IS NULL AND
          version.lifecycle_status NOT IN ('published','superseded')
        ))
      ORDER BY block.id FOR UPDATE OF block`,
    [courseId, unpublishedOnly]
  );
  await exec.query(
    `DELETE FROM course_block_revisions revision
      USING course_blocks block, course_versions version
      WHERE revision.block_id = block.id
        AND block.course_version_id = version.id
        AND version.course_id = $1
        AND (NOT $2::boolean OR (
          version.published_at IS NULL AND
          version.lifecycle_status NOT IN ('published','superseded')
        ))`,
    [courseId, unpublishedOnly]
  );
  await exec.query(
    `DELETE FROM course_version_reviews review
      USING course_versions version
      WHERE review.course_version_id = version.id
        AND version.course_id = $1
        AND (NOT $2::boolean OR (
          version.published_at IS NULL AND
          version.lifecycle_status NOT IN ('published','superseded')
        ))`,
    [courseId, unpublishedOnly]
  );
}
