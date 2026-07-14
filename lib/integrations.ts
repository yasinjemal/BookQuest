import crypto from "crypto";
import { isIP } from "net";
import type { Queryable } from "./pg";
import { one, tx } from "./pg";
import { authorizeStoredMembership, SpaceConflictError } from "./spaces";

export const API_VERSION = "2026-07-14";
export const API_SCOPES = ["courses.read", "assignments.read"] as const;
export type ApiScope = typeof API_SCOPES[number];
export const WEBHOOK_EVENT_TYPES = [
  "course.published",
  "credential.issued",
  "credential.revoked",
] as const;
export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

const digest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const nowIso = () => new Date().toISOString();

export class IntegrationAuthError extends Error {
  constructor(public readonly status: 401 | 403, message = "API access denied") {
    super(message);
    this.name = "IntegrationAuthError";
  }
}

function parseStringArray<T extends string>(value: string, allowlist: readonly T[]): T[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("Stored integration scope is invalid"); }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !allowlist.includes(item as T))) {
    throw new Error("Stored integration scope is invalid");
  }
  return [...new Set(parsed as T[])].sort();
}

function normalizeScopes(value: unknown): ApiScope[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > API_SCOPES.length) {
    throw new SpaceConflictError("Choose at least one supported API scope");
  }
  const scopes = [...new Set(value.map((item) => String(item).trim()))];
  if (scopes.some((scope) => !API_SCOPES.includes(scope as ApiScope))) {
    throw new SpaceConflictError("Unsupported API scope");
  }
  return (scopes as ApiScope[]).sort();
}

function normalizeEventTypes(value: unknown): WebhookEventType[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > WEBHOOK_EVENT_TYPES.length) {
    throw new SpaceConflictError("Choose at least one supported webhook event");
  }
  const events = [...new Set(value.map((item) => String(item).trim()))];
  if (events.some((event) => !WEBHOOK_EVENT_TYPES.includes(event as WebhookEventType))) {
    throw new SpaceConflictError("Unsupported webhook event");
  }
  return (events as WebhookEventType[]).sort();
}

export function validateWebhookUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new SpaceConflictError("Enter a valid HTTPS webhook URL"); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash
      || isIP(hostname) !== 0 || hostname === "localhost" || hostname.endsWith(".localhost")
      || hostname.endsWith(".local") || hostname.endsWith(".internal")
      || hostname.endsWith(".home.arpa") || url.href.length > 2048) {
    throw new SpaceConflictError("Webhook URL must be a public HTTPS address without credentials or a fragment");
  }
  return url.href;
}

function encryptionKey() {
  const material = process.env.INTEGRATION_ENCRYPTION_KEY
    || process.env.MFA_ENCRYPTION_KEY || process.env.GENERATION_SECRET;
  if (!material && process.env.NODE_ENV === "production") {
    throw new Error("INTEGRATION_ENCRYPTION_KEY or MFA_ENCRYPTION_KEY is required in production");
  }
  return crypto.createHash("sha256").update(material || "bookquest-local-integration-key").digest();
}

function encryptSecret(secret: string, endpointId: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`webhook:${endpointId}`));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSecret(row: {
  id: string; secret_ciphertext: string; secret_iv: string; secret_auth_tag: string;
}) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.secret_iv, "base64"));
  decipher.setAAD(Buffer.from(`webhook:${row.id}`));
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, "base64")), decipher.final(),
  ]).toString("utf8");
}

export async function listIntegrations(actorUserId: number, spaceId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const clients = (await client.query<{
      id: string; client_id: string; name: string; scopes_json: string;
      status: "active" | "revoked"; created_at: string; revoked_at: string | null;
    }>(
      `SELECT id,client_id,name,scopes_json,status,created_at,revoked_at
       FROM api_clients WHERE space_id=$1 ORDER BY created_at DESC`, [spaceId],
    )).rows.map((row) => ({
      id: row.id, clientId: row.client_id, name: row.name,
      scopes: parseStringArray(row.scopes_json, API_SCOPES), status: row.status,
      createdAt: row.created_at, revokedAt: row.revoked_at,
    }));
    const endpoints = (await client.query<{
      id: string; url: string; event_types_json: string; status: "active" | "revoked";
      created_at: string; revoked_at: string | null;
    }>(
      `SELECT id,url,event_types_json,status,created_at,revoked_at
       FROM webhook_endpoints WHERE space_id=$1 ORDER BY created_at DESC`, [spaceId],
    )).rows.map((row) => ({
      id: row.id, url: row.url, eventTypes: parseStringArray(row.event_types_json, WEBHOOK_EVENT_TYPES),
      status: row.status, createdAt: row.created_at, revokedAt: row.revoked_at,
    }));
    return { apiVersion: API_VERSION, scopes: API_SCOPES, webhookEventTypes: WEBHOOK_EVENT_TYPES, clients, endpoints };
  });
}

