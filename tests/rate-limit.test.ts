import { afterEach, describe, expect, it } from "vitest";
import {
  fixedWindow,
  rateLimitDecision,
  rateLimitHeaders,
  rateLimitSubject,
  requestIp,
  type RateLimitPolicy,
} from "../lib/rate-limit";

const policy: RateLimitPolicy = {
  scope: "test.action",
  limit: 3,
  windowSeconds: 60,
};

afterEach(() => {
  delete process.env.RATE_LIMIT_SALT;
});

describe("rate limiting", () => {
  it("creates stable, scoped digests without retaining the raw subject", () => {
    process.env.RATE_LIMIT_SALT = "test-secret";
    const first = rateLimitSubject("email", " User@Example.com ");
    const again = rateLimitSubject("email", "user@example.com");
    const otherKind = rateLimitSubject("ip", "user@example.com");

    expect(first).toBe(again);
    expect(first).not.toBe(otherKind);
    expect(first).not.toContain("user@example.com");
  });

  it("uses the first proxy address and safe fallbacks", () => {
    expect(
      requestIp(
        new Request("https://example.test", {
          headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
        })
      )
    ).toBe("203.0.113.4");
    expect(
      requestIp(
        new Request("https://example.test", {
          headers: { "x-real-ip": "198.51.100.8" },
        })
      )
    ).toBe("198.51.100.8");
    expect(requestIp(new Request("https://example.test"))).toBe("unknown");
  });

  it("resets on fixed boundaries and denies only after the allowance", () => {
    const now = new Date("2026-07-12T12:00:30.000Z");
    const { windowId, resetAt } = fixedWindow(policy, now);
    expect(windowId).toBe(Math.floor(now.getTime() / 60_000));
    expect(resetAt.toISOString()).toBe("2026-07-12T12:01:00.000Z");

    expect(rateLimitDecision(3, policy, resetAt, now)).toMatchObject({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    const denied = rateLimitDecision(4, policy, resetAt, now);
    expect(denied.allowed).toBe(false);
    expect(rateLimitHeaders(denied)).toMatchObject({
      "RateLimit-Limit": "3",
      "RateLimit-Remaining": "0",
      "Retry-After": "30",
    });
  });
});
