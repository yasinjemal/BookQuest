// Print privacy-safe aggregate reliability measurements for a deployed database.
// Run after migrations and before/after each phase release; redirect the JSON to
// an approved operational evidence store if a dated record is required.
// Usage: node scripts/reliability-baseline.mjs
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { createJiti } from "jiti";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.local - rely on the real environment */
}

const jiti = createJiti(import.meta.url);
const { learningLedgerHealth } = await jiti.import(
  pathToFileURL(resolve(process.cwd(), "lib/db.ts")).href
);
const { operationalHealth, deliveryHealth } = await jiti.import(
  pathToFileURL(resolve(process.cwd(), "lib/observability.ts")).href
);
const { reconcileConceptMastery } = await jiti.import(
  pathToFileURL(resolve(process.cwd(), "lib/projection.ts")).href
);
const { one, pool, ready } = await jiti.import(
  pathToFileURL(resolve(process.cwd(), "lib/pg.ts")).href
);

try {
  await ready();
  const [
    ledger,
    operations,
    delivery,
    reconciliation,
    generation,
    outbox,
    errorGroups,
  ] =
    await Promise.all([
      learningLedgerHealth(),
      operationalHealth(),
      deliveryHealth(),
      reconcileConceptMastery(),
      one(`
        SELECT
          COUNT(*)::int AS courses,
          COUNT(*) FILTER (WHERE status = 'ready')::int AS ready,
          COUNT(*) FILTER (WHERE status = 'error')::int AS failed,
          COUNT(*) FILTER (WHERE status NOT IN ('ready', 'error'))::int AS active,
          COUNT(*) FILTER (
            WHERE status NOT IN ('ready', 'error')
              AND (
                generation_heartbeat IS NULL OR
                generation_heartbeat::timestamptz < now() - interval '3 minutes'
              )
          )::int AS stalled,
          MIN(generation_heartbeat) FILTER (
            WHERE status NOT IN ('ready', 'error')
          ) AS oldest_active_heartbeat
        FROM courses
      `),
      one(`
        SELECT
          COUNT(*)::int AS reports,
          MAX(COALESCE((metadata_json::jsonb ->> 'oldest_queue_seconds')::int, 0))::int
            AS oldest_queue_seconds,
          SUM(COALESCE((metadata_json::jsonb ->> 'attempted')::int, 0))::int AS attempted,
          SUM(COALESCE((metadata_json::jsonb ->> 'drained')::int, 0))::int AS drained,
          MAX(
            COALESCE((metadata_json::jsonb ->> 'answer_queue_depth')::int, 0) +
            COALESCE((metadata_json::jsonb ->> 'completion_queue_depth')::int, 0)
          )::int AS max_queue_depth
        FROM operational_events
        WHERE event_type = 'learning.outbox_health'
          AND occurred_at::timestamptz >= now() - interval '1 day'
      `),
      one(`
        SELECT COALESCE(json_agg(grouped), '[]'::json) AS groups
        FROM (
          SELECT event_type, area,
            metadata_json::jsonb ->> 'error_name' AS error_name,
            metadata_json::jsonb ->> 'error_code' AS error_code,
            metadata_json::jsonb ->> 'error_fingerprint' AS error_fingerprint,
            COUNT(*)::int AS events,
            MAX(occurred_at::timestamptz) AS last_seen
          FROM operational_events
          WHERE severity = 'error'
            AND occurred_at::timestamptz >= now() - interval '1 day'
          GROUP BY 1, 2, 3, 4, 5
          ORDER BY events DESC
          LIMIT 10
        ) AS grouped
      `),
    ]);

  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    ledger,
    reconciliation: {
      ok: reconciliation.ok,
      scanned: reconciliation.scanned,
      missing: reconciliation.missing,
      mismatched: reconciliation.mismatched,
      orphaned: reconciliation.orphaned,
    },
    delivery: {
      delayedEvents24h: delivery.delayed_events_24h,
      maxDelaySeconds: delivery.max_delay_seconds,
      answerFailures24h: delivery.answer_failures_24h,
    },
    generation: {
      courses: Number(generation?.courses ?? 0),
      ready: Number(generation?.ready ?? 0),
      failed: Number(generation?.failed ?? 0),
      active: Number(generation?.active ?? 0),
      stalled: Number(generation?.stalled ?? 0),
      oldestActiveHeartbeat: generation?.oldest_active_heartbeat ?? null,
    },
    operations: {
      total24h: operations.total_24h,
      errors24h: operations.errors_24h,
      warnings24h: operations.warnings_24h,
      rateLimited24h: operations.rate_limited_24h,
      aiRequests24h: operations.ai_requests_24h,
      aiFailures24h: operations.ai_failures_24h,
      alerts: operations.alerts,
      topErrorGroups24h: Array.isArray(errorGroups?.groups)
        ? errorGroups.groups
        : [],
    },
    outbox: {
      reports24h: Number(outbox?.reports ?? 0),
      oldestQueueSeconds: Number(outbox?.oldest_queue_seconds ?? 0),
      maxQueueDepth: Number(outbox?.max_queue_depth ?? 0),
      attemptedDrains: Number(outbox?.attempted ?? 0),
      successfulDrains: Number(outbox?.drained ?? 0),
      replayDrainRate:
        Number(outbox?.attempted ?? 0) > 0
          ? Number(outbox?.drained ?? 0) / Number(outbox?.attempted)
          : null,
    },
  };
  report.healthy =
    report.reconciliation.ok &&
    Number(report.ledger.malformed ?? 0) === 0 &&
    report.delivery.answerFailures24h === 0 &&
    report.generation.stalled === 0 &&
    report.operations.errors24h === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.healthy ? 0 : 1;
} finally {
  await pool.end();
}
