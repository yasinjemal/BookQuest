import type { Queryable } from "./pg";

const COURSE_MUTATION_LOCK_NAMESPACE = 828182;

/** Every course-history writer and deleter acquires this transaction lock
 * before row locks. A single global order prevents block/version lock cycles. */
export async function lockCourseMutation(exec: Queryable, courseId: number) {
  await exec.query(
    "SELECT pg_advisory_xact_lock($1, $2)",
    [COURSE_MUTATION_LOCK_NAMESPACE, courseId]
  );
}
