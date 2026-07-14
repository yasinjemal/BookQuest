import crypto, { type JsonWebKey } from "crypto";
import { isIP } from "net";
import { one, tx, type Queryable } from "./pg";
import { authorizeStoredMembership, SpaceConflictError } from "./spaces";

const LTI_VERSION = "https://purl.imsglobal.org/spec/lti/claim/version";
const MESSAGE_TYPE = "https://purl.imsglobal.org/spec/lti/claim/message_type";
const DEPLOYMENT_ID = "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const TARGET_LINK_URI = "https://purl.imsglobal.org/spec/lti/claim/target_link_uri";
const RESOURCE_LINK = "https://purl.imsglobal.org/spec/lti/claim/resource_link";
const ROLES = "https://purl.imsglobal.org/spec/lti/claim/roles";
const CONTEXT = "https://purl.imsglobal.org/spec/lti/claim/context";
const AGS_ENDPOINT = "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint";
export const AGS_SCORE_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/score";

const digest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export class LtiError extends Error {
  constructor(message = "LTI launch unavailable") {
    super(message);
    this.name = "LtiError";
  }
}

function publicHttps(value: string, label: string, issuer = false) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new SpaceConflictError(`${label} must be a valid HTTPS URL`); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash
      || isIP(host) !== 0 || host === "localhost" || host.endsWith(".localhost")
      || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")
      || (issuer && url.search) || url.href.length > 1000) {
    throw new SpaceConflictError(`${label} must be a public HTTPS URL`);
  }
  return issuer ? value.trim() : url.href;
}

function canonicalOrigin(requestOrigin: string) {
  const value = new URL(process.env.APP_URL?.trim() || requestOrigin).origin;
  if (process.env.NODE_ENV === "production" && !value.startsWith("https://")) {
    throw new Error("LTI requires an HTTPS APP_URL");
  }
  return value;
}

function subjectHash(registrationId: string, subject: string) {
  const material = process.env.LTI_SUBJECT_HASH_KEY || process.env.GENERATION_SECRET;
  if (!material && process.env.NODE_ENV === "production") {
    throw new Error("LTI_SUBJECT_HASH_KEY or GENERATION_SECRET is required in production");
  }
  return crypto.createHmac("sha256", material || "bookquest-local-lti-subject")
    .update(`${registrationId}:${subject}`).digest("hex");
}

type RegistrationRow = {
  id: string; space_id: string; course_id: number; issuer: string; client_id: string;
  deployment_id: string; authorization_endpoint: string; token_endpoint: string;
  jwks_url: string; status: "active" | "revoked"; created_at: string; revoked_at: string | null;
};

function publicRegistration(row: RegistrationRow) {
  return {
    id: row.id, spaceId: row.space_id, courseId: row.course_id, issuer: row.issuer,
    clientId: row.client_id, deploymentId: row.deployment_id,
    authorizationEndpoint: row.authorization_endpoint, tokenEndpoint: row.token_endpoint,
    jwksUrl: row.jwks_url, status: row.status, createdAt: row.created_at, revokedAt: row.revoked_at,
  };
}

export async function listLtiRegistrations(actorUserId: number, spaceId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const registrations = (await client.query<RegistrationRow>(
      "SELECT * FROM lti_registrations WHERE space_id=$1 ORDER BY created_at DESC", [spaceId],
    )).rows.map(publicRegistration);
    const courses = (await client.query<{ id: number; title: string; content_version: number }>(
      `SELECT course.id,course.title,course.content_version
       FROM space_courses link JOIN courses course ON course.id=link.course_id
       WHERE link.space_id=$1 ORDER BY course.title,course.id`, [spaceId],
    )).rows;
    return { registrations, courses };
  });
}

