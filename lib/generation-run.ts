import crypto from "crypto";

export function newGenerationRunId(): string {
  return crypto.randomUUID();
}

/** Accept current UUIDs and 32-character IDs backfilled for legacy courses. */
export function isGenerationRunId(value: string): boolean {
  return /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(
    value
  );
}
