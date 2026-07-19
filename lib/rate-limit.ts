import crypto from "crypto";
import { NextResponse } from "next/server";

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export const RATE_LIMITS = {
  loginIp: { scope: "auth.login.ip", limit: 20, windowSeconds: 15 * 60 },
  loginAccount: {
    scope: "auth.login.account",
    limit: 8,
    windowSeconds: 15 * 60,
  },
  registerIp: { scope: "auth.register.ip", limit: 10, windowSeconds: 60 * 60 },
  registerAccount: {
    scope: "auth.register.account",
    limit: 3,
    windowSeconds: 60 * 60,
  },
  verificationUser: {
    scope: "auth.verification.user",
    limit: 5,
    windowSeconds: 60 * 60,
  },
  verificationConfirmIp: {
    scope: "auth.verification.confirm.ip",
    limit: 60,
    windowSeconds: 60 * 60,
  },
  forgotPasswordIp: {
    scope: "auth.password.forgot.ip",
    limit: 10,
    windowSeconds: 60 * 60,
  },
  forgotPasswordAccount: {
    scope: "auth.password.forgot.account",
    limit: 3,
    windowSeconds: 60 * 60,
  },
  resetPasswordIp: {
    scope: "auth.password.reset.ip",
    limit: 20,
    windowSeconds: 60 * 60,
  },
  uploadUser: { scope: "course.upload.user", limit: 10, windowSeconds: 60 * 60 },
  uploadIp: { scope: "course.upload.ip", limit: 30, windowSeconds: 60 * 60 },
  coverUploadUser: { scope: "cover.upload.user", limit: 30, windowSeconds: 60 * 60 },
  coverUploadIp: { scope: "cover.upload.ip", limit: 100, windowSeconds: 60 * 60 },
  portableImportUser: { scope: "portable.import.user", limit: 30, windowSeconds: 60 * 60 },
  portableImportIp: { scope: "portable.import.ip", limit: 100, windowSeconds: 60 * 60 },
  courseRetryUser: {
    scope: "course.retry.user",
    limit: 5,
    windowSeconds: 60 * 60,
  },
  summaryRetryUser: {
    scope: "summary.retry.user",
    limit: 5,
    windowSeconds: 60 * 60,
  },
  freshPracticeUser: {
    scope: "practice.fresh.user",
    limit: 10,
    windowSeconds: 60 * 60,
  },
  answerUser: {
    // Deliberately generous so a reconnecting offline outbox can drain safely.
    scope: "answer.submit.user",
    limit: 1200,
    windowSeconds: 5 * 60,
  },
  privacyExportUser: {
    scope: "privacy.export.user",
    limit: 3,
    windowSeconds: 60 * 60,
  },
  privacyMutationUser: {
    scope: "privacy.mutation.user",
    limit: 10,
    windowSeconds: 60 * 60,
  },
  billingCheckoutUser: {
    scope: "billing.checkout.user",
    limit: 10,
    windowSeconds: 60 * 60,
  },
  publicCourseEventIp: {
    scope: "public.course.event.ip",
    limit: 240,
    windowSeconds: 60 * 60,
  },
  classroomMutationUser: {
    scope: "classroom.mutation.user",
    limit: 30,
    windowSeconds: 60 * 60,
  },
  classroomJoinIp: {
    scope: "classroom.join.ip",
    limit: 60,
    windowSeconds: 60 * 60,
  },
  spaceMutationUser: {
    scope: "space.mutation.user",
    limit: 60,
    windowSeconds: 60 * 60,
  },
  studioMutationUser: {
    scope: "studio.mutation.user",
    limit: 240,
    windowSeconds: 60 * 60,
  },
  credentialVerifyIp: {
    scope: "credential.verify.ip",
    limit: 120,
    windowSeconds: 60 * 60,
  },
  passportMutationUser: {
    scope: "passport.mutation.user",
    limit: 60,
    windowSeconds: 60 * 60,
  },
  passportVerifyIp: {
    scope: "passport.verify.ip",
    limit: 120,
    windowSeconds: 60 * 60,
  },
  passportVerifyShare: {
    scope: "passport.verify.share",
    limit: 60,
    windowSeconds: 60 * 60,
  },
  mfaUser: {
    scope: "auth.mfa.user",
    limit: 20,
    windowSeconds: 15 * 60,
  },
  mfaChallengeIp: {
    scope: "auth.mfa.challenge.ip",
    limit: 60,
    windowSeconds: 15 * 60,
  },
  outboxTelemetryUser: {
    scope: "telemetry.outbox.user",
    limit: 120,
    windowSeconds: 60 * 60,
  },
  internalGenerationCourse: {
    scope: "generation.internal.course",
    limit: 60,
    windowSeconds: 60 * 60,
  },
  internalGenerationSummary: {
    scope: "generation.internal.summary",
    limit: 80,
    windowSeconds: 60 * 60,
  },
  oauthTokenIp: {
    scope: "oauth.token.ip",
    limit: 120,
    windowSeconds: 15 * 60,
  },
  oauthTokenClient: {
    scope: "oauth.token.client",
    limit: 60,
    windowSeconds: 15 * 60,
  },
  versionedApiClient: {
    scope: "api.v1.client",
    limit: 1200,
    windowSeconds: 60 * 60,
  },
  ltiLoginIp: {
    scope: "lti.oidc.login.ip",
    limit: 120,
    windowSeconds: 15 * 60,
  },
  ltiLaunchIp: {
    scope: "lti.launch.ip",
    limit: 120,
    windowSeconds: 15 * 60,
  },
} as const satisfies Record<string, RateLimitPolicy>;

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
let lastCleanupAt = 0;