export async function createLtiRegistration(actorUserId: number, spaceId: string, input: {
  courseId: number; issuer: string; clientId: string; deploymentId: string;
  authorizationEndpoint: string; tokenEndpoint: string; jwksUrl: string;
}) {
  const issuer = publicHttps(input.issuer, "Issuer", true);
  const authorizationEndpoint = publicHttps(input.authorizationEndpoint, "Authorization endpoint");
  const tokenEndpoint = publicHttps(input.tokenEndpoint, "Token endpoint");
  const jwksUrl = publicHttps(input.jwksUrl, "JWKS URL");
  const clientId = input.clientId.trim(); const deploymentId = input.deploymentId.trim();
  if (!Number.isInteger(input.courseId) || input.courseId <= 0
      || !clientId || clientId.length > 255 || !deploymentId || deploymentId.length > 255) {
    throw new SpaceConflictError("Course, client ID and deployment ID are required");
  }
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const attached = (await client.query(
      "SELECT 1 FROM space_courses WHERE space_id=$1 AND course_id=$2", [spaceId, input.courseId],
    )).rows[0];
    if (!attached) throw new SpaceConflictError("Choose a course attached to this Space");
    try {
      const row = (await client.query<RegistrationRow>(
        `INSERT INTO lti_registrations
          (space_id,course_id,issuer,client_id,deployment_id,authorization_endpoint,
           token_endpoint,jwks_url,created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [spaceId, input.courseId, issuer, clientId, deploymentId, authorizationEndpoint,
         tokenEndpoint, jwksUrl, actorUserId],
      )).rows[0];
      return publicRegistration(row);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new SpaceConflictError("This LTI deployment is already registered");
      throw error;
    }
  });
}

export async function revokeLtiRegistration(actorUserId: number, spaceId: string, registrationId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(actorUserId, spaceId, "space.manage_policy", client);
    const at = new Date().toISOString();
    const row = (await client.query<{ id: string }>(
      `UPDATE lti_registrations SET status='revoked',revoked_at=$3
       WHERE id=$1 AND space_id=$2 AND status='active' RETURNING id`,
      [registrationId, spaceId, at],
    )).rows[0];
    if (!row) throw new SpaceConflictError("Active LTI registration not found");
    return { id: row.id, status: "revoked" as const, revokedAt: at };
  });
}

export async function initiateLtiLogin(input: {
  issuer: string; loginHint: string; targetLinkUri: string; clientId?: string;
  deploymentId?: string; ltiMessageHint?: string;
}, requestOrigin: string, at = new Date()) {
  if (!input.loginHint || input.loginHint.length > 2000 || input.targetLinkUri.length > 2000) throw new LtiError();
  let issuer: string;
  try { issuer = publicHttps(input.issuer, "Issuer", true); } catch { throw new LtiError(); }
  const registrations = await tx(async (client) => (await client.query<RegistrationRow>(
    `SELECT * FROM lti_registrations WHERE issuer=$1 AND status='active'
       AND ($2::text IS NULL OR client_id=$2)
       AND ($3::text IS NULL OR deployment_id=$3)
     ORDER BY created_at`, [issuer, input.clientId || null, input.deploymentId || null],
  )).rows);
  if (registrations.length !== 1) throw new LtiError();
  const registration = registrations[0];
  const origin = canonicalOrigin(requestOrigin);
  const launchUrl = `${origin}/api/lti/launch`;
  try {
    const target = new URL(input.targetLinkUri);
    if (target.origin !== origin || target.pathname !== "/api/lti/launch" || target.hash) throw new LtiError();
  } catch { throw new LtiError(); }
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  await tx(async (client) => client.query(
    `INSERT INTO lti_login_states
      (state_hash,registration_id,nonce_hash,target_link_uri,expires_at,created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [digest(state), registration.id, digest(nonce), input.targetLinkUri,
     new Date(at.getTime() + 10 * 60 * 1000).toISOString(), at.toISOString()],
  ));
  const redirect = new URL(registration.authorization_endpoint);
  redirect.searchParams.set("scope", "openid");
  redirect.searchParams.set("response_type", "id_token");
  redirect.searchParams.set("response_mode", "form_post");
  redirect.searchParams.set("prompt", "none");
  redirect.searchParams.set("client_id", registration.client_id);
  redirect.searchParams.set("redirect_uri", launchUrl);
  redirect.searchParams.set("login_hint", input.loginHint);
  redirect.searchParams.set("state", state);
  redirect.searchParams.set("nonce", nonce);
  if (input.ltiMessageHint) redirect.searchParams.set("lti_message_hint", input.ltiMessageHint);
  return { redirectUrl: redirect.toString(), registrationId: registration.id };
}

function parseJwt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3 || value.length > 100_000 || parts.some((part) => !part)) throw new LtiError();
  try {
    const decoded = parts.map((part) => Buffer.from(part, "base64url"));
    if (decoded.some((part, index) => part.toString("base64url") !== parts[index])) throw new LtiError();
    return {
      header: JSON.parse(decoded[0].toString("utf8")) as Record<string, unknown>,
      payload: JSON.parse(decoded[1].toString("utf8")) as Record<string, unknown>,
      signingInput: `${parts[0]}.${parts[1]}`, signature: decoded[2],
    };
  } catch { throw new LtiError(); }
}

type JwksFetch = (input: string, init: RequestInit) => Promise<Pick<Response, "ok" | "text">>;

