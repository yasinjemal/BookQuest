import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuizCard } from "../lib/learning-types";

const TEST_DB = process.env.TEST_DATABASE_URL;

let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let ownerId: number;
let learnerId: number;
let outsiderId: number;
let lateLearnerId: number;
let revokedInviteeId: number;
let courseId: number;
let lessonId: number;
let privateSpaceId: string;
let invitationToken: string;
let assignmentId: string;
let answerSessionId: string;
let practiceSessionId: string;

const card: QuizCard = {
  type: "quiz_mcq",
  concept: "tenant boundaries",
  question: "What grants access to a private Space assignment?",
  options: ["An active membership", "A guessed URL", "A platform role", "A cache"],
  correct_index: 0,
  explanation: "Private Space access requires a current authorized membership.",
};

describe.skipIf(!TEST_DB)("Phase 1 Space tenancy vertical slice", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    await pg.ready();
    await pg.q(`TRUNCATE
      space_assignment_members, space_audit_events, learning_events,
      lesson_completion_events, question_versions, concepts, learning_identities,
      answer_sessions, practice_sessions, space_assignments, space_courses,
      space_team_members, space_teams, space_invitations, space_memberships,
      legacy_classroom_spaces, spaces,
      review_items, progress, enrollments, classroom_assignments,
      classroom_members, classrooms, lessons, modules, courses, consent_records,
      privacy_actions, account_tokens, sessions, user_stats, users
      RESTART IDENTITY CASCADE`);

    ownerId = (await db.createUser("owner@spaces.test", "Space Owner", "hash")).id;
    learnerId = (await db.createUser("learner@spaces.test", "Space Learner", "hash")).id;
    outsiderId = (await db.createUser("outsider@spaces.test", "Space Outsider", "hash")).id;
    lateLearnerId = (await db.createUser("late@spaces.test", "Late Learner", "hash")).id;
    revokedInviteeId = (await db.createUser("revoked@spaces.test", "Revoked Invitee", "hash")).id;
    const createdCourse = await db.createCourse(ownerId, "space-course.pdf");
    courseId = createdCourse.id;
    const moduleId = await db.createModule(
      courseId,
      "Boundaries",
      "Private tenancy",
      0,
      [],
      createdCourse.generationRunId
    );
    lessonId = await db.createLesson(
      moduleId,
      "Access",
      0,
      JSON.stringify([card]),
      {
        generatorModel: "test-model",
        promptVersion: "space-test-v1",
        generationRunId: createdCourse.generationRunId,
      }
    );
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("creates exactly one active personal Space and owner membership per account", async () => {
    for (const userId of [ownerId, learnerId, outsiderId, lateLearnerId, revokedInviteeId]) {
      const result = (await pg.one(
        `SELECT COUNT(*)::int AS spaces,
          COUNT(m.id)::int AS memberships,
          MIN(m.role) AS role,
          MIN(m.status) AS status
         FROM spaces s
         LEFT JOIN space_memberships m
           ON m.space_id = s.id AND m.user_id = s.personal_owner_user_id
         WHERE s.personal_owner_user_id = $1`,
        [userId]
      )) as { spaces: number; memberships: number; role: string; status: string };
      expect(result).toEqual({
        spaces: 1,
        memberships: 1,
        role: "owner",
        status: "active",
      });
    }
    const course = (await pg.one(
      "SELECT owning_space_id FROM courses WHERE id = $1",
      [courseId]
    )) as { owning_space_id: string | null };
    expect(course.owning_space_id).toBeTruthy();
  });

  it("creates a private Space and denies non-members without leaking access", async () => {
    const created = await spaces.createSpace(ownerId, {
      name: "Private Learning Group",
      type: "private",
      timezone: "Africa/Johannesburg",
    });
    privateSpaceId = created.space.id;
    expect(created.space).toMatchObject({
      type: "private",
      status: "active",
      discovery_policy: "hidden",
      entry_policy: "invitation",
    });
    expect(created.membership).toMatchObject({
      user_id: ownerId,
      role: "owner",
      status: "active",
    });
    await expect(
      spaces.inviteSpaceMember(outsiderId, privateSpaceId, learnerId)
    ).rejects.toMatchObject({ reason: "membership_required" });
  });

  it("keeps private and unlisted metadata out of public discovery", async () => {
    const publicSpace = await spaces.createSpace(ownerId, {
      name: "Open Learning Community",
      type: "public",
    });
    await spaces.updateSpaceProfile(ownerId, publicSpace.space.id, {
      description: "Public learning resources",
      language: "en-ZA",
      branding: { accent: "amber" },
    });
    const unlisted = await spaces.createSpace(ownerId, {
      name: "Link-only Group",
      type: "unlisted",
    });
    const discovered = await spaces.listPublicSpaces();
    expect(discovered.map((space) => space.id)).toContain(publicSpace.space.id);
    expect(discovered.map((space) => space.id)).not.toContain(privateSpaceId);
    expect(discovered.map((space) => space.id)).not.toContain(unlisted.space.id);
  });

  it("updates versioned policies and safe child-Space profile fields", async () => {
    const organization = await spaces.createSpace(ownerId, {
      name: "Learning Organization",
      type: "organization",
    });
    const before = await spaces.getSpace(privateSpaceId);
    const policies = await spaces.updateSpacePolicies(ownerId, privateSpaceId, {
      member_directory_policy: "managers",
      content_sharing_policy: "owner_only",
    });
    expect(policies.policy_version).toBe(before!.policy_version + 1);
    const profiled = await spaces.updateSpaceProfile(ownerId, privateSpaceId, {
      description: "A controlled learning cohort",
      language: "en-ZA",
      timezone: "Africa/Johannesburg",
      parentSpaceId: organization.space.id,
      profile: { audience: "students" },
      branding: { accent: "teal" },
    });
    expect(profiled).toMatchObject({
      parent_space_id: organization.space.id,
      language: "en-ZA",
      timezone: "Africa/Johannesburg",
    });
    await expect(
      spaces.updateSpaceProfile(ownerId, organization.space.id, {
        parentSpaceId: privateSpaceId,
      })
    ).rejects.toThrow(/cycle/i);
  });

  it("invites and activates a learner exactly once", async () => {
    const invited = await spaces.inviteSpaceMember(
      ownerId,
      privateSpaceId,
      learnerId,
      "learner"
    );
    invitationToken = invited.token;
    expect(invited.invitation.status).toBe("pending");
    expect(await spaces.resolveCourseLearningContext(learnerId, courseId, pg.pool)).toBeUndefined();

    const accepted = await spaces.acceptSpaceInvitation(learnerId, invitationToken);
    expect(accepted.membership).toMatchObject({
      user_id: learnerId,
      status: "active",
      role: "learner",
    });
    await expect(
      spaces.acceptSpaceInvitation(learnerId, invitationToken)
    ).rejects.toMatchObject({ reason: "invitation_invalid" });
  });

  it("attaches an owned course, creates an assignment and derives evidence context", async () => {
    await spaces.attachCourseToSpace(ownerId, privateSpaceId, courseId);
    const assignment = await spaces.createSpaceAssignment(
      ownerId,
      privateSpaceId,
      courseId
    );
    assignmentId = assignment.id;

    const context = await spaces.resolveCourseLearningContext(
      learnerId,
      courseId,
      pg.pool
    );
    expect(context).toMatchObject({
      spaceId: privateSpaceId,
      assignmentId,
      basis: "assignment",
    });
    expect(await db.canAccessCourse(learnerId, courseId)).toBe(true);

    answerSessionId = (await db.createLessonAnswerSession(learnerId, lessonId))!.id;
    practiceSessionId = (
      await db.createPracticeSession(
        learnerId,
        courseId,
        [{ concept: card.concept!, card, lessonId, cardIndex: 0 }],
        false
      )
    ).id;
    const storedSession = (await pg.one(
      `SELECT space_id, membership_id, assignment_id FROM practice_sessions WHERE id = $1`,
      [practiceSessionId]
    )) as Record<string, unknown>;
    expect(storedSession).toMatchObject({
      space_id: privateSpaceId,
      membership_id: context!.membershipId,
      assignment_id: assignmentId,
    });

    const recorded = await db.recordAnswerEvidence({
      eventId: "space_assignment_event_1",
      userId: learnerId,
      courseId,
      lessonId,
      cardIndex: 0,
      questionId: `lesson:${lessonId}:card:0`,
      concept: card.concept!,
      card,
      answer: 0,
      responseTimeMs: 900,
      occurredAt: new Date().toISOString(),
      sessionKind: "lesson",
      sessionId: "space_assignment_session_1",
    });
    expect(recorded.inserted).toBe(true);
    const evidence = (await pg.one(
      `SELECT space_id, membership_id, assignment_id, space_policy_version,
              schema_version
       FROM learning_events WHERE event_id = $1`,
      [recorded.eventId]
    )) as Record<string, unknown>;
    expect(evidence).toEqual({
      space_id: privateSpaceId,
      membership_id: context!.membershipId,
      assignment_id: assignmentId,
      space_policy_version: context!.policyVersion,
      schema_version: 2,
    });

    const learnerKey = await db.getLearnerKey(learnerId);
    expect(await db.recordLessonCompletion({
      answerSessionId: "space_assignment_session_1",
      userId: learnerId,
      learnerKey,
      courseId,
      lessonId,
      score: 1,
      total: 1,
      xpAwarded: 15,
    })).toBe(true);
    const completion = (await pg.one(
      `SELECT space_id, membership_id, assignment_id, space_policy_version
       FROM lesson_completion_events WHERE answer_session_id = $1`,
      ["space_assignment_session_1"]
    )) as Record<string, unknown>;
    expect(completion).toEqual({
      space_id: privateSpaceId,
      membership_id: context!.membershipId,
      assignment_id: assignmentId,
      space_policy_version: context!.policyVersion,
    });
  });

  it("adds members who accept later to active assignments", async () => {
    const invited = await spaces.inviteSpaceMember(ownerId, privateSpaceId, lateLearnerId);
    await spaces.acceptSpaceInvitation(lateLearnerId, invited.token);
    expect(await spaces.resolveCourseLearningContext(lateLearnerId, courseId, pg.pool)).toMatchObject({
      spaceId: privateSpaceId,
      assignmentId,
      basis: "assignment",
    });
  });

  it("scopes teams to active memberships in the same Space", async () => {
    const team = await spaces.createSpaceTeam(ownerId, privateSpaceId, "Cohort A");
    await spaces.addSpaceTeamMember(ownerId, privateSpaceId, team.id, lateLearnerId);
    const dashboard = await spaces.getSpaceDashboard(ownerId, privateSpaceId);
    expect(dashboard.teams).toContainEqual({
      id: team.id,
      name: "Cohort A",
      status: "active",
      member_count: 1,
    });
    await expect(
      spaces.addSpaceTeamMember(ownerId, privateSpaceId, team.id, outsiderId)
    ).rejects.toMatchObject({ reason: "wrong_space" });
    await spaces.removeSpaceTeamMember(ownerId, privateSpaceId, team.id, lateLearnerId);
  });

  it("applies role changes immediately and prevents revoked invitation reuse", async () => {
    await spaces.updateSpaceMemberRole(ownerId, privateSpaceId, learnerId, "manager");
    const pending = await spaces.inviteSpaceMember(
      learnerId,
      privateSpaceId,
      revokedInviteeId,
      "learner"
    );
    await spaces.updateSpaceMemberRole(ownerId, privateSpaceId, learnerId, "learner");
    await expect(
      spaces.inviteSpaceMember(learnerId, privateSpaceId, outsiderId)
    ).rejects.toMatchObject({ reason: "capability_missing" });
    await spaces.revokeSpaceInvitation(ownerId, privateSpaceId, pending.invitation.id);
    await expect(
      spaces.acceptSpaceInvitation(revokedInviteeId, pending.token)
    ).rejects.toMatchObject({ reason: "invitation_invalid" });
    const audits = (await pg.one(
      `SELECT COUNT(*)::int AS count FROM space_audit_events
       WHERE space_id = $1 AND event_type IN ('membership.role_changed', 'invitation.revoked')`,
      [privateSpaceId]
    )) as { count: number };
    expect(audits.count).toBe(3);
  });

  it("expires invitation state and prevents later reuse", async () => {
    const pending = await spaces.inviteSpaceMember(ownerId, privateSpaceId, outsiderId);
    await pg.q(
      "UPDATE space_invitations SET expires_at = $2 WHERE id = $1",
      [pending.invitation.id, new Date(Date.now() - 1_000).toISOString()]
    );
    await expect(
      spaces.acceptSpaceInvitation(outsiderId, pending.token)
    ).rejects.toMatchObject({ reason: "invitation_expired" });
    await expect(
      spaces.acceptSpaceInvitation(outsiderId, pending.token)
    ).rejects.toMatchObject({ reason: "invitation_invalid" });
    expect(await spaces.getSpaceMembership(privateSpaceId, outsiderId)).toMatchObject({
      status: "expired",
    });
  });

  it("blocks cross-tenant course attachment", async () => {
    const outsiderCourse = await db.createCourse(outsiderId, "foreign.pdf");
    await expect(
      spaces.attachCourseToSpace(ownerId, privateSpaceId, outsiderCourse.id)
    ).rejects.toMatchObject({ reason: "wrong_space" });
    await expect(
      spaces.authorizeCourseAction(learnerId, courseId, "content.update")
    ).rejects.toMatchObject({ reason: "membership_required" });
    await pg.q("UPDATE users SET role = 'admin' WHERE id = $1", [outsiderId]);
    await expect(
      spaces.authorizeCourseAction(outsiderId, courseId, "content.publish")
    ).rejects.toMatchObject({ reason: "membership_required" });
    await expect(
      spaces.authorizeCourseAction(ownerId, courseId, "content.publish")
    ).resolves.toBeUndefined();
  });

  it("revokes access immediately for cached sessions and queued answers", async () => {
    await spaces.removeSpaceMember(ownerId, privateSpaceId, learnerId);
    expect(await spaces.resolveCourseLearningContext(learnerId, courseId, pg.pool)).toBeUndefined();
    expect(await db.canAccessCourse(learnerId, courseId)).toBe(false);
    expect(await db.getAnswerSession(learnerId, answerSessionId, "lesson")).toBeUndefined();
    expect(await db.getPracticeSession(learnerId, practiceSessionId)).toBeUndefined();
    await expect(
      db.recordAnswerEvidence({
        eventId: "space_assignment_event_after_revoke",
        userId: learnerId,
        courseId,
        lessonId,
        cardIndex: 0,
        questionId: `lesson:${lessonId}:card:0`,
        concept: card.concept!,
        card,
        answer: 0,
        responseTimeMs: 1000,
        occurredAt: new Date().toISOString(),
        sessionKind: "lesson",
        sessionId: "cached_session_after_revoke",
      })
    ).rejects.toBeInstanceOf(db.CourseParticipationRevokedError);
  });

  it("keeps Space audit history append-only", async () => {
    const events = (await pg.one(
      "SELECT COUNT(*)::int AS n FROM space_audit_events WHERE space_id = $1",
      [privateSpaceId]
    )) as { n: number };
    expect(events.n).toBeGreaterThanOrEqual(5);
    await expect(
      pg.q(
        "UPDATE space_audit_events SET event_type = 'tampered' WHERE space_id = $1",
        [privateSpaceId]
      )
    ).rejects.toThrow(/append-only/);
    const assignment = (await pg.one(
      "SELECT status FROM space_assignments WHERE id = $1",
      [assignmentId]
    )) as { status: string };
    expect(assignment.status).toBe("active");
  });

  it("keeps legacy class creation, codes and assignments inside Space policy", async () => {
    const classroom = await db.createClassroom(ownerId, "Legacy-compatible Class");
    const mapped = (await pg.one(
      `SELECT s.id AS space_id, s.preset, s.join_code_enabled
       FROM legacy_classroom_spaces legacy
       JOIN spaces s ON s.id = legacy.space_id
       WHERE legacy.classroom_id = $1`,
      [classroom.id]
    )) as { space_id: string; preset: string; join_code_enabled: number };
    expect(mapped).toMatchObject({ preset: "class", join_code_enabled: 1 });

    await spaces.joinLegacyClassroomSpaceByCode(revokedInviteeId, classroom.id);
    expect(await spaces.getSpaceMembership(mapped.space_id, revokedInviteeId)).toMatchObject({
      status: "active",
      role: "learner",
    });
    await spaces.assignLegacyClassroomCourse(ownerId, classroom.id, courseId);
    expect(await spaces.resolveCourseLearningContext(revokedInviteeId, courseId, pg.pool)).toMatchObject({
      spaceId: mapped.space_id,
      basis: "assignment",
    });
    await spaces.unassignLegacyClassroomCourse(ownerId, classroom.id, courseId);
    expect(await spaces.resolveCourseLearningContext(revokedInviteeId, courseId, pg.pool)).toBeUndefined();

    await pg.q("UPDATE spaces SET join_code_enabled = 0 WHERE id = $1", [mapped.space_id]);
    await expect(
      spaces.joinLegacyClassroomSpaceByCode(outsiderId, classroom.id)
    ).rejects.toMatchObject({ reason: "membership_required" });
  });

  it("exports for the owner and enforces archived/deletion-scheduled read-only state", async () => {
    const bundle = await spaces.exportSpaceBundle(ownerId, privateSpaceId);
    expect(bundle).toMatchObject({ schemaVersion: 2, space: { id: privateSpaceId } });
    expect(bundle.memberships.length).toBeGreaterThan(0);
    await expect(
      spaces.exportSpaceBundle(lateLearnerId, privateSpaceId)
    ).rejects.toMatchObject({ reason: "capability_missing" });

    expect((await spaces.updateSpaceLifecycle(ownerId, privateSpaceId, "archived")).status).toBe("archived");
    await expect(
      spaces.createSpaceTeam(ownerId, privateSpaceId, "Blocked while archived")
    ).rejects.toMatchObject({ reason: "space_read_only" });
    expect((await spaces.updateSpaceLifecycle(ownerId, privateSpaceId, "active")).status).toBe("active");
    const scheduled = await spaces.updateSpaceLifecycle(ownerId, privateSpaceId, "deletion_scheduled");
    expect(scheduled.deletion_scheduled_at).toBeTruthy();
    expect((await spaces.updateSpaceLifecycle(ownerId, privateSpaceId, "active")).deletion_scheduled_at).toBeNull();
  });
});
