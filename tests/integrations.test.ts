import crypto from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let studio: typeof import("../lib/studio");
let integrations: typeof import("../lib/integrations");
let ownerId: number;
let outsiderId: number;
let spaceId: string;
let otherSpaceId: string;
let courseId: number;
let webhookSigningSecret: string;
let webhookEndpointId: string;

describe.skipIf(!TEST_DB)("versioned APIs, scoped OAuth and signed webhooks", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.GENERATION_SECRET = "integration-test-encryption-key";
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    studio = await import("../lib/studio");
    integrations = await import("../lib/integrations");
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("integration-owner@example.test", "Integration Owner", "hash")).id;
    outsiderId = (await db.createUser("integration-outsider@example.test", "Integration Outsider", "hash")).id;
    spaceId = (await spaces.createSpace(ownerId, { name: "Integration Space", type: "organization" })).space.id;
    otherSpaceId = (await spaces.createSpace(outsiderId, { name: "Other Space", type: "organization" })).space.id;
    const source = await studio.createTextSource(ownerId, spaceId, {
      title: "Integration source", kind: "manual",
      content: [{ title: "API", text: "The API returns versioned course metadata." }],
    });
    courseId = (await studio.createCourseDraftFromSources(ownerId, spaceId, {
      title: "Integration sample", sourceVersionIds: [source.sourceVersionId],
    })).courseId;
    await spaces.attachCourseToSpace(ownerId, spaceId, courseId);
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
    delete process.env.GENERATION_SECRET;
  });

  it("issues least-privilege client credentials without retaining plaintext secrets", async () => {
    await expect(integrations.createApiClient(outsiderId, spaceId, {
      name: "Wrong tenant", scopes: ["courses.read"],
    })).rejects.toThrow(/space access denied/i);
    const created = await integrations.createApiClient(ownerId, spaceId, {
      name: "Reporting connector", scopes: ["courses.read", "assignments.read"],
    });
    expect(created.clientId).toMatch(/^bqc_/);
    expect(created.clientSecret).toMatch(/^bqs_/);
    const listed = await integrations.listIntegrations(ownerId, spaceId);
    expect(listed.clients[0]).toMatchObject({
      clientId: created.clientId, name: "Reporting connector",
      scopes: ["assignments.read", "courses.read"], status: "active",
    });
    expect(listed.clients[0]).not.toHaveProperty("clientSecret");
    const stored = (await pg.q<{ secret_hash: string }>(
      "SELECT secret_hash FROM api_clients WHERE id=$1", [created.id],
    )).rows[0];
    expect(stored.secret_hash).not.toContain(created.clientSecret);

    const token = await integrations.issueClientCredentialsToken({
      clientId: created.clientId, clientSecret: created.clientSecret,
      requestedScopes: ["courses.read"],
    }, new Date("2026-07-14T15:00:00Z"));
    expect(token.accessToken).toMatch(/^bqat_/);
    await expect(integrations.authenticateApiRequest(
      `Bearer ${token.accessToken}`, spaceId, "courses.read", new Date("2026-07-14T15:30:00Z"),
    )).resolves.toMatchObject({ clientId: created.clientId, spaceId, scope: "courses.read" });
    await expect(integrations.authenticateApiRequest(
      `Bearer ${token.accessToken}`, spaceId, "assignments.read", new Date("2026-07-14T15:30:00Z"),
    )).rejects.toMatchObject({ status: 403 });
    await expect(integrations.authenticateApiRequest(
      `Bearer ${token.accessToken}`, otherSpaceId, "courses.read", new Date("2026-07-14T15:30:00Z"),
    )).rejects.toMatchObject({ status: 403 });
    await expect(integrations.authenticateApiRequest(
      `Bearer ${token.accessToken}`, spaceId, "courses.read", new Date("2026-07-14T16:00:00Z"),
    )).rejects.toMatchObject({ status: 401 });
    await expect(integrations.issueClientCredentialsToken({
      clientId: created.clientId, clientSecret: `${created.clientSecret}x`,
    })).rejects.toMatchObject({ status: 401 });
    expect((await integrations.listApiCourses(spaceId))[0]).toMatchObject({
      id: String(courseId), title: "Integration sample", published: false,
    });
    expect(await integrations.listApiAssignments(spaceId)).toEqual([]);

    await integrations.revokeApiClient(ownerId, spaceId, created.id);
    await expect(integrations.authenticateApiRequest(
      `Bearer ${token.accessToken}`, spaceId, "courses.read", new Date("2026-07-14T15:30:00Z"),
    )).rejects.toMatchObject({ status: 401 });
    await expect(integrations.issueClientCredentialsToken({
      clientId: created.clientId, clientSecret: created.clientSecret,
    })).rejects.toMatchObject({ status: 401 });
    await expect(pg.q("UPDATE api_clients SET name='Changed' WHERE id=$1", [created.id]))
      .rejects.toThrow(/terminal/i);
  });

  it("rejects internal webhook destinations and hides encrypted signing secrets", async () => {
    await expect(integrations.createWebhookEndpoint(ownerId, spaceId, {
      url: "http://localhost:3000/internal", eventTypes: ["course.published"],
    })).rejects.toThrow(/public HTTPS/i);
    await expect(integrations.createWebhookEndpoint(outsiderId, spaceId, {
      url: "https://hooks.example.test/bookquest", eventTypes: ["course.published"],
    })).rejects.toThrow(/space access denied/i);
    const endpoint = await integrations.createWebhookEndpoint(ownerId, spaceId, {
      url: "https://hooks.example.test/bookquest",
      eventTypes: ["course.published", "credential.issued"],
    });
    webhookSigningSecret = endpoint.signingSecret;
    webhookEndpointId = endpoint.id;
    expect(endpoint.signingSecret).toMatch(/^bqwhsec_/);
    const listed = await integrations.listIntegrations(ownerId, spaceId);
    expect(listed.endpoints[0]).not.toHaveProperty("signingSecret");
    const stored = (await pg.q<{ secret_ciphertext: string }>(
      "SELECT secret_ciphertext FROM webhook_endpoints WHERE id=$1", [endpoint.id],
    )).rows[0];
    expect(stored.secret_ciphertext).not.toContain(endpoint.signingSecret);
  });

  it("serves the OAuth token contract and exact-scope versioned API routes", async () => {
    const created = await integrations.createApiClient(ownerId, spaceId, {
      name: "Course API route", scopes: ["courses.read"],
    });
    const oauth = await import("../app/api/oauth/token/route");
    const coursesRoute = await import("../app/api/v1/spaces/[id]/courses/route");
    const assignmentsRoute = await import("../app/api/v1/spaces/[id]/assignments/route");
    const basic = Buffer.from(`${created.clientId}:${created.clientSecret}`).toString("base64");
    const tokenResponse = await oauth.POST(new NextRequest("http://localhost/api/oauth/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=courses.read",
    }));
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.headers.get("cache-control")).toBe("no-store");
    const tokenBody = await tokenResponse.json();
    expect(tokenBody).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "courses.read" });
    const coursesResponse = await coursesRoute.GET(new NextRequest(
      `http://localhost/api/v1/spaces/${spaceId}/courses`,
      { headers: { Authorization: `Bearer ${tokenBody.access_token}` } },
    ), { params: Promise.resolve({ id: spaceId }) });
    expect(coursesResponse.status).toBe(200);
    expect(await coursesResponse.json()).toMatchObject({
      apiVersion: integrations.API_VERSION,
      data: [{ id: String(courseId), title: "Integration sample" }],
    });
    const denied = await assignmentsRoute.GET(new NextRequest(
      `http://localhost/api/v1/spaces/${spaceId}/assignments`,
      { headers: { Authorization: `Bearer ${tokenBody.access_token}` } },
    ), { params: Promise.resolve({ id: spaceId }) });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("www-authenticate")).toContain("insufficient_scope");
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
    const missing = await coursesRoute.GET(new NextRequest(
      `http://localhost/api/v1/spaces/${spaceId}/courses`,
    ), { params: Promise.resolve({ id: spaceId }) });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("signs one idempotent delivery and does not redeliver success", async () => {
    const occurredAt = "2026-07-14T15:10:00.000Z";
    const event = await pg.tx((client) => integrations.enqueueWebhookEvent(client, {
      spaceId, eventType: "course.published", resourceId: String(courseId),
      dedupeKey: `test-course:${courseId}:v1`, occurredAt,
      data: { spaceId, courseId: String(courseId), courseVersion: 1 },
    }));
    const duplicate = await pg.tx((client) => integrations.enqueueWebhookEvent(client, {
      spaceId, eventType: "course.published", resourceId: String(courseId),
      dedupeKey: `test-course:${courseId}:v1`, occurredAt,
      data: { shouldNotReplace: true },
    }));
    expect(duplicate.id).toBe(event.id);
    expect((await pg.q<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM webhook_deliveries WHERE webhook_event_id=$1", [event.id],
    )).rows[0].count).toBe(1);
    let captured: { url: string; init: RequestInit } | undefined;
    const deliveredAt = new Date("2026-07-14T15:10:01.000Z");
    const result = await integrations.deliverNextWebhook(async (url, init) => {
      captured = { url, init }; return { status: 204 };
    }, deliveredAt);
    expect(result).toMatchObject({ eventId: event.id, status: "succeeded" });
    expect(captured?.url).toBe("https://hooks.example.test/bookquest");
    const headers = captured?.init.headers as Record<string, string>;
    const body = String(captured?.init.body);
    const timestamp = Math.floor(deliveredAt.getTime() / 1000);
    expect(headers["Idempotency-Key"]).toBe(event.id);
    expect(headers["X-BookQuest-Event-Id"]).toBe(event.id);
    const endpoint = await integrations.listIntegrations(ownerId, spaceId);
    expect(endpoint.endpoints[0].status).toBe("active");
    const encrypted = (await pg.q<{
      id: string; secret_ciphertext: string; secret_iv: string; secret_auth_tag: string;
    }>("SELECT id,secret_ciphertext,secret_iv,secret_auth_tag FROM webhook_endpoints WHERE id=$1", [endpoint.endpoints[0].id])).rows[0];
    const expectedSignature = crypto.createHmac("sha256", webhookSigningSecret)
      .update(`${timestamp}.${event.id}.${body}`).digest("hex");
    expect(headers["X-BookQuest-Signature"]).toBe(`t=${timestamp},v1=${expectedSignature}`);
    expect(JSON.parse(body)).toMatchObject({ id: event.id, type: "course.published", apiVersion: integrations.API_VERSION });
    expect(encrypted.secret_ciphertext).not.toContain("bqwhsec_");
    await expect(integrations.deliverNextWebhook(async () => ({ status: 204 }), deliveredAt)).resolves.toBeNull();
  });

  it("retries failed deliveries with the same event identity and capped backoff", async () => {
    const occurredAt = "2026-07-14T15:20:00.000Z";
    const event = await pg.tx((client) => integrations.enqueueWebhookEvent(client, {
      spaceId, eventType: "credential.issued", resourceId: "credential-test",
      dedupeKey: "credential.issued:credential-test", occurredAt,
      data: { spaceId, credentialId: "credential-test" },
    }));
    const seen: string[] = [];
    const failed = await integrations.deliverNextWebhook(async (_url, init) => {
      seen.push((init.headers as Record<string, string>)["Idempotency-Key"]); return { status: 503 };
    }, new Date("2026-07-14T15:20:01.000Z"));
    expect(failed).toMatchObject({ eventId: event.id, status: "failed" });
    await expect(integrations.deliverNextWebhook(async () => ({ status: 204 }), new Date("2026-07-14T15:20:20.000Z")))
      .resolves.toBeNull();
    const succeeded = await integrations.deliverNextWebhook(async (_url, init) => {
      seen.push((init.headers as Record<string, string>)["Idempotency-Key"]); return { status: 204 };
    }, new Date("2026-07-14T15:20:32.000Z"));
    expect(succeeded).toMatchObject({ eventId: event.id, status: "succeeded" });
    expect(seen).toEqual([event.id, event.id]);
    await integrations.revokeWebhookEndpoint(ownerId, spaceId, webhookEndpointId);
    await expect(pg.q("UPDATE webhook_endpoints SET url='https://changed.example.test' WHERE id=$1", [webhookEndpointId]))
      .rejects.toThrow(/terminal/i);
  });
});