async function platformKey(registration: RegistrationRow, kid: string, fetcher: JwksFetch) {
  let response: Awaited<ReturnType<JwksFetch>>;
  try {
    response = await fetcher(registration.jwks_url, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json", "User-Agent": "BookQuest-LTI/1.0" },
    });
  } catch { throw new LtiError(); }
  if (!response.ok) throw new LtiError();
  const text = await response.text();
  if (text.length > 256 * 1024) throw new LtiError();
  let set: { keys?: JsonWebKey[] };
  try { set = JSON.parse(text) as { keys?: JsonWebKey[] }; } catch { throw new LtiError(); }
  const keys = Array.isArray(set.keys) ? set.keys : [];
  const key = keys.find((item) => item.kid === kid && item.kty === "RSA"
    && (!item.alg || item.alg === "RS256") && (!item.use || item.use === "sig"));
  if (!key || keys.filter((item) => item.kid === kid).length !== 1) throw new LtiError();
  try { return crypto.createPublicKey({ key, format: "jwk" }); }
  catch { throw new LtiError(); }
}

function stringClaim(value: unknown, max = 255) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

export async function validateLtiLaunch(
  state: string,
  idToken: string,
  requestOrigin: string,
  at = new Date(),
  fetcher: JwksFetch = fetch,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new LtiError();
  const stateRow = await one<{
    state_hash: string; registration_id: string; nonce_hash: string; target_link_uri: string;
    expires_at: string; consumed_at: string | null;
  }>("SELECT * FROM lti_login_states WHERE state_hash=$1", [digest(state)]);
  if (!stateRow || stateRow.consumed_at || Date.parse(stateRow.expires_at) <= at.getTime()) throw new LtiError();
  const registration = await one<RegistrationRow>(
    "SELECT * FROM lti_registrations WHERE id=$1 AND status='active'", [stateRow.registration_id],
  );
  if (!registration) throw new LtiError();
  const parsed = parseJwt(idToken);
  if (parsed.header.alg !== "RS256" || typeof parsed.header.kid !== "string"
      || (parsed.header.typ !== undefined && parsed.header.typ !== "JWT")
      || Object.keys(parsed.header).some((key) => !["alg", "kid", "typ"].includes(key))) throw new LtiError();
  const key = await platformKey(registration, parsed.header.kid, fetcher);
  if (!crypto.verify("RSA-SHA256", Buffer.from(parsed.signingInput), key, parsed.signature)) throw new LtiError();
  const payload = parsed.payload;
  const aud = payload.aud;
  if (payload.iss !== registration.issuer
      || !((aud === registration.client_id) || (Array.isArray(aud) && aud.length === 1 && aud[0] === registration.client_id))
      || (payload.azp !== undefined && payload.azp !== registration.client_id)
      || typeof payload.exp !== "number" || payload.exp * 1000 <= at.getTime()
      || typeof payload.iat !== "number" || Math.abs(payload.iat * 1000 - at.getTime()) > 5 * 60 * 1000
      || typeof payload.nonce !== "string" || digest(payload.nonce) !== stateRow.nonce_hash) throw new LtiError();
  const target = stringClaim(payload[TARGET_LINK_URI], 2000);
  const deployment = stringClaim(payload[DEPLOYMENT_ID]);
  const subject = stringClaim(payload.sub);
  const resource = payload[RESOURCE_LINK] as Record<string, unknown> | undefined;
  const resourceLinkId = stringClaim(resource?.id);
  const roles = payload[ROLES];
  let targetOrigin = "";
  try { targetOrigin = target ? new URL(target).origin : ""; } catch { throw new LtiError(); }
  if (payload[LTI_VERSION] !== "1.3.0" || payload[MESSAGE_TYPE] !== "LtiResourceLinkRequest"
      || deployment !== registration.deployment_id || target !== stateRow.target_link_uri
      || targetOrigin !== canonicalOrigin(requestOrigin)
      || !subject || !resourceLinkId || !Array.isArray(roles)
      || roles.length === 0 || roles.length > 50 || roles.some((role) => typeof role !== "string" || role.length > 500)) {
    throw new LtiError();
  }
  const context = payload[CONTEXT] as Record<string, unknown> | undefined;
  const contextId = context?.id === undefined ? null : stringClaim(context.id);
  if (context?.id !== undefined && !contextId) throw new LtiError();
  const ags = payload[AGS_ENDPOINT] as Record<string, unknown> | undefined;
  let agsLineitemUrl: string | null = null; let agsScopes: string[] = [];
  if (ags !== undefined) {
    const scopes = ags.scope;
    if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== "string")) throw new LtiError();
    agsScopes = [...new Set(scopes as string[])].filter((scope) => scope === AGS_SCORE_SCOPE);
    if (agsScopes.length && typeof ags.lineitem === "string") {
      try { agsLineitemUrl = publicHttps(ags.lineitem, "AGS line item"); } catch { throw new LtiError(); }
    }
  }
  const ticket = crypto.randomBytes(32).toString("base64url");
  await tx(async (client) => {
    const consumed = (await client.query(
      `UPDATE lti_login_states SET consumed_at=$2
       WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at::timestamptz>$2::timestamptz RETURNING 1`,
      [stateRow.state_hash, at.toISOString()],
    )).rows[0];
    if (!consumed) throw new LtiError();
    await client.query(
      `INSERT INTO lti_launch_tickets
        (ticket_hash,registration_id,subject_hash,resource_link_id,context_id,roles_json,
         ags_lineitem_url,ags_scopes_json,expires_at,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [digest(ticket), registration.id, subjectHash(registration.id, subject), resourceLinkId,
       contextId, JSON.stringify(roles), agsLineitemUrl, JSON.stringify(agsScopes),
       new Date(at.getTime() + 10 * 60 * 1000).toISOString(), at.toISOString()],
    );
  });
  return { redirectPath: `/lti/launch?ticket=${encodeURIComponent(ticket)}` };
}

export async function completeLtiLaunch(userId: number, ticket: string, at = new Date()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new LtiError();
  return tx(async (client) => {
    const row = (await client.query<{
      ticket_hash: string; registration_id: string; subject_hash: string; resource_link_id: string;
      context_id: string | null; roles_json: string; ags_lineitem_url: string | null;
      ags_scopes_json: string; course_id: number; space_id: string;
    }>(
      `SELECT ticket.ticket_hash,ticket.registration_id,ticket.subject_hash,
              ticket.resource_link_id,ticket.context_id,ticket.roles_json,
              ticket.ags_lineitem_url,ticket.ags_scopes_json,
              registration.course_id,registration.space_id
       FROM lti_launch_tickets ticket
       JOIN lti_registrations registration ON registration.id=ticket.registration_id
       JOIN users learner ON learner.id=$2 AND learner.account_status='active'
       WHERE ticket.ticket_hash=$1 AND ticket.status='pending'
         AND ticket.expires_at::timestamptz>$3::timestamptz
         AND registration.status='active' FOR UPDATE OF ticket`,
      [digest(ticket), userId, at.toISOString()],
    )).rows[0];
    if (!row) throw new LtiError();
    try { await authorizeStoredMembership(userId, row.space_id, "learning.participate", client); }
    catch { throw new LtiError(); }
    const links = (await client.query<{ subject_hash: string; user_id: number }>(
      `SELECT subject_hash,user_id FROM lti_user_links
       WHERE registration_id=$1 AND (subject_hash=$2 OR user_id=$3) FOR UPDATE`,
      [row.registration_id, row.subject_hash, userId],
    )).rows;
    if (links.some((link) => link.subject_hash !== row.subject_hash || Number(link.user_id) !== userId)) {
      throw new LtiError("This LMS identity is linked to a different account");
    }
    if (!links.length) {
      await client.query(
        `INSERT INTO lti_user_links (registration_id,subject_hash,user_id)
         VALUES ($1,$2,$3)`, [row.registration_id, row.subject_hash, userId],
      );
    }
    const consumed = (await client.query(
      `UPDATE lti_launch_tickets SET status='consumed',consumed_by_user_id=$2,consumed_at=$3
       WHERE ticket_hash=$1 AND status='pending' RETURNING 1`,
      [row.ticket_hash, userId, at.toISOString()],
    )).rows[0];
    if (!consumed) throw new LtiError();
    const agsScopes = JSON.parse(row.ags_scopes_json) as string[];
    return {
      courseId: row.course_id, spaceId: row.space_id, resourceLinkId: row.resource_link_id,
      contextId: row.context_id, roles: JSON.parse(row.roles_json) as string[],
      advantage: { scorePassbackOffered: Boolean(row.ags_lineitem_url && agsScopes.includes(AGS_SCORE_SCOPE)) },
    };
  });
}

export async function purgeExpiredLtiArtifacts(exec: Queryable, at = new Date()) {
  const cutoff = new Date(at.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const states = await exec.query("DELETE FROM lti_login_states WHERE expires_at::timestamptz<$1 RETURNING 1", [cutoff]);
  const tickets = await exec.query("DELETE FROM lti_launch_tickets WHERE expires_at::timestamptz<$1 RETURNING 1", [cutoff]);
  return { states: states.rowCount ?? 0, tickets: tickets.rowCount ?? 0 };
}