export async function createApiClient(
  actorUserId: number,
  spaceId: string,
  input: { name: string; scopes: unknown },
) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new SpaceConflictError("Client name must be 2 to 120 characters");
  const scopes = normalizeScopes(input.scopes);
  const clientId = `bqc_${crypto.randomBytes(18).toString("base64url")}`;
  const clientSecret = `bqs_${crypto.randomBytes(32).toString("base64url")}`;
  const row = await tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    return (await client.query<{ id: string; created_at: string }>(
      `INSERT INTO api_clients
        (space_id,client_id,name,secret_hash,scopes_json,created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,created_at`,
      [spaceId, clientId, name, digest(clientSecret), JSON.stringify(scopes), actorUserId],
    )).rows[0];
  });
  return { id: row.id, clientId, clientSecret, name, scopes, createdAt: row.created_at };
}

export async function revokeApiClient(actorUserId: number, spaceId: string, clientId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const at = nowIso();
    const row = (await client.query<{ id: string }>(
      `UPDATE api_clients SET status='revoked',revoked_at=$3
       WHERE id=$1 AND space_id=$2 AND status='active' RETURNING id`,
      [clientId, spaceId, at],
    )).rows[0];
    if (!row) throw new SpaceConflictError("Active API client not found");
    await client.query(
      `UPDATE oauth_access_tokens SET revoked_at=$2
       WHERE api_client_id=$1 AND revoked_at IS NULL`, [row.id, at],
    );
    return { id: row.id, status: "revoked" as const, revokedAt: at };
  });
}