/**
 * Read the address supplied by the trusted deployment proxy. Vercel and most
 * reverse proxies place the original address first in x-forwarded-for.
 */
export function requestIp(req: Pick<Request, "headers">): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Store only a keyed digest, never a raw email, user id, or IP address. */
export function rateLimitSubject(kind: string, value: string | number): string {
  const salt =
    process.env.RATE_LIMIT_SALT ||
    process.env.GENERATION_SECRET ||
    "bookquest-local-rate-limit-v1";
  return crypto
    .createHmac("sha256", salt)
    .update(`${kind}:${String(value).trim().toLowerCase()}`)
    .digest("hex");
}

export function fixedWindow(
  policy: RateLimitPolicy,
  now = new Date()
): { windowId: number; resetAt: Date } {
  const windowMs = policy.windowSeconds * 1000;
  const windowId = Math.floor(now.getTime() / windowMs);
  return { windowId, resetAt: new Date((windowId + 1) * windowMs) };
}

export function rateLimitDecision(
  count: number,
  policy: RateLimitPolicy,
  resetAt: Date,
  now = new Date()
): RateLimitResult {
  return {
    allowed: count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    resetAt,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((resetAt.getTime() - now.getTime()) / 1000)
    ),
  };
}

/**
 * Consume one distributed fixed-window allowance. The Postgres upsert is
 * atomic, so concurrent serverless workers share the same counter.
 */
export async function consumeRateLimit(
  policy: RateLimitPolicy,
  subject: string,
  now = new Date()
): Promise<RateLimitResult> {
  // Lazy-load the database so pure policy helpers remain testable without a
  // configured production connection.
  const { one, q } = await import("./pg");
  const { windowId, resetAt } = fixedWindow(policy, now);
  const bucketKey = rateLimitSubject("bucket", `${policy.scope}:${subject}`);
  const row = await one<{ request_count: number }>(
    `INSERT INTO rate_limit_buckets
       (bucket_key, scope, window_id, request_count, expires_at)
     VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (bucket_key, window_id) DO UPDATE
       SET request_count = rate_limit_buckets.request_count + 1
     RETURNING request_count`,
    [bucketKey, policy.scope, windowId, resetAt.toISOString()]
  );

  if (now.getTime() - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    lastCleanupAt = now.getTime();
    await q(
      "DELETE FROM rate_limit_buckets WHERE expires_at::timestamptz < now() - interval '1 day'"
    );
  }

  const result = rateLimitDecision(
    Number(row?.request_count ?? 1),
    policy,
    resetAt,
    now
  );
  if (!result.allowed) {
    const { recordOperationalEvent } = await import("./observability");
    await recordOperationalEvent({
      eventType: "security.rate_limited",
      severity: "warning",
      area: policy.scope,
      subjectKey: bucketKey,
      metadata: {
        limit: policy.limit,
        window_seconds: policy.windowSeconds,
      },
    });
  }
  return result;
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
    "Retry-After": String(result.retryAfterSeconds),
  };
}

export function tooManyRequests(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests. Please wait and try again.",
      code: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    { status: 429, headers: rateLimitHeaders(result) }
  );
}
