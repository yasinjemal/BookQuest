import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let studio: typeof import("../lib/studio");
let institutional: typeof import("../lib/institutional");
let passport: typeof import("../lib/skill-passport");
let privacy: typeof import("../lib/privacy");
let ownerId: number;
let learnerId: number;
let otherLearnerId: number;
let outsiderId: number;
let spaceId: string;
let courseId: number;
let completionRuleVersionId: string;
let otherLearnerMembershipId: string;
let learnerCredentialId: string;
let otherCredentialId: string;
let learnerClaimVersionId: string;
let otherClaimVersionId: string;
let verifyRoute: typeof import("../app/api/passport/verify/route").GET;

function verificationRequest(token: string) {
  return new NextRequest(`http://bookquest.test/api/passport/verify?token=${encodeURIComponent(token)}`, {
    headers: { "x-forwarded-for": "127.0.0.94" },
  });
}

describe.skipIf(!TEST_DB)("Phase 4 private Skill Passport", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    studio = await import("../lib/studio");
    institutional = await import("../lib/institutional");
    passport = await import("../lib/skill-passport");
    privacy = await import("../lib/privacy");
    ({ GET: verifyRoute } = await import("../app/api/passport/verify/route"));
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");

    ownerId = (await db.createUser("passport-owner@example.test", "Passport Owner", "hash")).id;
    learnerId = (await db.createUser("passport-learner@example.test", "Passport Learner", "hash")).id;
    otherLearnerId = (await db.createUser("passport-other@example.test", "Other Learner", "hash")).id;
    outsiderId = (await db.createUser("passport-outsider@example.test", "Outsider", "hash")).id;

    spaceId = (await spaces.createSpace(ownerId, {
      name: "Passport Evidence Organization",
      type: "organization",
    })).space.id;
    const learnerInvite = await spaces.inviteSpaceMember(ownerId, spaceId, learnerId, "learner");
    const learnerMembershipId = (await spaces.acceptSpaceInvitation(learnerId, learnerInvite.token)).membership.id;
    const otherInvite = await spaces.inviteSpaceMember(ownerId, spaceId, otherLearnerId, "learner");
    otherLearnerMembershipId = (await spaces.acceptSpaceInvitation(otherLearnerId, otherInvite.token)).membership.id;
    const auditorInvite = await spaces.inviteSpaceMember(ownerId, spaceId, outsiderId, "auditor");
    await spaces.acceptSpaceInvitation(outsiderId, auditorInvite.token);

    const source = await studio.createTextSource(ownerId, spaceId, {
      title: "Approved shop procedure",
      kind: "manual",
      content: [{ title: "Opening", text: "Complete the opening safety and stock checks." }],
    });
    const course = await studio.createCourseDraftFromSources(ownerId, spaceId, {
      title: "Shop opening procedures",
      sourceVersionIds: [source.sourceVersionId],
    });
    await studio.addCourseBlock(ownerId, course.courseId, {
      moduleKey: "module:opening",
      moduleTitle: "Opening",
      lessonKey: "lesson:opening-check",
      lessonTitle: "Opening check",
      modulePosition: 0,
      lessonPosition: 0,
      blockType: "explanation",
      content: {
        type: "explanation",
        heading: "Open safely",
        body: "Complete the opening safety and stock checks.",
      },
      sourceRefs: [{ sourceVersionId: source.sourceVersionId }],
    });
    await studio.submitCourseVersionForReview(ownerId, course.courseId);
    await studio.reviewCourseVersion(ownerId, course.courseId, { decision: "approved" });
    await studio.publishApprovedCourseVersion(ownerId, course.courseId, "Workplace onboarding");
    await spaces.attachCourseToSpace(ownerId, spaceId, course.courseId);
    courseId = course.courseId;

    const rule = await institutional.createCompletionRuleVersion(ownerId, spaceId, course.courseId, {
      requiredLessons: "all",
      minimumScorePercent: 100,
      requiredAttestationLineageIds: [],
      requiredPracticalReviewLineageIds: [],
      credential: { enabled: true, expiresAfterDays: 365 },
    });
    completionRuleVersionId = String(rule.id);
    const assignment = await institutional.createInstitutionalAssignment(ownerId, spaceId, course.courseId, {
      completionRuleVersionId: String(rule.id),
      audience: { membershipIds: [learnerMembershipId, otherLearnerMembershipId] },
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

    for (const userId of [learnerId, otherLearnerId]) {
      await institutional.startAssignmentParticipation(userId, assignment.assignmentId);
      await institutional.recordAssignmentLessonCompletion(userId, assignment.assignmentId, {
        lessonKey: "lesson:opening-check",
        score: 1,
        total: 1,
      });
      const completion = await institutional.evaluateAssignmentCompletion(userId, assignment.assignmentId);
      expect(completion.completed).toBe(true);
      if (userId === learnerId) learnerCredentialId = completion.credentialId!;
      else otherCredentialId = completion.credentialId!;
    }
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("denies credential attachment by another learner, manager or outsider", async () => {
    await expect(passport.createCompetencyClaim(otherLearnerId, learnerCredentialId))
      .rejects.toThrow(/eligible credential not found/i);
    await expect(passport.createCompetencyClaim(ownerId, learnerCredentialId))
      .rejects.toThrow(/eligible credential not found/i);
    await expect(passport.createCompetencyClaim(outsiderId, learnerCredentialId))
      .rejects.toThrow(/eligible credential not found/i);
  });

  it("creates only server-derived immutable claims with the exact evidence chain", async () => {
    const learnerClaim = await passport.createCompetencyClaim(learnerId, learnerCredentialId);
    const otherClaim = await passport.createCompetencyClaim(otherLearnerId, otherCredentialId);
    learnerClaimVersionId = learnerClaim.claimVersionId;
    otherClaimVersionId = otherClaim.claimVersionId;

    expect(learnerClaim).toMatchObject({
      version: 1,
      claimType: "verified_course_completion",
      title: "Completed: Shop opening procedures",
      evidence: {
        credentialId: learnerCredentialId,
        courseVersion: 1,
        assignmentVersionId: expect.any(String),
        completionRuleVersionId: expect.any(String),
        completionEventId: expect.any(String),
        participationId: expect.any(String),
        evidenceHash: expect.any(String),
      },
    });
    expect(await passport.createCompetencyClaim(learnerId, learnerCredentialId)).toEqual(learnerClaim);
    await expect(pg.q(
      "UPDATE competency_claim_versions SET title='tampered' WHERE id=$1",
      [learnerClaimVersionId],
    )).rejects.toThrow(/append-only/i);
  });

  it("keeps the passport private by default and denies cross-user reads", async () => {
    const own = await passport.getSkillPassport(learnerId);
    expect(own).toMatchObject({
      passport: { visibility: "private" },
      claims: [{ claimVersionId: learnerClaimVersionId }],
      shares: [],
    });
    expect(JSON.stringify(own)).not.toContain(otherClaimVersionId);
    await expect(passport.getSkillPassport(learnerId, otherLearnerId))
      .rejects.toThrow(/passport not found/i);
    await expect(passport.getSkillPassport(learnerId, ownerId))
      .rejects.toThrow(/passport not found/i);
  });

  it("denies sharing another learner's claim without revealing whether it exists", async () => {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    await expect(passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId, otherClaimVersionId],
      expiresAt,
    })).rejects.toThrow(/one or more claims are unavailable/i);
    await expect(passport.createPassportShare(learnerId, {
      claimVersionIds: ["00000000-0000-0000-0000-000000000000"],
      expiresAt,
    })).rejects.toThrow(/one or more claims are unavailable/i);
  });

  it("uses opaque non-enumerable tokens and discloses only the selected claim", async () => {
    const share = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await pg.one<{ token_hash: string }>(
      "SELECT token_hash FROM passport_share_grants WHERE id=$1",
      [share.id],
    );
    expect(stored?.token_hash).not.toBe(share.token);
    expect(await passport.verifyPassportShare("short")).toBeNull();
    expect(await passport.verifyPassportShare("A".repeat(43))).toBeNull();
    const replacement = share.token.endsWith("A") ? "B" : "A";
    expect(await passport.verifyPassportShare(`${share.token.slice(0, -1)}${replacement}`)).toBeNull();

    const verified = await passport.verifyPassportShare(share.token);
    expect(verified).toMatchObject({
      learnerName: null,
      claims: [{
        claimVersionId: learnerClaimVersionId,
        claimType: "verified_course_completion",
        title: "Completed: Shop opening procedures",
        evidence: { credentialId: learnerCredentialId },
      }],
    });
    expect(verified?.claims).toHaveLength(1);
    expect(JSON.stringify(verified)).not.toContain(otherClaimVersionId);
    expect(verified).not.toHaveProperty("userId");
    const routeResponse = await verifyRoute(verificationRequest(share.token));
    expect(routeResponse.status).toBe(200);
    expect(routeResponse.headers.get("cache-control")).toBe("no-store");
    expect(routeResponse.headers.get("x-robots-tag")).toContain("noindex");
    const unknownResponse = await verifyRoute(verificationRequest("A".repeat(43)));
    expect(unknownResponse.status).toBe(404);
    expect(await unknownResponse.json()).toEqual({ error: "Shared passport not found" });
    const exported = await privacy.createAccountExport(learnerId);
    expect(exported).toMatchObject({
      schemaVersion: 4,
      skillPassport: { claims: [{ claim_version_id: learnerClaimVersionId }] },
    });
    expect(JSON.stringify(exported)).not.toContain("token_hash");
    expect(JSON.stringify(exported)).not.toContain(share.token);
  });

  it("records only privacy-minimal successful access in the learner's private history", async () => {
    const share = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const before = await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM passport_verification_events WHERE share_id=$1",
      [share.id],
    );
    expect(before).toEqual({ count: 0 });
    expect(await passport.verifyPassportShare(share.token)).not.toBeNull();
    const event = await pg.one<{
      id: string; claim_count: number; learner_name_disclosed: number;
      occurred_at: string; retain_until: string;
    }>(
      `SELECT id,claim_count,learner_name_disclosed,occurred_at,retain_until
       FROM passport_verification_events WHERE share_id=$1`,
      [share.id],
    );
    expect(event).toMatchObject({
      id: expect.any(String),
      claim_count: 1,
      learner_name_disclosed: 0,
      occurred_at: expect.any(String),
      retain_until: expect.any(String),
    });
    expect(Date.parse(event!.retain_until) - Date.parse(event!.occurred_at))
      .toBe(90 * 86_400_000);
    const privateView = await passport.getSkillPassport(learnerId);
    expect(privateView.accessHistory[0]).toMatchObject({
      shareId: share.id,
      claimCount: 1,
      learnerNameDisclosed: false,
    });
    const exportAfterAccess = await privacy.createAccountExport(learnerId);
    expect(exportAfterAccess.schemaVersion).toBe(4);
    expect(exportAfterAccess.skillPassport?.verificationHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ share_id: share.id, claim_count: 1, learner_name_disclosed: 0 }),
    ]));
    await expect(passport.getSkillPassport(otherLearnerId, learnerId))
      .rejects.toThrow(/passport not found/i);
    const identifyingColumns = (await pg.q<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='passport_verification_events'
         AND column_name IN ('ip','ip_address','ip_hash','user_agent','referrer',
                             'device','location','recipient_user_id','recipient_email')`,
    )).rows;
    expect(identifyingColumns).toEqual([]);
    await expect(pg.q(
      "UPDATE passport_verification_events SET claim_count=99 WHERE id=$1",
      [event!.id],
    )).rejects.toThrow(/append-only/i);
  });

  it("does not log guessed, expired, revoked, withdrawn or evidence-invalid access", async () => {
    const baseline = (await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM passport_verification_events",
    ))!.count;
    expect(await passport.verifyPassportShare("Z".repeat(43))).toBeNull();
    const expired = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await passport.verifyPassportShare(expired.token, new Date(Date.now() + 60_001))).toBeNull();
    const revoked = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await passport.revokePassportShare(learnerId, revoked.id);
    expect(await passport.verifyPassportShare(revoked.token)).toBeNull();
    const withdrawn = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await passport.withdrawPassportShareConsent(learnerId, withdrawn.id);
    expect(await passport.verifyPassportShare(withdrawn.token)).toBeNull();
    expect((await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM passport_verification_events",
    ))!.count).toBe(baseline);
  });

  it("purges access history only after its 90-day retention deadline", async () => {
    const share = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await pg.q(
      `INSERT INTO passport_verification_events
        (share_id,claim_count,learner_name_disclosed,occurred_at,retain_until)
       VALUES ($1,1,0,'2026-01-01T00:00:00.000Z','2026-04-01T00:00:00.000Z')`,
      [share.id],
    );
    const purged = await privacy.purgeExpiredOperationalData(new Date("2026-04-01T00:00:00.000Z"));
    expect(purged.passport_access).toBe(1);
    expect(await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM passport_verification_events WHERE share_id=$1",
      [share.id],
    )).toEqual({ count: 0 });
  });

  it("blocks verification at expiry without requiring a maintenance write", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const share = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: expiresAt.toISOString(),
    });
    expect(await passport.verifyPassportShare(share.token, new Date(expiresAt.getTime() - 1))).not.toBeNull();
    expect(await passport.verifyPassportShare(share.token, expiresAt)).toBeNull();
  });

  it("makes learner revocation terminal and blocks all future access", async () => {
    const share = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      includeLearnerName: true,
    });
    expect((await passport.verifyPassportShare(share.token))?.learnerName).toBe("Passport Learner");
    await expect(passport.revokePassportShare(otherLearnerId, share.id))
      .rejects.toThrow(/share not found/i);
    expect(await passport.revokePassportShare(learnerId, share.id)).toMatchObject({ status: "revoked" });
    expect(await passport.verifyPassportShare(share.token)).toBeNull();
    await expect(pg.q(
      "UPDATE passport_share_grants SET status='active', revoked_at=NULL WHERE id=$1",
      [share.id],
    )).rejects.toThrow(/terminal/i);
  });

  it("makes consent withdrawal terminal and blocks all future access", async () => {
    const share = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(await passport.verifyPassportShare(share.token)).not.toBeNull();
    expect(await passport.withdrawPassportShareConsent(learnerId, share.id))
      .toMatchObject({ status: "consent_withdrawn" });
    expect(await passport.verifyPassportShare(share.token)).toBeNull();
    const withdrawnResponse = await verifyRoute(verificationRequest(share.token));
    expect(withdrawnResponse.status).toBe(404);
    expect(await withdrawnResponse.json()).toEqual({ error: "Shared passport not found" });
    expect(await pg.one<{ decision: string }>(
      "SELECT decision FROM passport_share_consent_events WHERE share_id=$1 ORDER BY occurred_at DESC,id DESC LIMIT 1",
      [share.id],
    )).toEqual({ decision: "withdrawn" });
  });

  it("blocks a live share immediately when its issuing credential is revoked", async () => {
    const share = await passport.createPassportShare(learnerId, {
      claimVersionIds: [learnerClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(await passport.verifyPassportShare(share.token)).not.toBeNull();
    const loggedBeforeRevocation = (await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM passport_verification_events WHERE share_id=$1",
      [share.id],
    ))!.count;
    await institutional.revokeCredential(ownerId, learnerCredentialId, "Underlying completion withdrawn");
    expect(await passport.verifyPassportShare(share.token)).toBeNull();
    expect((await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM passport_verification_events WHERE share_id=$1",
      [share.id],
    ))!.count).toBe(loggedBeforeRevocation);
  });

  it("keeps learner disputes private, structured and withdrawable only by their owner", async () => {
    await expect(passport.createCompetencyClaimDispute(learnerId, {
      claimVersionId: otherClaimVersionId,
      category: "evidence_or_credential",
      statement: "This is not my claim.",
    })).rejects.toThrow(/claim not found/i);
    const dispute = await passport.createCompetencyClaimDispute(learnerId, {
      claimVersionId: learnerClaimVersionId,
      category: "evidence_or_credential",
      statement: "The completion evidence needs to be checked against the assignment record.",
    });
    expect(dispute).toMatchObject({
      status: "open",
      category: "evidence_or_credential",
      disputedClaimVersionId: learnerClaimVersionId,
    });
    const privateView = await passport.getSkillPassport(learnerId);
    expect(privateView.disputes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: dispute.id, statement: expect.stringContaining("assignment record") }),
    ]));
    const privateExport = await privacy.createAccountExport(learnerId);
    expect(privateExport).toMatchObject({
      schemaVersion: 4,
      skillPassport: {
        disputes: expect.arrayContaining([
          expect.objectContaining({ id: dispute.id, statement: expect.stringContaining("assignment record") }),
        ]),
      },
    });
    expect(JSON.stringify(await passport.getSkillPassport(otherLearnerId)))
      .not.toContain(dispute.id);
    await expect(passport.withdrawCompetencyClaimDispute(otherLearnerId, dispute.id))
      .rejects.toThrow(/dispute not found/i);
    expect(await passport.withdrawCompetencyClaimDispute(learnerId, dispute.id))
      .toMatchObject({ id: dispute.id, status: "withdrawn" });
    await expect(passport.withdrawCompetencyClaimDispute(learnerId, dispute.id))
      .rejects.toThrow(/terminal/i);
    await expect(pg.q(
      "UPDATE competency_claim_dispute_details SET statement='rewritten' WHERE dispute_id=$1",
      [dispute.id],
    )).rejects.toThrow(/append-only/i);
  });

  it("allows only assignment managers in the exact issuing Space to reject disputes", async () => {
    const dispute = await passport.createCompetencyClaimDispute(learnerId, {
      claimVersionId: learnerClaimVersionId,
      category: "completion_or_score",
      statement: "Please confirm the completion decision.",
    });
    await expect(passport.listSpaceCompetencyClaimDisputes(outsiderId, spaceId))
      .rejects.toThrow(/space access denied/i);
    await expect(passport.resolveCompetencyClaimDispute(outsiderId, spaceId, dispute.id, {
      decision: "rejected",
      resolutionCode: "evidence_confirmed",
    })).rejects.toThrow(/space access denied/i);
    expect(await passport.resolveCompetencyClaimDispute(ownerId, spaceId, dispute.id, {
      decision: "rejected",
      resolutionCode: "evidence_confirmed",
    })).toMatchObject({ id: dispute.id, status: "rejected", resolutionCode: "evidence_confirmed" });
    await expect(passport.resolveCompetencyClaimDispute(ownerId, spaceId, dispute.id, {
      decision: "rejected",
      resolutionCode: "evidence_confirmed",
    })).rejects.toThrow(/terminal/i);
  });

  it("accepts only same-learner, same-course, same-Space replacement evidence and supersedes immutably", async () => {
    const replacementAssignment = await institutional.createInstitutionalAssignment(
      ownerId,
      spaceId,
      courseId,
      {
        completionRuleVersionId,
        audience: { membershipIds: [otherLearnerMembershipId] },
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
    );
    await institutional.startAssignmentParticipation(otherLearnerId, replacementAssignment.assignmentId);
    await institutional.recordAssignmentLessonCompletion(otherLearnerId, replacementAssignment.assignmentId, {
      lessonKey: "lesson:opening-check",
      score: 1,
      total: 1,
    });
    const replacementCompletion = await institutional.evaluateAssignmentCompletion(
      otherLearnerId,
      replacementAssignment.assignmentId,
    );
    const replacementCredentialId = replacementCompletion.credentialId!;
    const oldShare = await passport.createPassportShare(otherLearnerId, {
      claimVersionIds: [otherClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(await passport.verifyPassportShare(oldShare.token)).not.toBeNull();
    const dispute = await passport.createCompetencyClaimDispute(otherLearnerId, {
      claimVersionId: otherClaimVersionId,
      category: "evidence_or_credential",
      statement: "A corrected completion credential is now available.",
    });
    const queue = await passport.listSpaceCompetencyClaimDisputes(ownerId, spaceId);
    expect(queue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: dispute.id,
        replacementCredentials: expect.arrayContaining([
          expect.objectContaining({ credentialId: replacementCredentialId }),
        ]),
      }),
    ]));
    await expect(passport.resolveCompetencyClaimDispute(ownerId, spaceId, dispute.id, {
      decision: "accepted",
      resolutionCode: "corrected_with_replacement",
      replacementCredentialId: learnerCredentialId,
    })).rejects.toThrow(/replacement credential unavailable/i);
    const accepted = await passport.resolveCompetencyClaimDispute(ownerId, spaceId, dispute.id, {
      decision: "accepted",
      resolutionCode: "corrected_with_replacement",
      replacementCredentialId,
    });
    expect(accepted).toMatchObject({
      id: dispute.id,
      status: "accepted",
      resultingClaim: {
        claimId: expect.any(String),
        claimVersionId: expect.any(String),
        version: 2,
        supersedesClaimVersionId: otherClaimVersionId,
        evidence: { credentialId: replacementCredentialId, courseId },
      },
    });
    expect(await passport.verifyPassportShare(oldShare.token)).toBeNull();
    const oldVersionId = otherClaimVersionId;
    otherClaimVersionId = accepted.resultingClaim!.claimVersionId;
    const correctedShare = await passport.createPassportShare(otherLearnerId, {
      claimVersionIds: [otherClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(await passport.verifyPassportShare(correctedShare.token)).toMatchObject({
      claims: [{ claimVersionId: otherClaimVersionId, version: 2 }],
    });
    await expect(passport.createPassportShare(otherLearnerId, {
      claimVersionIds: [oldVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })).rejects.toThrow(/claims are unavailable/i);
    expect(await passport.createCompetencyClaim(otherLearnerId, replacementCredentialId))
      .toMatchObject({ claimVersionId: otherClaimVersionId, version: 2 });
    expect(await passport.createCompetencyClaim(otherLearnerId, otherCredentialId))
      .toMatchObject({ claimVersionId: otherClaimVersionId, version: 2 });
    await expect(pg.q(
      "UPDATE competency_claim_versions SET supersedes_claim_version_id=NULL WHERE id=$1",
      [otherClaimVersionId],
    )).rejects.toThrow(/append-only/i);
  });

  it("withdraws every active share when account erasure becomes effective", async () => {
    const share = await passport.createPassportShare(otherLearnerId, {
      claimVersionIds: [otherClaimVersionId],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(await passport.verifyPassportShare(share.token)).not.toBeNull();
    await privacy.scheduleAccountDeletion(otherLearnerId, new Date("2026-01-01T00:00:00.000Z"));
    expect(await privacy.processDueAccountErasures(new Date("2026-02-01T00:00:00.000Z")))
      .toContain(otherLearnerId);
    expect(await passport.verifyPassportShare(share.token)).toBeNull();
    expect(await pg.one<{ status: string }>(
      "SELECT status FROM passport_share_grants WHERE id=$1",
      [share.id],
    )).toEqual({ status: "consent_withdrawn" });
    expect(await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM passport_verification_events WHERE share_id=$1",
      [share.id],
    )).toEqual({ count: 0 });
    expect(await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM competency_claim_dispute_details WHERE learner_user_id=$1",
      [otherLearnerId],
    )).toEqual({ count: 0 });
    expect((await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM competency_claim_disputes WHERE learner_user_id=$1",
      [otherLearnerId],
    ))!.count).toBeGreaterThan(0);
  });
});
