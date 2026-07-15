import crypto, { type JsonWebKey } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let studio: typeof import("../lib/studio");
let lti: typeof import("../lib/lti");
let privacy: typeof import("../lib/privacy");
let ownerId: number;
let learnerId: number;
let outsiderId: number;
let spaceId: string;
let courseId: number;
let registration: Awaited<ReturnType<typeof import("../lib/lti").createLtiRegistration>>;
let privateKey: crypto.KeyObject;
let publicJwk: JsonWebKey;

const issuer = "https://lms.example.test";
const clientId = "bookquest-client-123";
const deploymentId = "deployment-blacksteel-pilot";
const origin = "http://localhost:3000";
const targetLinkUri = `${origin}/api/lti/launch`;
const at = new Date("2026-07-14T16:00:00.000Z");

function signedToken(nonce: string, overrides: Record<string, unknown> = {}) {
  const header = { alg: "RS256", kid: "platform-key-1", typ: "JWT" };
  const payload = {
    iss: issuer, aud: clientId, sub: "platform-user-42",
    iat: Math.floor(at.getTime() / 1000), exp: Math.floor(at.getTime() / 1000) + 300,
    nonce,
    "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
    "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiResourceLinkRequest",
    "https://purl.imsglobal.org/spec/lti/claim/deployment_id": deploymentId,
    "https://purl.imsglobal.org/spec/lti/claim/target_link_uri": targetLinkUri,
    "https://purl.imsglobal.org/spec/lti/claim/resource_link": { id: "resource-link-7" },
    "https://purl.imsglobal.org/spec/lti/claim/context": { id: "context-2026" },
    "https://purl.imsglobal.org/spec/lti/claim/roles": ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
    "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint": {
      scope: ["https://purl.imsglobal.org/spec/lti-ags/scope/score"],
      lineitem: "https://lms.example.test/api/lineitems/7",
    },
    ...overrides,
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  return `${signingInput}.${crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url")}`;
}

const jwksFetcher = async () => ({
  ok: true,
  text: async () => JSON.stringify({ keys: [publicJwk] }),
});

async function initiated(subjectHint = "opaque-login-hint") {
  const value = await lti.initiateLtiLogin({
    issuer, loginHint: subjectHint, targetLinkUri, clientId, deploymentId,
    ltiMessageHint: "opaque-message-hint",
  }, origin, at);
  const redirect = new URL(value.redirectUrl);
  return { value, redirect, state: redirect.searchParams.get("state")!, nonce: redirect.searchParams.get("nonce")! };
}

describe.skipIf(!TEST_DB)("LTI 1.3 secure launch foundation", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.GENERATION_SECRET = "lti-test-subject-key";
    pg = await import("../lib/pg"); db = await import("../lib/db");
    spaces = await import("../lib/spaces"); studio = await import("../lib/studio");
    lti = await import("../lib/lti"); privacy = await import("../lib/privacy");
    await pg.ready(); await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("lti-owner@example.test", "LTI Owner", "hash")).id;
    learnerId = (await db.createUser("lti-learner@example.test", "LTI Learner", "hash")).id;
    outsiderId = (await db.createUser("lti-outsider@example.test", "LTI Outsider", "hash")).id;
    const createdSpace = await spaces.createSpace(ownerId, { name: "LTI Pilot Space", type: "organization" });
    spaceId = createdSpace.space.id;
    await pg.q(
      `INSERT INTO space_memberships
        (space_id,user_id,status,role,policy_version,joined_at)
       VALUES ($1,$2,'active','learner',$3,$4)`,
      [spaceId, learnerId, createdSpace.space.policy_version, at.toISOString()],
    );
    const source = await studio.createTextSource(ownerId, spaceId, {
      title: "LTI source", kind: "manual", content: [{ title: "Launch", text: "Open the course from the LMS." }],
    });
    courseId = (await studio.createCourseDraftFromSources(ownerId, spaceId, {
      title: "LTI launch sample", sourceVersionIds: [source.sourceVersionId],
    })).courseId;
    await spaces.attachCourseToSpace(ownerId, spaceId, courseId);
    const pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    privateKey = pair.privateKey;
    publicJwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "platform-key-1", alg: "RS256", use: "sig" };
  });

  afterAll(async () => {
    await pg?.pool.end(); delete process.env.DATABASE_URL; delete process.env.GENERATION_SECRET;
  });

  it("registers one exact tenant deployment and rejects unsafe or cross-tenant configuration", async () => {
    const input = {
      courseId, issuer, clientId, deploymentId,
      authorizationEndpoint: "https://lms.example.test/oidc/auth",
      tokenEndpoint: "https://lms.example.test/oauth/token",
      jwksUrl: "https://lms.example.test/.well-known/jwks.json",
    };
    await expect(lti.createLtiRegistration(outsiderId, spaceId, input)).rejects.toThrow(/space access denied/i);
    await expect(lti.createLtiRegistration(ownerId, spaceId, {
      ...input, jwksUrl: "https://127.0.0.1/jwks.json",
    })).rejects.toThrow(/public HTTPS/i);
    registration = await lti.createLtiRegistration(ownerId, spaceId, input);
    expect(registration).toMatchObject({ spaceId, courseId, issuer, clientId, deploymentId, status: "active" });
    await expect(lti.createLtiRegistration(ownerId, spaceId, input)).rejects.toThrow(/already registered/i);
    expect((await lti.listLtiRegistrations(ownerId, spaceId)).registrations).toHaveLength(1);
  });

  it("performs OIDC initiation with single-use state, nonce and exact registered redirect", async () => {
    const launch = await initiated();
    expect(launch.redirect.origin + launch.redirect.pathname).toBe("https://lms.example.test/oidc/auth");
    expect(launch.redirect.searchParams.get("scope")).toBe("openid");
    expect(launch.redirect.searchParams.get("response_type")).toBe("id_token");
    expect(launch.redirect.searchParams.get("response_mode")).toBe("form_post");
    expect(launch.redirect.searchParams.get("redirect_uri")).toBe(`${origin}/api/lti/launch`);
    expect(launch.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(launch.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(lti.initiateLtiLogin({
      issuer, loginHint: "hint", targetLinkUri: "https://evil.example.test/api/lti/launch", clientId, deploymentId,
    }, origin, at)).rejects.toThrow(/unavailable/i);
  });

  it("fails closed for forgery and claim substitution without burning a valid state", async () => {
    const launch = await initiated("forgery-case");
    const wrongDeployment = signedToken(launch.nonce, {
      "https://purl.imsglobal.org/spec/lti/claim/deployment_id": "wrong-deployment",
    });
    await expect(lti.validateLtiLaunch(launch.state, wrongDeployment, origin, at, jwksFetcher))
      .rejects.toThrow(/unavailable/i);
    const valid = signedToken(launch.nonce);
    const forged = `${valid.slice(0, -1)}${valid.endsWith("A") ? "B" : "A"}`;
    await expect(lti.validateLtiLaunch(launch.state, forged, origin, at, jwksFetcher))
      .rejects.toThrow(/unavailable/i);
    await expect(lti.validateLtiLaunch(launch.state, valid, origin, at, jwksFetcher))
      .resolves.toMatchObject({ redirectPath: expect.stringMatching(/^\/lti\/launch\?ticket=/) });
    await expect(lti.validateLtiLaunch(launch.state, valid, origin, at, jwksFetcher))
      .rejects.toThrow(/unavailable/i);
  });

  it("links only an existing Space learner and never trusts LMS roles for authorization", async () => {
    const launch = await initiated("account-link-case");
    const validated = await lti.validateLtiLaunch(launch.state, signedToken(launch.nonce), origin, at, jwksFetcher);
    const ticket = new URL(validated.redirectPath, origin).searchParams.get("ticket")!;
    await expect(lti.completeLtiLaunch(outsiderId, ticket, at)).rejects.toThrow(/unavailable/i);
    const completed = await lti.completeLtiLaunch(learnerId, ticket, at);
    expect(completed).toMatchObject({
      courseId, spaceId, resourceLinkId: "resource-link-7",
      advantage: { scorePassbackOffered: true },
    });
    await expect(lti.completeLtiLaunch(learnerId, ticket, at)).rejects.toThrow(/unavailable/i);
    const link = (await pg.q<{ subject_hash: string }>(
      "SELECT subject_hash FROM lti_user_links WHERE registration_id=$1 AND user_id=$2",
      [registration.id, learnerId],
    )).rows[0];
    expect(link.subject_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(link.subject_hash).not.toContain("platform-user-42");
    const exported = await privacy.createAccountExport(learnerId);
    expect(exported.schemaVersion).toBe(10);
    expect(exported.learning.ltiLinks).toMatchObject([{ registration_id: registration.id, subject_hash: link.subject_hash }]);
  });

  it("blocks a second BookQuest account from claiming an already-linked LMS subject", async () => {
    const policy = (await spaces.getSpace(spaceId))!.policy_version;
    await pg.q(
      `INSERT INTO space_memberships
        (space_id,user_id,status,role,policy_version,joined_at)
       VALUES ($1,$2,'active','learner',$3,$4)`, [spaceId, outsiderId, policy, at.toISOString()],
    );
    const launch = await initiated("second-account-case");
    const validated = await lti.validateLtiLaunch(launch.state, signedToken(launch.nonce), origin, at, jwksFetcher);
    const ticket = new URL(validated.redirectPath, origin).searchParams.get("ticket")!;
    await expect(lti.completeLtiLaunch(outsiderId, ticket, at)).rejects.toThrow(/different account/i);
  });

  it("revocation blocks future initiation and account erasure removes the identity link", async () => {
    await pg.q(
      `UPDATE users SET account_status='deletion_scheduled',deletion_scheduled_at=$2 WHERE id=$1`,
      [learnerId, new Date(at.getTime() - 1000).toISOString()],
    );
    expect(await privacy.processDueAccountErasures(at)).toContain(learnerId);
    expect((await pg.q<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM lti_user_links WHERE user_id=$1", [learnerId],
    )).rows[0].count).toBe(0);
    await lti.revokeLtiRegistration(ownerId, spaceId, registration.id);
    await expect(initiated("after-revoke")).rejects.toThrow(/unavailable/i);
    await expect(pg.q("UPDATE lti_registrations SET client_id='changed' WHERE id=$1", [registration.id]))
      .rejects.toThrow(/terminal/i);
  });
});
