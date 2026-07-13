import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let studio: typeof import("../lib/studio");
let institutional: typeof import("../lib/institutional");
let auditPack: typeof import("../lib/audit-pack");
let pilot: typeof import("../lib/institutional-pilot");
let ownerId: number;
let learnerId: number;
let managerId: number;
let outsiderId: number;
let auditorId: number;
let secondLearnerId: number;
let spaceId: string;
let learnerMembershipId: string;
let teamId: string;
let courseId: number;
let attestationLineageId: string;
let practicalLineageId: string;
let ruleId: string;
let assignmentId: string;
let assignmentVersionId: string;
let participationId: string;
let submissionId: string;
let credentialId: string;
let acceptedAuditPackId: string;

describe.skipIf(!TEST_DB)("Phase 3 institutional assignment evidence", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    studio = await import("../lib/studio");
    institutional = await import("../lib/institutional");
    auditPack = await import("../lib/audit-pack");
    pilot = await import("../lib/institutional-pilot");
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("institution-owner@example.test", "Institution Owner", "hash")).id;
    learnerId = (await db.createUser("institution-learner@example.test", "Institution Learner", "hash")).id;
    managerId = (await db.createUser("institution-manager@example.test", "Institution Manager", "hash")).id;
    outsiderId = (await db.createUser("institution-outsider@example.test", "Institution Outsider", "hash")).id;
    auditorId = (await db.createUser("institution-auditor@example.test", "Institution Auditor", "hash")).id;
    secondLearnerId = (await db.createUser("institution-second-learner@example.test", "Second Learner", "hash")).id;
    spaceId = (await spaces.createSpace(ownerId, { name: "Evidence Organization", type: "organization" })).space.id;
    const learnerInvite = await spaces.inviteSpaceMember(ownerId, spaceId, learnerId, "learner");
    learnerMembershipId = (await spaces.acceptSpaceInvitation(learnerId, learnerInvite.token)).membership.id;
    const managerInvite = await spaces.inviteSpaceMember(ownerId, spaceId, managerId, "manager");
    await spaces.acceptSpaceInvitation(managerId, managerInvite.token);
    const auditorInvite = await spaces.inviteSpaceMember(ownerId, spaceId, auditorId, "auditor");
    await spaces.acceptSpaceInvitation(auditorId, auditorInvite.token);
    const secondLearnerInvite = await spaces.inviteSpaceMember(ownerId, spaceId, secondLearnerId, "learner");
    await spaces.acceptSpaceInvitation(secondLearnerId, secondLearnerInvite.token);
    teamId = (await spaces.createSpaceTeam(ownerId, spaceId, "Safety Cohort")).id;
    await spaces.addSpaceTeamMember(ownerId, spaceId, teamId, learnerId);

    const source = await studio.createTextSource(ownerId, spaceId, {
      title: "Approved Safety Policy",
      kind: "manual",
      content: [{ title: "Workshop", text: "Wear safety glasses and complete the equipment check." }],
    });
    const course = await studio.createCourseDraftFromSources(ownerId, spaceId, {
      title: "Workshop Evidence Course",
      sourceVersionIds: [source.sourceVersionId],
    });
    courseId = course.courseId;
    const refs = [{ sourceVersionId: source.sourceVersionId }];
    await studio.addCourseBlock(ownerId, courseId, {
      moduleKey: "module:safety", moduleTitle: "Safety", lessonKey: "lesson:check",
      lessonTitle: "Safety check", modulePosition: 0, lessonPosition: 0,
      blockType: "explanation",
      content: { type: "explanation", heading: "Prepare", body: "Wear approved safety glasses." },
      sourceRefs: refs,
    });
    const attestation = await studio.addCourseBlock(ownerId, courseId, {
      moduleKey: "module:safety", moduleTitle: "Safety", lessonKey: "lesson:check",
      lessonTitle: "Safety check", modulePosition: 0, lessonPosition: 0,
      blockType: "attestation",
      content: { type: "attestation", statement: "I completed the safety check.", consentLabel: "I confirm", required: true },
      sourceRefs: refs,
    });
    attestationLineageId = attestation.lineageId;
    const practical = await studio.addCourseBlock(ownerId, courseId, {
      moduleKey: "module:safety", moduleTitle: "Safety", lessonKey: "lesson:check",
      lessonTitle: "Safety check", modulePosition: 0, lessonPosition: 0,
      blockType: "practical_task",
      content: { type: "practical_task", title: "Inspect equipment", instructions: ["Inspect the guard"], submissionAlternative: "Describe the inspection", rubric: ["Guard checked"] },
      sourceRefs: refs,
    });
    practicalLineageId = practical.lineageId;
    await studio.submitCourseVersionForReview(ownerId, courseId);
    await studio.reviewCourseVersion(ownerId, courseId, { decision: "approved" });
    await studio.publishApprovedCourseVersion(ownerId, courseId, "General");
    await spaces.attachCourseToSpace(ownerId, spaceId, courseId);
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("publishes an immutable versioned completion rule", async () => {
    const rule = await institutional.createCompletionRuleVersion(ownerId, spaceId, courseId, {
      requiredLessons: "all",
      minimumScorePercent: 80,
      requiredAttestationLineageIds: [attestationLineageId],
      requiredPracticalReviewLineageIds: [practicalLineageId],
      credential: { enabled: true, expiresAfterDays: 365 },
    });
    ruleId = String(rule.id);
    expect(rule).toMatchObject({ version: 1, status: "published" });
    await expect(pg.q(
      "UPDATE completion_rule_versions SET rule_json='{}' WHERE id=$1",
      [ruleId]
    )).rejects.toThrow(/immutable/i);
    await expect(institutional.createCompletionRuleVersion(outsiderId, spaceId, courseId, {
      requiredLessons: "all", minimumScorePercent: 0,
      requiredAttestationLineageIds: [], requiredPracticalReviewLineageIds: [],
    })).rejects.toMatchObject({ reason: "membership_required" });
  });

  it("assigns a team with versioned timing, attempts, reminders and escalation", async () => {
    const dueAt = new Date(Date.now() + 72 * 3_600_000).toISOString();
    const result = await institutional.createInstitutionalAssignment(ownerId, spaceId, courseId, {
      completionRuleVersionId: ruleId,
      audience: { teamIds: [teamId] },
      startAt: new Date(Date.now() - 3_600_000).toISOString(),
      dueAt,
      expiresAt: new Date(Date.now() + 96 * 3_600_000).toISOString(),
      maxAttempts: 2,
      reminderHoursBeforeDue: [24],
      escalationHoursAfterDue: [1],
    });
    assignmentId = result.assignmentId;
    assignmentVersionId = result.assignmentVersionId;
    participationId = result.participations[0].id;
    expect(result.participations).toEqual([{ id: participationId, membershipId: learnerMembershipId }]);
    expect(await pg.one<{ targets: number; audience_events: number; deliveries: number }>(
      `SELECT
        (SELECT COUNT(*)::int FROM assignment_targets WHERE assignment_version_id=$1) AS targets,
        (SELECT COUNT(*)::int FROM assignment_audience_events WHERE assignment_version_id=$1) AS audience_events,
        (SELECT COUNT(*)::int FROM assignment_delivery_events delivery
          JOIN assignment_participations participation ON participation.id=delivery.participation_id
          WHERE participation.assignment_version_id=$1) AS deliveries`,
      [assignmentVersionId]
    )).toEqual({ targets: 1, audience_events: 1, deliveries: 2 });
    await expect(institutional.createInstitutionalAssignment(outsiderId, spaceId, courseId, {
      completionRuleVersionId: ruleId, audience: { membershipIds: [learnerMembershipId] },
    })).rejects.toMatchObject({ reason: "membership_required" });
  });

  it("tracks later team membership changes without erasing the audience history", async () => {
    await spaces.addSpaceTeamMember(ownerId, spaceId, teamId, secondLearnerId);
    const added = await pg.one<{ id: string; status: string }>(
      `SELECT participation.id,participation.status
       FROM assignment_participations participation
       JOIN space_memberships membership ON membership.id=participation.membership_id
       WHERE participation.assignment_version_id=$1 AND membership.user_id=$2`,
      [assignmentVersionId, secondLearnerId]
    );
    expect(added).toMatchObject({ status: "assigned" });
    await spaces.removeSpaceTeamMember(ownerId, spaceId, teamId, secondLearnerId);
    expect(await pg.one<{ status: string; audience_events: number }>(
      `SELECT participation.status,
        (SELECT COUNT(*)::int FROM assignment_audience_events audience
         WHERE audience.assignment_version_id=participation.assignment_version_id
           AND audience.membership_id=participation.membership_id) AS audience_events
       FROM assignment_participations participation WHERE participation.id=$1`,
      [added!.id]
    )).toEqual({ status: "revoked", audience_events: 2 });
  });

  it("records learner start, exact-version attestation and practical work", async () => {
    expect(await institutional.startAssignmentParticipation(learnerId, assignmentId)).toMatchObject({
      id: participationId,
      status: "started",
    });
    const attestation = await institutional.recordAssignmentAttestation(learnerId, assignmentId, {
      blockLineageId: attestationLineageId,
      statement: "I completed the safety check.",
      accepted: true,
    });
    await expect(institutional.recordAssignmentAttestation(learnerId, assignmentId, {
      blockLineageId: attestationLineageId,
      statement: "A different statement",
      accepted: true,
    })).rejects.toThrow(/does not match/i);
    await expect(pg.q("UPDATE attestation_events SET accepted=0 WHERE id=$1", [attestation.id]))
      .rejects.toThrow(/append-only/i);
    const submission = await institutional.submitPracticalTask(learnerId, assignmentId, {
      blockLineageId: practicalLineageId,
      response: { notes: "Guard inspected and secure" },
      artifactHash: "sha256:test-artifact",
    });
    submissionId = String(submission.id);
    expect(submission).toMatchObject({ submission_version: 1 });
    const lesson = await institutional.recordAssignmentLessonCompletion(learnerId, assignmentId, {
      lessonKey: "lesson:check",
      score: 9,
      total: 10,
    });
    expect(lesson).toMatchObject({ lesson_key: "lesson:check", score: 9, total: 10 });
    await expect(pg.q("UPDATE assignment_lesson_completion_events SET score=10 WHERE id=$1", [lesson.id]))
      .rejects.toThrow(/append-only/i);
    const notMet = await institutional.evaluateAssignmentCompletion(learnerId, assignmentId);
    expect(notMet).toMatchObject({
      completed: false,
      evaluation: { missingLessons: [], missingAttestations: [], missingPracticalReviews: [practicalLineageId] },
    });
  });

  it("allows a manager to append a practical review without rewriting evidence", async () => {
    const review = await institutional.reviewPracticalTask(managerId, submissionId, {
      decision: "approved",
      rubric: { guardChecked: true },
      summary: "Inspection accepted",
    });
    expect(review).toMatchObject({ decision: "approved", reviewer_user_id: managerId });
    await expect(pg.q("UPDATE practical_task_reviews SET decision='rejected' WHERE id=$1", [review.id]))
      .rejects.toThrow(/append-only/i);
    await expect(institutional.reviewPracticalTask(outsiderId, submissionId, {
      decision: "approved",
    })).rejects.toMatchObject({ reason: "membership_required" });
    const completed = await institutional.evaluateAssignmentCompletion(learnerId, assignmentId);
    expect(completed).toMatchObject({ completed: true });
    expect(completed.credentialId).toEqual(expect.any(String));
    credentialId = completed.credentialId!;
    expect(completed.credentialVerificationToken).toEqual(expect.any(String));
    expect(await institutional.verifyCredential(completed.credentialVerificationToken!)).toMatchObject({
      status: "active",
      learnerName: "Institution Learner",
      course: { id: courseId, title: "Workshop Evidence Course", version: 1 },
    });
    expect(await institutional.verifyCredential("not-a-real-token")).toBeNull();
    expect(await institutional.evaluateAssignmentCompletion(learnerId, assignmentId)).toMatchObject({
      completed: true,
      credentialId: completed.credentialId,
    });
    expect(await pg.one<{ status: string; event_count: number; credential_count: number }>(
      `SELECT participation.status,
        (SELECT COUNT(*)::int FROM assignment_completion_events WHERE participation_id=participation.id) AS event_count,
        (SELECT COUNT(*)::int FROM credential_records WHERE participation_id=participation.id) AS credential_count
       FROM assignment_participations participation WHERE participation.id=$1`,
      [participationId]
    )).toEqual({ status: "completed", event_count: 2, credential_count: 1 });
    await expect(institutional.revokeCredential(outsiderId, completed.credentialId!, "Not allowed"))
      .rejects.toMatchObject({ reason: "membership_required" });
    await institutional.renewCredential(
      managerId,
      completed.credentialId!,
      new Date(Date.now() + 400 * 86_400_000).toISOString()
    );
    await institutional.revokeCredential(managerId, completed.credentialId!, "Credential issued in error");
    expect(await institutional.verifyCredential(completed.credentialVerificationToken!)).toMatchObject({
      status: "revoked",
      revocationReason: "Credential issued in error",
    });
    expect(await pg.one<{ events: number }>(
      "SELECT COUNT(*)::int AS events FROM credential_status_events WHERE credential_id=$1",
      [completed.credentialId]
    )).toEqual({ events: 3 });
  });

  it("reassigns within the attempt policy, dispatches reminders and preserves audience history", async () => {
    const reassigned = await institutional.reassignAssignmentMember(
      managerId,
      assignmentId,
      learnerMembershipId,
      "Second supervised attempt"
    );
    expect(reassigned).toMatchObject({ attemptNumber: 2 });
    await expect(institutional.reassignAssignmentMember(
      managerId,
      assignmentId,
      learnerMembershipId,
      "Third attempt"
    )).rejects.toThrow(/attempt limit/i);
    await pg.q(
      `UPDATE assignment_delivery_events SET scheduled_at=$2
       WHERE participation_id=$1 AND kind='reminder'`,
      [reassigned.id, new Date(Date.now() - 1000).toISOString()]
    );
    const messages: Array<{ to: string; idempotencyKey: string }> = [];
    const deliveries = await institutional.dispatchDueAssignmentDeliveries(
      new Date().toISOString(),
      async (input) => {
        messages.push({ to: input.to, idempotencyKey: input.idempotencyKey });
        return { mode: "test", id: "message-1" };
      }
    );
    expect(deliveries).toEqual({ due: 1, sent: 1, failed: 0 });
    expect(messages).toEqual([{
      to: "institution-learner@example.test",
      idempotencyKey: expect.stringMatching(/^assignment-delivery\//),
    }]);
    expect(await institutional.removeAssignmentMember(
      managerId,
      assignmentId,
      learnerMembershipId,
      { exempt: true, reason: "Equivalent prior training accepted" }
    )).toEqual({ eventType: "exempted", affectedParticipations: 1 });
    expect(await pg.one<{ reassigned: number; exempted: number; cancelled: number }>(
      `SELECT
        COUNT(*) FILTER (WHERE event_type='reassigned')::int AS reassigned,
        COUNT(*) FILTER (WHERE event_type='exempted')::int AS exempted,
        (SELECT COUNT(*)::int FROM assignment_delivery_events
         WHERE participation_id=$2 AND status='cancelled') AS cancelled
       FROM assignment_audience_events WHERE assignment_version_id=$1`,
      [assignmentVersionId, reassigned.id]
    )).toEqual({ reassigned: 1, exempted: 1, cancelled: 1 });
  });

  it("exports a scoped CSV and readable PDF audit pack for read-only auditors", async () => {
    const pack = await auditPack.generateAssignmentAuditPack(auditorId, assignmentId);
    acceptedAuditPackId = pack.id;
    expect(pack.reportFormatVersion).toBe("bookquest-audit-pack/1.0");
    expect(pack.manifest).toMatchObject({
      scope: {
        assignmentId,
        assignmentVersionId,
        courseId,
        courseVersion: 1,
        completionRuleVersionId: ruleId,
      },
      participationCount: 3,
    });
    expect(pack.csv).toContain('"completion_rule_version_id"');
    expect(pack.csv).toContain('"revoked"');
    expect(Buffer.from(pack.pdf).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await auditPack.getAuditPackRecord(auditorId, pack.id)).toMatchObject({
      id: pack.id,
      status: "generated",
      report_format_version: "bookquest-audit-pack/1.0",
    });
    await expect(auditPack.generateAssignmentAuditPack(outsiderId, assignmentId))
      .rejects.toMatchObject({ reason: "membership_required" });
    expect(await institutional.getInstitutionalDashboard(auditorId, spaceId)).toMatchObject({
      role: "auditor",
      summary: { assignments: 1, completed: 1, revoked_credentials: 1 },
    });
    await expect(institutional.getInstitutionalDashboard(outsiderId, spaceId))
      .rejects.toMatchObject({ reason: "membership_required" });
    expect(await pg.one<{ packs: number }>(
      "SELECT COUNT(*)::int AS packs FROM audit_packs WHERE assignment_version_id=$1",
      [assignmentVersionId]
    )).toEqual({ packs: 1 });
  });

  it("activates a new assignment version without rewriting prior evidence", async () => {
    const revision = await institutional.reviseInstitutionalAssignment(managerId, assignmentId, {
      completionRuleVersionId: ruleId,
      audience: { membershipIds: [learnerMembershipId] },
      startAt: new Date(Date.now() - 1000).toISOString(),
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      expiresAt: new Date(Date.now() + 8 * 86_400_000).toISOString(),
      maxAttempts: 1,
      reminderHoursBeforeDue: [24],
      escalationHoursAfterDue: [1],
    });
    expect(revision).toMatchObject({ assignmentId, assignmentVersion: 2 });
    expect(revision.participations).toHaveLength(1);
    expect(await pg.one<{
      versions: number;
      superseded: number;
      active: number;
      old_completion_events: number;
      current_version_id: string;
    }>(
      `SELECT
        COUNT(*)::int AS versions,
        COUNT(*) FILTER (WHERE version.status='superseded')::int AS superseded,
        COUNT(*) FILTER (WHERE version.status='active')::int AS active,
        (SELECT COUNT(*)::int FROM assignment_completion_events completion
         WHERE completion.assignment_version_id=$2) AS old_completion_events,
        MAX(assignment.current_version_id) AS current_version_id
       FROM assignment_versions version
       JOIN space_assignments assignment ON assignment.id=version.assignment_id
       WHERE version.assignment_id=$1`,
      [assignmentId, assignmentVersionId]
    )).toEqual({
      versions: 2,
      superseded: 1,
      active: 1,
      old_completion_events: 2,
      current_version_id: revision.assignmentVersionId,
    });
    const historicalPack = await auditPack.generateAssignmentAuditPack(
      auditorId,
      assignmentId,
      assignmentVersionId
    );
    expect(historicalPack.manifest).toMatchObject({
      participationCount: 3,
      scope: { assignmentVersionId },
    });
  });

  it("completes a pilot only after human gates bind to the real evidence chain", async () => {
    const created = await pilot.createInstitutionalPilot(ownerId, spaceId, {
      partnerDisplayName: "Evidence Design Partner",
      sector: "Workplace safety",
      identityProviderRequirement: "oidc",
      scimRequired: false,
      baseline: {
        description: "The partner previously coordinated source approval, assignments and completion evidence by email and spreadsheet.",
        uploadToAssignmentMinutes: 120,
        adminHoursPerCohort: 12,
      },
      successCriteria: [
        { metric: "Upload to assignment", target: "Under 30 minutes" },
        { metric: "Audit pack", target: "Accepted without material correction" },
      ],
    });
    await pilot.recordInstitutionalPilotObservation(managerId, spaceId, {
      observationType: "admin_journey",
      participantKey: "admin-001",
      summary: "The administrator completed the controlled journey without direct database access.",
      supportNeeds: [],
      minutesSpent: 26,
      manualDatabaseWork: false,
    });
    await pilot.recordInstitutionalPilotObservation(managerId, spaceId, {
      observationType: "learner_journey",
      participantKey: "learner-001",
      summary: "The learner completed assigned evidence and credential verification without direct support.",
      supportNeeds: [],
      minutesSpent: 18,
      manualDatabaseWork: false,
    });
    await pg.q(
      `INSERT INTO space_identity_providers
        (space_id,protocol,status,issuer,configuration_json,created_by_user_id,activated_at)
       VALUES ($1,'oidc','active','https://identity.example.test','{}',$2,$3)`,
      [spaceId, ownerId, new Date().toISOString()],
    );
    const hash = "a".repeat(64);
    const common = { outcome: "accepted" as const, summary: "Accepted by the responsible pilot stakeholder for the stated release purpose." };
    await pilot.attestInstitutionalPilotGate(ownerId, spaceId, { ...common, gateType: "manual_process_baseline" });
    await pilot.attestInstitutionalPilotGate(ownerId, spaceId, { ...common, gateType: "success_criteria" });
    await pilot.attestInstitutionalPilotGate(ownerId, spaceId, { ...common, gateType: "journey_acceptance" });
    await pilot.attestInstitutionalPilotGate(ownerId, spaceId, {
      ...common,
      gateType: "audit_pack_acceptance",
      auditPackId: acceptedAuditPackId,
    });
    await pilot.attestInstitutionalPilotGate(ownerId, spaceId, {
      ...common,
      gateType: "live_credential_revocation",
      credentialId,
    });
    for (const gateType of [
      "identity_provider_test",
      "penetration_test",
      "accessibility_audit",
      "incident_restore_exercise",
      "marketing_claim_review",
    ] as const) {
      await pilot.attestInstitutionalPilotGate(ownerId, spaceId, {
        ...common,
        gateType,
        artifactHash: hash,
      });
    }
    await pilot.attestInstitutionalPilotGate(ownerId, spaceId, { ...common, gateType: "willingness_to_pay" });
    const dashboard = await pilot.getInstitutionalPilotDashboard(auditorId, spaceId);
    expect(dashboard).toMatchObject({
      pilot: { id: created.pilotId, status: "active" },
      readiness: {
        ready: true,
        missing: [],
        technical: { completedParticipations: 1, reconciliationFailures: 0 },
      },
    });
    expect(await pilot.completeInstitutionalPilot(ownerId, spaceId)).toMatchObject({
      pilotId: created.pilotId,
      status: "completed",
    });
    expect(await pilot.completeInstitutionalPilot(ownerId, spaceId)).toEqual({
      pilotId: created.pilotId,
      status: "completed",
    });
    await expect(pg.q(
      "UPDATE institutional_pilot_gate_attestations SET outcome='rejected' WHERE pilot_id=$1",
      [created.pilotId],
    )).rejects.toThrow(/append-only/i);
  });
});
