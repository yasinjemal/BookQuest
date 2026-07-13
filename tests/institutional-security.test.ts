import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let mfa: typeof import("../lib/mfa");
let policies: typeof import("../lib/organization-policies");
let accountSecurity: typeof import("../lib/account-security");
let accountSecurityCore: typeof import("../lib/account-security-core");
let pilot: typeof import("../lib/institutional-pilot");
let ownerId: number;
let managerId: number;
let outsiderId: number;
let spaceId: string;
let methodSecret: string;
let recoveryCodes: string[];
let publishedPolicyId: string;
let bulkLearnerId: number;
let bulkAuditorId: number;
const wrongCode = (code: string) => `${code.slice(0, 5)}${code[5] === "9" ? "0" : Number(code[5]) + 1}`;

describe.skipIf(!TEST_DB)("Phase 3 institutional security controls", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.MFA_ENCRYPTION_KEY = "phase3-test-mfa-encryption-key";
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    mfa = await import("../lib/mfa");
    policies = await import("../lib/organization-policies");
    accountSecurity = await import("../lib/account-security");
    accountSecurityCore = await import("../lib/account-security-core");
    pilot = await import("../lib/institutional-pilot");
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("security-owner@example.test", "Security Owner", "hash")).id;
    managerId = (await db.createUser("security-manager@example.test", "Security Manager", "hash")).id;
    outsiderId = (await db.createUser("security-outsider@example.test", "Security Outsider", "hash")).id;
    bulkLearnerId = (await db.createUser("bulk-learner@example.test", "Bulk Learner", "hash")).id;
    bulkAuditorId = (await db.createUser("bulk-auditor@example.test", "Bulk Auditor", "hash")).id;
    spaceId = (await spaces.createSpace(ownerId, { name: "Security Organization", type: "organization" })).space.id;
    const managerInvite = await spaces.inviteSpaceMember(ownerId, spaceId, managerId, "manager");
    await spaces.acceptSpaceInvitation(managerId, managerInvite.token);
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
    delete process.env.MFA_ENCRYPTION_KEY;
  });

  it("enrolls TOTP and returns recovery codes only after proof", async () => {
    const enrollment = await mfa.beginTotpEnrollment(ownerId, "security-owner@example.test");
    methodSecret = enrollment.secret;
    expect(enrollment.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    await expect(mfa.confirmTotpEnrollment(ownerId, wrongCode(mfa.totpCode(methodSecret)))).rejects.toThrow(/invalid/i);
    const confirmed = await mfa.confirmTotpEnrollment(ownerId, mfa.totpCode(methodSecret));
    recoveryCodes = confirmed.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    expect(await mfa.hasActiveMfa(ownerId)).toBe(true);
    const stored = await pg.one<{ secret_ciphertext: string }>(
      "SELECT secret_ciphertext FROM user_mfa_methods WHERE user_id=$1",
      [ownerId]
    );
    expect(stored?.secret_ciphertext).not.toContain(methodSecret);
  });

  it("creates bulk invitations atomically with role-scoped records", async () => {
    await expect(spaces.bulkInviteSpaceMembers(ownerId, spaceId, [
      { email: "bulk-learner@example.test", role: "learner" },
      { email: "missing@example.test", role: "auditor" },
    ])).rejects.toThrow(/no account/i);
    expect(await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM space_invitations WHERE space_id=$1 AND invitee_user_id=$2",
      [spaceId, bulkLearnerId]
    )).toEqual({ count: 0 });
    const invitations = await spaces.bulkInviteSpaceMembers(ownerId, spaceId, [
      { email: "bulk-learner@example.test", role: "learner" },
      { email: "bulk-auditor@example.test", role: "auditor" },
    ]);
    expect(invitations).toHaveLength(2);
    await spaces.acceptSpaceInvitation(bulkLearnerId, invitations[0].token);
    await spaces.acceptSpaceInvitation(bulkAuditorId, invitations[1].token);
    expect(await pg.one<{ learner_role: string; auditor_role: string }>(
      `SELECT
        (SELECT role FROM space_memberships WHERE space_id=$1 AND user_id=$2) AS learner_role,
        (SELECT role FROM space_memberships WHERE space_id=$1 AND user_id=$3) AS auditor_role`,
      [spaceId, bulkLearnerId, bulkAuditorId]
    )).toEqual({ learner_role: "learner", auditor_role: "auditor" });
  });

  it("requires a one-time login challenge and consumes recovery codes once", async () => {
    const challenge = await mfa.createLoginMfaChallenge(ownerId);
    await expect(mfa.consumeLoginMfaChallenge(challenge, wrongCode(mfa.totpCode(methodSecret)))).rejects.toThrow(/invalid/i);
    expect(await mfa.consumeLoginMfaChallenge(challenge, mfa.totpCode(methodSecret))).toEqual({ userId: ownerId });
    await expect(mfa.consumeLoginMfaChallenge(challenge, mfa.totpCode(methodSecret))).rejects.toThrow(/invalid or expired/i);
    const recoveryChallenge = await mfa.createLoginMfaChallenge(ownerId);
    expect(await mfa.consumeLoginMfaChallenge(recoveryChallenge, recoveryCodes[0])).toEqual({ userId: ownerId });
    const replayChallenge = await mfa.createLoginMfaChallenge(ownerId);
    await expect(mfa.consumeLoginMfaChallenge(replayChallenge, recoveryCodes[0])).rejects.toThrow(/invalid/i);
  });

  it("publishes an immutable policy, rejects unenrolled required roles and revokes old sessions", async () => {
    await db.createSession(ownerId, "policy-session-token");
    await expect(policies.publishOrganizationPolicy(ownerId, spaceId, {
      minimumPasswordLength: 14,
      sessionMaxDays: 7,
      requireMfaRoles: ["owner", "manager"],
      retentionDays: 2555,
      legalHoldEnabled: true,
    })).rejects.toThrow(/every affected member/i);
    const published = await policies.publishOrganizationPolicy(ownerId, spaceId, {
      minimumPasswordLength: 14,
      sessionMaxDays: 7,
      requireMfaRoles: ["owner"],
      retentionDays: 2555,
      legalHoldEnabled: true,
    });
    publishedPolicyId = published.id;
    expect(published).toMatchObject({ version: 2, policy: { session_max_days: 7 } });
    expect(await db.getSessionUser("policy-session-token")).toBeUndefined();
    expect(await policies.getUserAuthenticationPolicy(ownerId)).toEqual({
      minimumPasswordLength: 14,
      sessionMaxDays: 7,
      requireMfa: true,
    });
    const resetToken = accountSecurityCore.newAccountToken();
    await db.createAccountToken(
      ownerId,
      "reset_password",
      accountSecurityCore.hashAccountToken(resetToken),
      new Date(Date.now() + 60_000).toISOString()
    );
    expect(await accountSecurity.confirmPasswordReset(resetToken, "shortpass"))
      .toEqual({ error: "Password must be at least 14 characters for your organization." });
    expect(await accountSecurity.confirmPasswordReset(resetToken, "long-secure-password"))
      .toEqual({ ok: true });
    await expect(pg.q("UPDATE space_policy_versions SET policy_json='{}' WHERE id=$1", [publishedPolicyId]))
      .rejects.toThrow(/immutable/i);
    await expect(policies.publishOrganizationPolicy(outsiderId, spaceId, {
      minimumPasswordLength: 12, sessionMaxDays: 30, requireMfaRoles: [],
      retentionDays: 365, legalHoldEnabled: true,
    })).rejects.toMatchObject({ reason: "membership_required" });
  });

  it("creates and releases a scoped legal hold with cross-tenant denial", async () => {
    const hold = await policies.createLegalHold(ownerId, spaceId, {
      reason: "Pending regulator evidence request",
      scope: { type: "space" },
    });
    expect(hold).toMatchObject({ status: "active" });
    await expect(spaces.updateSpaceLifecycle(ownerId, spaceId, "deletion_scheduled"))
      .rejects.toThrow(/legal holds/i);
    await expect(policies.releaseLegalHold(outsiderId, spaceId, hold.id, "Not allowed"))
      .rejects.toMatchObject({ reason: "membership_required" });
    expect(await policies.releaseLegalHold(ownerId, spaceId, hold.id, "Request closed"))
      .toMatchObject({ status: "released", release_reason: "Request closed" });
  });

  it("versions the governed pilot plan and refuses unsupported closure", async () => {
    const plan = {
      partnerDisplayName: "Security Design Partner",
      sector: "Public services",
      identityProviderRequirement: "oidc" as const,
      scimRequired: false,
      baseline: {
        description: "Administrators manually assemble training records in spreadsheets and email completion evidence.",
        uploadToAssignmentMinutes: 95,
        adminHoursPerCohort: 8,
      },
      successCriteria: [
        { metric: "Upload to assignment", target: "Under 30 minutes" },
        { metric: "Audit corrections", target: "No material corrections" },
      ],
    };
    expect(await pilot.createInstitutionalPilot(ownerId, spaceId, plan)).toMatchObject({
      status: "active",
      planVersion: 1,
    });
    expect(await pilot.reviseInstitutionalPilotPlan(ownerId, spaceId, {
      ...plan,
      successCriteria: [...plan.successCriteria, { metric: "Support", target: "At most one request" }],
    })).toMatchObject({ planVersion: 2 });
    await expect(pilot.reviseInstitutionalPilotPlan(outsiderId, spaceId, plan))
      .rejects.toMatchObject({ reason: "membership_required" });
    expect(await pilot.recordInstitutionalPilotObservation(managerId, spaceId, {
      observationType: "admin_journey",
      participantKey: "admin-001",
      summary: "The administrator completed setup but still needed a documented source-review explanation.",
      supportNeeds: ["Explain source-coverage warnings"],
      minutesSpent: 42,
      manualDatabaseWork: false,
    })).toMatchObject({ observation_type: "admin_journey" });
    const auditorView = await pilot.getInstitutionalPilotDashboard(bulkAuditorId, spaceId);
    expect(auditorView).toMatchObject({
      access: { role: "auditor", canManagePilot: false },
      pilot: { status: "active" },
      plan: { version: 2 },
      readiness: { ready: false },
    });
    await expect(pilot.completeInstitutionalPilot(ownerId, spaceId)).rejects.toMatchObject({
      missing: expect.arrayContaining([
        "observation:learner_journey_without_database_work",
        "evidence:completed_participation",
        "identity_provider:active_tested_connection",
      ]),
    });
    const storedPlan = await pg.one<{ id: string }>(
      "SELECT current_plan_version_id AS id FROM institutional_pilots WHERE space_id=$1",
      [spaceId],
    );
    await expect(pg.q(
      "UPDATE institutional_pilot_plan_versions SET sector='tampered' WHERE id=$1",
      [storedPlan!.id],
    )).rejects.toThrow(/append-only/i);
    await expect(pg.q(
      "UPDATE institutional_pilots SET status='completed' WHERE space_id=$1",
      [spaceId],
    )).rejects.toThrow(/lifecycle/i);
  });

  it("disables TOTP only with a current authenticator code", async () => {
    await expect(mfa.disableTotp(ownerId, wrongCode(mfa.totpCode(methodSecret)))).rejects.toThrow(/invalid/i);
    expect(await mfa.disableTotp(ownerId, mfa.totpCode(methodSecret))).toEqual({ disabled: true });
    expect(await mfa.hasActiveMfa(ownerId)).toBe(false);
  });
});
