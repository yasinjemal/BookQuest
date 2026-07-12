import crypto from "crypto";

export type OperationalSeverity = "info" | "warning" | "error";
export type OperationalMetadataValue = string | number | boolean | null;

export interface OperationalEventInput {
  eventType: string;
  severity: OperationalSeverity;
  area: string;
  subjectKey?: string;
  metadata?: Record<string, OperationalMetadataValue>;
  occurredAt?: Date;
}

const SENSITIVE_KEY =
  /(^|_)(email|password|secret|token|phone|address|ip|name)$|^(answer|response|document|content|source|prompt)(_text|_body|_raw)?$/i;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let lastCleanupAt = 0;

/** Restrict operational metadata to bounded primitives and redact risky keys. */
export function sanitizeOperationalMetadata(
  metadata: Record<string, OperationalMetadataValue> = {}
): Record<string, OperationalMetadataValue> {
  const safe: Record<string, OperationalMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 16)) {
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
    if (!safeKey) continue;
    if (SENSITIVE_KEY.test(safeKey)) {
      safe[safeKey] = "[redacted]";
    } else if (typeof value === "string") {
      safe[safeKey] = value.slice(0, 160);
    } else {
      safe[safeKey] = value;
    }
  }
  return safe;
}

/** One-way subject identity for grouping without retaining the raw identifier. */
export function operationalSubject(kind: string, value: string | number): string {
  const salt =
    process.env.OBSERVABILITY_SALT ||
    process.env.RATE_LIMIT_SALT ||
    process.env.GENERATION_SECRET ||
    "bookquest-local-observability-v1";
  return crypto
    .createHmac("sha256", salt)
    .update(`${kind}:${String(value).trim().toLowerCase()}`)
    .digest("hex");
}

/** Error grouping data that intentionally excludes the error message and stack. */
export function safeErrorMetadata(
  error: unknown
): Record<string, OperationalMetadataValue> {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const name = error instanceof Error ? error.name : "UnknownError";
  const code =
    typeof record.code === "string" || typeof record.code === "number"
      ? String(record.code).slice(0, 64)
      : null;
  const fingerprintSource =
    error instanceof Error ? `${name}:${error.message}:${error.stack ?? ""}` : name;
  return {
    error_name: name.slice(0, 80),
    error_code: code,
    error_fingerprint: crypto
      .createHash("sha256")
      .update(fingerprintSource)
      .digest("hex")
      .slice(0, 24),
  };
}

