import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { applyPendingMigrations } from "./migrations";

/**
 * Postgres connection layer (Neon).
 *
 * Vercel's serverless filesystem is read-only, so the app cannot use SQLite in
 * production. Every request runs in a short-lived worker, so we keep a single
 * small pool per worker and let Neon's PgBouncer pooler (the `-pooler` host in
 * DATABASE_URL) fan the connections out.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Point it at your Neon Postgres connection string " +
      "(the -pooler host, sslmode=require)."
  );
}

const globalForPg = globalThis as unknown as { __pgPool?: Pool };

export const pool =
  globalForPg.__pgPool ??
  (globalForPg.__pgPool = new Pool({
    connectionString,
    // Serverless workers are short-lived; a few connections each is plenty and
    // stays well under Neon's pooled connection ceiling.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  }));

/** Anything we can run a query against: the pool or a checked-out client. */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

// Pending migrations are applied lazily on first use and only once per worker.
// Concurrent cold starts are serialized by an advisory lock so exactly one worker
// applies each pending migration while the others wait and then see it recorded.
let schemaReady: Promise<void> | undefined;
export function ready(): Promise<void> {
  return (schemaReady ??= ensureSchema());
}

/** Run a parameterized query, ensuring the schema exists first. */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  exec: Queryable = pool
): Promise<QueryResult<T>> {
  await ready();
  return exec.query<T>(text, params);
}

/** Convenience: first row or undefined. */
export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  exec: Queryable = pool
): Promise<T | undefined> {
  return (await q<T>(text, params, exec)).rows[0];
}

/** Convenience: all rows. */
export async function many<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  exec: Queryable = pool
): Promise<T[]> {
  return (await q<T>(text, params, exec)).rows;
}

/** Run `fn` inside a single transaction, committing on success. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* the connection is being discarded anyway */
    }
    throw err;
  } finally {
    client.release();
  }
}

// Namespace for per-course generation locks (keeps them distinct from any other
// advisory lock the app might take). Paired with the course id as the lock key.
const GENERATION_LOCK_NAMESPACE = 828170;
const LESSON_COMPLETION_LOCK_NAMESPACE = 828171;

/**
 * Run `fn` while holding an exclusive advisory lock for one course, so only one
 * generation chain works on a course at a time. Returns `fn`'s result, or
 * `undefined` if another worker already holds the lock (nothing was run). The
 * lock is session-scoped and auto-released if the worker dies mid-generation.
 */
export async function withCourseGenerationLock<T>(
  courseId: number,
  fn: () => Promise<T>
): Promise<T | undefined> {
  await ready();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock($1, $2) AS ok",
      [GENERATION_LOCK_NAMESPACE, courseId]
    );
    if (!rows[0].ok) return undefined;
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [
        GENERATION_LOCK_NAMESPACE,
        courseId,
      ]);
    }
  } finally {
    client.release();
  }
}

/** Serialize the complete evidence -> progress -> credential workflow for one
 * lesson answer session. The route performs several idempotent writes, but they
 * must be observed as one ordered workflow so two simultaneous HTTP retries
 * cannot both pass the completion guard before either records it. */
export async function withLessonCompletionLock<T>(
  answerSessionId: string,
  fn: () => Promise<T>
): Promise<T> {
  await ready();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1, hashtext($2))", [
      LESSON_COMPLETION_LOCK_NAMESPACE,
      answerSessionId,
    ]);
    try {
      return await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, hashtext($2))", [
        LESSON_COMPLETION_LOCK_NAMESPACE,
        answerSessionId,
      ]);
    }
  } finally {
    client.release();
  }
}

// A stable 64-bit key so every worker takes the same advisory lock during init.
const SCHEMA_LOCK_KEY = 4927310572841100n;

/**
 * Apply pending migrations once per worker.
 *
 * A session-scoped advisory lock serializes concurrent cold-start workers: the
 * first applies the pending migrations while the rest wait, then find them
 * already recorded and skip them. Session-scoped (not transaction-scoped) because
 * the lock is held across one transaction per migration.
 */
async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK_KEY]);
    try {
      await applyPendingMigrations(client);
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK_KEY]);
      } catch {
        /* a broken/ended session releases the advisory lock on its own */
      }
    }
  } catch (err) {
    // Let the next caller retry rather than caching a broken init.
    schemaReady = undefined;
    throw err;
  } finally {
    client.release();
  }
}