export async function issueClientCredentialsToken(input: {
  clientId: string; clientSecret: string; requestedScopes?: string[];
}, at = new Date()) {
  if (!/^bqc_[A-Za-z0-9_-]{24}$/.test(input.clientId)
      || !/^bqs_[A-Za-z0-9_-]{43}$/.test(input.clientSecret)) {
    throw new IntegrationAuthError(401, "Invalid client credentials");
  }
  return tx(async (client) => {
    const row = (await client.query<{
      id: string; scopes_json: string; secret_hash: string; status: string; space_status: string;
    }>(
      `SELECT api.id,api.scopes_json,api.secret_hash,api.status,space.status AS space_status
       FROM api_clients api JOIN spaces space ON space.id=api.space_id
       WHERE api.client_id=$1 FOR SHARE OF api,space`, [input.clientId],
    )).rows[0];
    const supplied = Buffer.from(digest(input.clientSecret), "hex");
    const expected = row ? Buffer.from(row.secret_hash, "hex") : crypto.randomBytes(32);
    if (!row || !crypto.timingSafeEqual(supplied, expected)
        || row.status !== "active" || row.space_status !== "active") {
      throw new IntegrationAuthError(401, "Invalid client credentials");
    }
    const allowed = parseStringArray(row.scopes_json, API_SCOPES);
    const requested = input.requestedScopes?.length
      ? [...new Set(input.requestedScopes.map((value) => value.trim()).filter(Boolean))]
      : allowed;
    if (!requested.length || requested.some((scope) => !allowed.includes(scope as ApiScope))) {
      throw new IntegrationAuthError(403, "Requested scope is not allowed");
    }
    const scopes = (requested as ApiScope[]).sort();
    const accessToken = `bqat_${crypto.randomBytes(32).toString("base64url")}`;
    const issuedAt = at.toISOString();
    const expiresAt = new Date(at.getTime() + 60 * 60 * 1000).toISOString();
    await client.query(
      `INSERT INTO oauth_access_tokens
        (api_client_id,token_hash,scopes_json,issued_at,expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [row.id, digest(accessToken), JSON.stringify(scopes), issuedAt, expiresAt],
    );
    return { accessToken, tokenType: "Bearer" as const, expiresIn: 3600, scopes, issuedAt, expiresAt };
  });
}

export async function authenticateApiRequest(
  authorization: string | null,
  spaceId: string,
  requiredScope: ApiScope,
  at = new Date(),
) {
  const match = authorization?.match(/^Bearer (bqat_[A-Za-z0-9_-]{43})$/);
  if (!match) throw new IntegrationAuthError(401);
  const row = await one<{
    client_id: string; space_id: string; scopes_json: string; token_expires_at: string;
    token_revoked_at: string | null; client_status: string; space_status: string;
  }>(
    `SELECT api.client_id,api.space_id,token.scopes_json,token.expires_at AS token_expires_at,
            token.revoked_at AS token_revoked_at,api.status AS client_status,space.status AS space_status
     FROM oauth_access_tokens token
     JOIN api_clients api ON api.id=token.api_client_id
     JOIN spaces space ON space.id=api.space_id
     WHERE token.token_hash=$1`, [digest(match[1])],
  );
  if (!row || row.token_revoked_at || row.client_status !== "active"
      || row.space_status !== "active" || Date.parse(row.token_expires_at) <= at.getTime()) {
    throw new IntegrationAuthError(401);
  }
  if (row.space_id !== spaceId || !parseStringArray(row.scopes_json, API_SCOPES).includes(requiredScope)) {
    throw new IntegrationAuthError(403);
  }
  return { clientId: row.client_id, spaceId: row.space_id, scope: requiredScope };
}

export async function listApiCourses(spaceId: string) {
  const rows = await tx(async (client) => (await client.query<{
    id: number; title: string; status: string; content_version: number;
    published: number; attached_at: string; published_version_id: string | null;
  }>(
    `SELECT course.id,course.title,course.status,course.content_version,course.published,
            link.attached_at,course.published_version_id
     FROM space_courses link JOIN courses course ON course.id=link.course_id
     WHERE link.space_id=$1 ORDER BY link.attached_at DESC,course.id`, [spaceId],
  )).rows);
  return rows.map((row) => ({
    id: String(row.id), title: row.title, status: row.status,
    version: row.content_version, published: Boolean(row.published),
    publishedVersionId: row.published_version_id, attachedAt: row.attached_at,
  }));
}

export async function listApiAssignments(spaceId: string) {
  return tx(async (client) => (await client.query<{
    id: string; course_id: number; course_version: number; status: string;
    due_at: string | null; start_at: string | null; expires_at: string | null; created_at: string;
  }>(
    `SELECT id,course_id,course_version,status,due_at,start_at,expires_at,created_at
     FROM space_assignments WHERE space_id=$1 AND status<>'archived'
     ORDER BY created_at DESC,id`, [spaceId],
  )).rows.map((row) => ({
    id: row.id, courseId: String(row.course_id), courseVersion: row.course_version,
    status: row.status, dueAt: row.due_at, startsAt: row.start_at,
    expiresAt: row.expires_at, createdAt: row.created_at,
  })));
}

export async function createWebhookEndpoint(
  actorUserId: number,
  spaceId: string,
  input: { url: string; eventTypes: unknown },
) {
  const url = validateWebhookUrl(input.url);
  const eventTypes = normalizeEventTypes(input.eventTypes);
  const id = crypto.randomUUID();
  const signingSecret = `bqwhsec_${crypto.randomBytes(32).toString("base64url")}`;
  const encrypted = encryptSecret(signingSecret, id);
  const row = await tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    return (await client.query<{ created_at: string }>(
      `INSERT INTO webhook_endpoints
        (id,space_id,url,event_types_json,secret_ciphertext,secret_iv,secret_auth_tag,created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at`,
      [id, spaceId, url, JSON.stringify(eventTypes), encrypted.ciphertext,
       encrypted.iv, encrypted.authTag, actorUserId],
    )).rows[0];
  });
  return { id, url, eventTypes, signingSecret, createdAt: row.created_at };
}

export async function revokeWebhookEndpoint(actorUserId: number, spaceId: string, endpointId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const at = nowIso();
    const row = (await client.query<{ id: string }>(
      `UPDATE webhook_endpoints SET status='revoked',revoked_at=$3
       WHERE id=$1 AND space_id=$2 AND status='active' RETURNING id`,
      [endpointId, spaceId, at],
    )).rows[0];
    if (!row) throw new SpaceConflictError("Active webhook endpoint not found");
    return { id: row.id, status: "revoked" as const, revokedAt: at };
  });
}

export async function enqueueWebhookEvent(
  exec: Queryable,
  input: {
    spaceId: string; eventType: WebhookEventType; resourceId: string;
    dedupeKey: string; occurredAt: string; data: Record<string, unknown>;
  },
) {
  if (!WEBHOOK_EVENT_TYPES.includes(input.eventType) || input.resourceId.length > 200
      || input.dedupeKey.length < 3 || input.dedupeKey.length > 300) {
    throw new Error("Invalid webhook event");
  }
  const event = (await exec.query<{ id: string }>(
    `INSERT INTO webhook_events
      (space_id,event_type,resource_id,dedupe_key,payload_json,occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (space_id,dedupe_key) DO NOTHING RETURNING id`,
    [input.spaceId, input.eventType, input.resourceId, input.dedupeKey,
     JSON.stringify(input.data), input.occurredAt],
  )).rows[0];
  if (!event) {
    return (await exec.query<{ id: string }>(
      "SELECT id FROM webhook_events WHERE space_id=$1 AND dedupe_key=$2",
      [input.spaceId, input.dedupeKey],
    )).rows[0];
  }
  await exec.query(
    `INSERT INTO webhook_deliveries (webhook_event_id,webhook_endpoint_id,next_attempt_at)
     SELECT $1,endpoint.id,$2 FROM webhook_endpoints endpoint
     WHERE endpoint.space_id=$3 AND endpoint.status='active'
       AND endpoint.event_types_json::jsonb ? $4
     ON CONFLICT (webhook_event_id,webhook_endpoint_id) DO NOTHING`,
    [event.id, input.occurredAt, input.spaceId, input.eventType],
  );
  return event;
}

type DeliveryFetch = (input: string, init: RequestInit) => Promise<Pick<Response, "status">>;

export async function deliverNextWebhook(
  fetcher: DeliveryFetch = fetch,
  at = new Date(),
) {
  const claimed = await tx(async (client) => {
    const row = (await client.query<{
      id: string; attempt_count: number; url: string; endpoint_id: string;
      secret_ciphertext: string; secret_iv: string; secret_auth_tag: string;
      event_id: string; event_type: WebhookEventType; payload_json: string; occurred_at: string;
    }>(
      `SELECT delivery.id,delivery.attempt_count,endpoint.url,endpoint.id AS endpoint_id,
              endpoint.secret_ciphertext,endpoint.secret_iv,endpoint.secret_auth_tag,
              event.id AS event_id,event.event_type,event.payload_json,event.occurred_at
       FROM webhook_deliveries delivery
       JOIN webhook_endpoints endpoint ON endpoint.id=delivery.webhook_endpoint_id
       JOIN webhook_events event ON event.id=delivery.webhook_event_id
       WHERE endpoint.status='active' AND delivery.attempt_count<8 AND (
         (delivery.status IN ('pending','failed') AND delivery.next_attempt_at::timestamptz<=$1)
         OR (delivery.status='delivering' AND delivery.updated_at::timestamptz<$1::timestamptz-interval '5 minutes')
       )
       ORDER BY delivery.next_attempt_at,delivery.created_at
       FOR UPDATE OF delivery SKIP LOCKED LIMIT 1`, [at.toISOString()],
    )).rows[0];
    if (!row) return null;
    await client.query(
      `UPDATE webhook_deliveries SET status='delivering',attempt_count=attempt_count+1,
       updated_at=$2,last_error=NULL WHERE id=$1`, [row.id, at.toISOString()],
    );
    return { ...row, attempt_count: row.attempt_count + 1 };
  });
  if (!claimed) return null;
  const envelope = JSON.stringify({
    id: claimed.event_id, type: claimed.event_type, apiVersion: API_VERSION,
    occurredAt: claimed.occurred_at, data: JSON.parse(claimed.payload_json),
  });
  const timestamp = Math.floor(at.getTime() / 1000);
  const secret = decryptSecret({
    id: claimed.endpoint_id, secret_ciphertext: claimed.secret_ciphertext,
    secret_iv: claimed.secret_iv, secret_auth_tag: claimed.secret_auth_tag,
  });
  const signature = crypto.createHmac("sha256", secret)
    .update(`${timestamp}.${claimed.event_id}.${envelope}`).digest("hex");
  try {
    const response = await fetcher(claimed.url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "BookQuest-Webhooks/1.0",
        "Idempotency-Key": claimed.event_id,
        "X-BookQuest-Event-Id": claimed.event_id,
        "X-BookQuest-Delivery-Id": claimed.id,
        "X-BookQuest-Signature": `t=${timestamp},v1=${signature}`,
      },
      body: envelope,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    await tx(async (client) => client.query(
      `UPDATE webhook_deliveries SET status='succeeded',last_http_status=$2,
       delivered_at=$3,updated_at=$3 WHERE id=$1 AND status='delivering'`,
      [claimed.id, response.status, at.toISOString()],
    ));
    return { deliveryId: claimed.id, eventId: claimed.event_id, status: "succeeded" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "Delivery failed";
    const match = message.match(/^HTTP (\d{3})$/);
    const delaySeconds = Math.min(6 * 60 * 60, 30 * (2 ** Math.max(0, claimed.attempt_count - 1)));
    const nextAttemptAt = new Date(at.getTime() + delaySeconds * 1000).toISOString();
    await tx(async (client) => client.query(
      `UPDATE webhook_deliveries SET status='failed',last_http_status=$2,last_error=$3,
       next_attempt_at=$4,updated_at=$5 WHERE id=$1 AND status='delivering'`,
      [claimed.id, match ? Number(match[1]) : null, message, nextAttemptAt, at.toISOString()],
    ));
    return { deliveryId: claimed.id, eventId: claimed.event_id, status: "failed" as const, nextAttemptAt };
  }
}