/** Best-effort monitoring must never take down the user-facing operation. */
export async function recordOperationalEvent(
  input: OperationalEventInput
): Promise<boolean> {
  try {
    const { q } = await import("./pg");
    const occurredAt = input.occurredAt ?? new Date();
    await q(
      `INSERT INTO operational_events
        (event_type, severity, area, subject_key, metadata_json, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.eventType.slice(0, 100),
        input.severity,
        input.area.slice(0, 120),
        input.subjectKey ?? null,
        JSON.stringify(sanitizeOperationalMetadata(input.metadata)),
        occurredAt.toISOString(),
      ]
    );
    if (occurredAt.getTime() - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
      lastCleanupAt = occurredAt.getTime();
      const configured = Number(process.env.OPERATIONAL_EVENT_RETENTION_DAYS ?? 90);
      const retentionDays = Number.isFinite(configured)
        ? Math.min(3650, Math.max(7, Math.trunc(configured)))
        : 90;
      await q(
        "DELETE FROM operational_events WHERE occurred_at::timestamptz < now() - ($1 * interval '1 day')",
        [retentionDays]
      );
    }
    return true;
  } catch (error) {
    console.error("Operational monitoring write failed", error);
    return false;
  }
}

export async function recordOperationalError(input: {
  eventType: string;
  area: string;
  error: unknown;
  subjectKey?: string;
  metadata?: Record<string, OperationalMetadataValue>;
}): Promise<boolean> {
  return recordOperationalEvent({
    eventType: input.eventType,
    severity: "error",
    area: input.area,
    subjectKey: input.subjectKey,
    metadata: { ...input.metadata, ...safeErrorMetadata(input.error) },
  });
}

export interface OperationalHealth {
  total_24h: number;
  errors_24h: number;
  warnings_24h: number;
  rate_limited_24h: number;
  ai_requests_24h: number;
  ai_failures_24h: number;
  alerts: string[];
  recent: {
    event_type: string;
    severity: OperationalSeverity;
    area: string;
    occurred_at: string;
  }[];
}

export function operationalAlerts(counts: Omit<OperationalHealth, "alerts" | "recent">) {
  const alerts: string[] = [];
  const aiThreshold = Number(process.env.AI_REQUEST_ALERT_24H ?? 100);
  const abuseThreshold = Number(process.env.RATE_LIMIT_ALERT_24H ?? 50);
  if (counts.errors_24h > 0) {
    alerts.push(`${counts.errors_24h} production error event(s) in the last 24 hours.`);
  }
  if (counts.ai_requests_24h >= aiThreshold) {
    alerts.push(
      `AI request volume reached ${counts.ai_requests_24h} in 24 hours (threshold ${aiThreshold}).`
    );
  }
  if (counts.rate_limited_24h >= abuseThreshold) {
    alerts.push(
      `Rate-limit denials reached ${counts.rate_limited_24h} in 24 hours (threshold ${abuseThreshold}).`
    );
  }
  return alerts;
}

// An answer whose server record landed this long after the learner answered it
// counts as "delayed" — evidence of offline reconciliation (or a stuck queue).
export const DELAYED_EVENT_THRESHOLD_SECONDS = 120;

export interface DeliveryHealth {
  /** Events recorded in the last 24h more than the threshold after they occurred. */
  delayed_events_24h: number;
  /** Largest occurred_at -> recorded_at gap among those, in seconds. */
  max_delay_seconds: number;
  /** Server-side answer delivery failures in the last 24h. */
  answer_failures_24h: number;
  delayed_sample: {
    session_kind: string;
    course_id: number | null;
    delay_seconds: number;
    recorded_at: string;
  }[];
  failure_sample: {
    area: string;
    occurred_at: string;
    answer_source: string | null;
    error_fingerprint: string | null;
  }[];
  alerts: string[];
}

/** Pull the safe, groupable fields out of an answer-failure event's metadata. */
export function summarizeFailureMetadata(metadataJson: string): {
  answer_source: string | null;
  error_fingerprint: string | null;
} {
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    return {
      answer_source:
        typeof parsed.answer_source === "string" ? parsed.answer_source : null,
      error_fingerprint:
        typeof parsed.error_fingerprint === "string"
          ? parsed.error_fingerprint
          : null,
    };
  } catch {
    return { answer_source: null, error_fingerprint: null };
  }
}

/**
 * Admin drill-down for delivery reliability: how often answers arrive late (the
 * offline outbox reconciling) and how many failed to record server-side. Both are
 * cheap aggregates plus a small recent sample for investigation.
 */
export async function deliveryHealth(): Promise<DeliveryHealth> {
  const { one, many } = await import("./pg");
  const threshold = DELAYED_EVENT_THRESHOLD_SECONDS;

  const delayed = (await one(
    `SELECT
       COUNT(*) FILTER (
         WHERE recorded_at::timestamptz - occurred_at::timestamptz > ($1 * interval '1 second')
       )::int AS delayed_events_24h,
       GREATEST(0, COALESCE(MAX(
         EXTRACT(EPOCH FROM (recorded_at::timestamptz - occurred_at::timestamptz))
       ), 0))::int AS max_delay_seconds
     FROM learning_events
     WHERE recorded_at::timestamptz >= now() - interval '1 day'`,
    [threshold]
  )) as { delayed_events_24h: number; max_delay_seconds: number } | undefined;

  const delayedSample = (await many(
    `SELECT session_kind, course_id,
       EXTRACT(EPOCH FROM (recorded_at::timestamptz - occurred_at::timestamptz))::int AS delay_seconds,
       recorded_at
     FROM learning_events
     WHERE recorded_at::timestamptz >= now() - interval '1 day'
       AND recorded_at::timestamptz - occurred_at::timestamptz > ($1 * interval '1 second')
     ORDER BY (recorded_at::timestamptz - occurred_at::timestamptz) DESC
     LIMIT 10`,
    [threshold]
  )) as DeliveryHealth["delayed_sample"];

  const failures = (await one(
    `SELECT COUNT(*)::int AS answer_failures_24h
     FROM operational_events
     WHERE occurred_at::timestamptz >= now() - interval '1 day'
       AND event_type = 'learning.answer_failed'`
  )) as { answer_failures_24h: number } | undefined;

  const failureRows = (await many(
    `SELECT area, occurred_at, metadata_json
     FROM operational_events
     WHERE event_type = 'learning.answer_failed'
     ORDER BY occurred_at DESC
     LIMIT 10`
  )) as { area: string; occurred_at: string; metadata_json: string }[];

  const answerFailures = Number(failures?.answer_failures_24h ?? 0);
  const alerts: string[] = [];
  if (answerFailures > 0) {
    alerts.push(`${answerFailures} answer delivery failure(s) in the last 24 hours.`);
  }

  return {
    delayed_events_24h: Number(delayed?.delayed_events_24h ?? 0),
    max_delay_seconds: Number(delayed?.max_delay_seconds ?? 0),
    answer_failures_24h: answerFailures,
    delayed_sample: delayedSample,
    failure_sample: failureRows.map((row) => ({
      area: row.area,
      occurred_at: row.occurred_at,
      ...summarizeFailureMetadata(row.metadata_json),
    })),
    alerts,
  };
}

export async function operationalHealth(): Promise<OperationalHealth> {
  const { one, many } = await import("./pg");
  const counts = (await one(
    `SELECT
      COUNT(*)::int AS total_24h,
      COUNT(*) FILTER (WHERE severity = 'error')::int AS errors_24h,
      COUNT(*) FILTER (WHERE severity = 'warning')::int AS warnings_24h,
      COUNT(*) FILTER (WHERE event_type = 'security.rate_limited')::int AS rate_limited_24h,
      COUNT(*) FILTER (WHERE event_type = 'ai.request')::int AS ai_requests_24h,
      COUNT(*) FILTER (WHERE event_type = 'ai.failure')::int AS ai_failures_24h
     FROM operational_events
     WHERE occurred_at::timestamptz >= now() - interval '1 day'`
  )) as Omit<OperationalHealth, "alerts" | "recent">;
  const normalized = {
    total_24h: Number(counts?.total_24h ?? 0),
    errors_24h: Number(counts?.errors_24h ?? 0),
    warnings_24h: Number(counts?.warnings_24h ?? 0),
    rate_limited_24h: Number(counts?.rate_limited_24h ?? 0),
    ai_requests_24h: Number(counts?.ai_requests_24h ?? 0),
    ai_failures_24h: Number(counts?.ai_failures_24h ?? 0),
  };
  const recent = (await many(
    `SELECT event_type, severity, area, occurred_at
     FROM operational_events
     WHERE severity IN ('warning', 'error')
     ORDER BY occurred_at DESC
     LIMIT 12`
  )) as OperationalHealth["recent"];
  return { ...normalized, alerts: operationalAlerts(normalized), recent };
}
