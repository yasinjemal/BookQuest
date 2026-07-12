import { afterEach, describe, expect, it } from "vitest";
import {
  operationalAlerts,
  operationalSubject,
  safeErrorMetadata,
  sanitizeOperationalMetadata,
  summarizeFailureMetadata,
} from "../lib/observability";

afterEach(() => {
  delete process.env.OBSERVABILITY_SALT;
  delete process.env.AI_REQUEST_ALERT_24H;
  delete process.env.RATE_LIMIT_ALERT_24H;
});

describe("privacy-safe operational monitoring", () => {
  it("redacts risky metadata and bounds retained strings", () => {
    const safe = sanitizeOperationalMetadata({
      model: "claude-test",
      email: "person@example.com",
      answer_text: "private learner response",
      detail: "x".repeat(300),
    });
    expect(safe.model).toBe("claude-test");
    expect(safe.email).toBe("[redacted]");
    expect(safe.answer_text).toBe("[redacted]");
    expect(String(safe.detail)).toHaveLength(160);
  });

  it("groups errors without retaining messages or stack traces", () => {
    const error = new Error("Private document failed at secret section");
    const metadata = safeErrorMetadata(error);
    expect(metadata.error_name).toBe("Error");
    expect(metadata.error_fingerprint).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(metadata)).not.toContain("Private document");
    expect(JSON.stringify(metadata)).not.toContain("secret section");
  });

  it("hashes subjects and raises configurable volume alerts", () => {
    process.env.OBSERVABILITY_SALT = "test-observability-secret";
    const key = operationalSubject("user", 42);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("42");

    process.env.AI_REQUEST_ALERT_24H = "5";
    process.env.RATE_LIMIT_ALERT_24H = "10";
    const alerts = operationalAlerts({
      total_24h: 20,
      errors_24h: 1,
      warnings_24h: 12,
      rate_limited_24h: 10,
      ai_requests_24h: 5,
      ai_failures_24h: 1,
    });
    expect(alerts).toHaveLength(3);
  });

  it("extracts groupable fields from answer-failure metadata safely", () => {
    expect(
      summarizeFailureMetadata(
        JSON.stringify({ answer_source: "lesson", error_fingerprint: "abc123" })
      )
    ).toEqual({ answer_source: "lesson", error_fingerprint: "abc123" });

    // Missing fields and malformed JSON degrade to nulls, never throw.
    expect(summarizeFailureMetadata("{}")).toEqual({
      answer_source: null,
      error_fingerprint: null,
    });
    expect(summarizeFailureMetadata("not json")).toEqual({
      answer_source: null,
      error_fingerprint: null,
    });
  });
});
