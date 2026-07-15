import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuizCard } from "../lib/learning-types";
import {
  analyzeQuestionEvidence,
  confidenceForSample,
  inferPrerequisiteCandidates,
  type EligibleEvidenceDatum,
} from "../lib/learning-analysis";

function evidence(overrides: Partial<EligibleEvidenceDatum> = {}): EligibleEvidenceDatum {
  return {
    questionVersionId: "question-a",
    learnerKey: "learner-1",
    courseId: 1,
    conceptId: "concept-a",
    correct: true,
    skipped: false,
    responseTimeMs: 1200,
    occurredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("learning-genome analysis rules", () => {
  it("keeps small samples below the high-confidence boundary", () => {
    const rows = Array.from({ length: 8 }, (_, index) => evidence({
      learnerKey: `learner-${index}`,
      correct: index < 4,
      skipped: index === 7,
      responseTimeMs: 1000 + index * 100,
    }));
    const result = analyzeQuestionEvidence(rows)[0];
    expect(result.uniqueLearners).toBe(8);
    expect(result.flags).toContain("insufficient_sample");
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.correctRate).toBeCloseTo(4 / 7);
    expect(result.skipRate).toBeCloseTo(1 / 8);
    expect(confidenceForSample(30, 30)).toBeGreaterThanOrEqual(0.65);
  });

  it("emits provenance-bearing prerequisite candidates only after sample gates", () => {
    const rows: EligibleEvidenceDatum[] = [];
    for (let index = 0; index < 30; index++) {
      rows.push(evidence({
        learnerKey: `learner-${index}`,
        conceptId: "concept-a",
        questionVersionId: "question-a",
        occurredAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
      }));
      rows.push(evidence({
        learnerKey: `learner-${index}`,
        conceptId: "concept-b",
        questionVersionId: "question-b",
        occurredAt: `2026-01-02T00:${String(index).padStart(2, "0")}:00.000Z`,
      }));
    }
    const candidates = inferPrerequisiteCandidates(rows);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      prerequisiteConceptId: "concept-a",
      targetConceptId: "concept-b",
      learnerSample: 30,
      precedenceRate: 1,
    });
    expect(candidates[0].provenance.limitations.join(" ")).toMatch(/not proof/i);
    expect(inferPrerequisiteCandidates(rows.slice(0, 20))).toHaveLength(0);
  });
});

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("learning-genome governance", () => {
  let db: typeof import("../lib/db");
  let genome: typeof import("../lib/learning-genome");
  let pg: typeof import("../lib/pg");
  let adminId: number;
  let learnerId: number;
  let courseId: number;
  let lessonIds: number[];
  let questionVersionId: string;

  const cards: QuizCard[] = [
    {
      type: "quiz_mcq",
      concept: "foundations",
      question: "Which answer is the foundation?",
      options: ["A", "B", "C", "D"],
      correct_index: 0,
      explanation: "A is the foundation.",
    },
    {
      type: "quiz_mcq",
      concept: "application",
      question: "Which answer applies it?",
      options: ["A", "B", "C", "D"],
      correct_index: 1,
      explanation: "B applies it.",
    },
  ];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    genome = await import("../lib/learning-genome");
    await pg.ready();
    await pg.q(`TRUNCATE
      concept_mapping_events, concept_mapping_proposals, question_review_decisions,
      question_quality_snapshots, prerequisite_candidates, course_placement_preferences,
      learning_feature_flags, explanation_experiment_versions, learning_analysis_versions,
      learning_events, lesson_completion_events, question_versions, concepts,
      learning_identities, answer_sessions, practice_sessions, concept_mastery,
      progress, user_stats, review_items, enrollments, certificates,
      classroom_assignments, classroom_members, classrooms, transactions,
      account_tokens, sessions, consent_records, lessons, modules, courses, users
      RESTART IDENTITY CASCADE`);

    const admin = await db.createUser("genome-admin@example.com", "Genome Admin", "hash");
    adminId = admin.id;
    await pg.q("UPDATE users SET role='admin' WHERE id=$1", [adminId]);
    const learner = await db.createUser("genome-learner@example.com", "Genome Learner", "hash");
    learnerId = learner.id;
    const withdrawn = await db.createUser("genome-withdrawn@example.com", "Withdrawn Learner", "hash");

    const course = await db.createCourse(adminId, "genome.pdf");
    courseId = course.id;
    const moduleId = await db.createModule(courseId, "Genome", "Quality", 0);
    lessonIds = [
      await db.createLesson(moduleId, "Foundations", 0, JSON.stringify(cards)),
      await db.createLesson(moduleId, "Application", 1, JSON.stringify([cards[1]])),
    ];
    await pg.q("UPDATE courses SET published=1,status='ready' WHERE id=$1", [courseId]);
    await pg.q(
      `INSERT INTO consent_records (user_id,purpose,version,decision,source)
       VALUES ($1,'product_research','research-v1','granted','test'),
              ($2,'product_research','research-v1','withdrawn','test')`,
      [learnerId, withdrawn.id]
    );

    const learnerSession = await db.createLessonAnswerSession(learnerId, lessonIds[0]);
    const withdrawnSession = await db.createLessonAnswerSession(withdrawn.id, lessonIds[0]);
    if (!learnerSession || !withdrawnSession) throw new Error("Could not create answer sessions");
    const recorded = await db.recordAnswerEvidence({
      eventId: "genome-eligible-event",
      userId: learnerId,
      courseId,
      lessonId: lessonIds[0],
      cardIndex: 0,
      questionId: `lesson:${lessonIds[0]}:card:0`,
      concept: "foundations",
      card: cards[0],
      answer: 0,
      responseTimeMs: 2300,
      occurredAt: "2026-01-01T00:00:00.000Z",
      sessionKind: "lesson",
      sessionId: learnerSession.id,
    });
    questionVersionId = recorded.questionVersionId;
    await db.recordAnswerEvidence({
      eventId: "genome-withdrawn-event",
      userId: withdrawn.id,
      courseId,
      lessonId: lessonIds[0],
      cardIndex: 0,
      questionId: `lesson:${lessonIds[0]}:card:0`,
      concept: "foundations",
      card: cards[0],
      answer: 1,
      responseTimeMs: 5100,
      occurredAt: "2026-01-01T01:00:00.000Z",
      sessionKind: "lesson",
      sessionId: withdrawnSession.id,
    });
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("versions only public evidence with current research consent", async () => {
    const draft = await genome.buildLearningAnalysis(adminId);
    expect(draft.counts).toEqual({
      source_events: 2,
      public_events: 2,
      consented_events: 1,
      eligible_events: 1,
    });
    expect(draft.questionCount).toBe(1);
    const snapshot = await pg.one<{
      unique_learners: number;
      confidence: number;
      flags_json: string;
    }>("SELECT unique_learners,confidence,flags_json FROM question_quality_snapshots WHERE analysis_version_id=$1", [draft.id]);
    expect(snapshot?.unique_learners).toBe(1);
    expect(snapshot?.confidence).toBeLessThan(0.5);
    expect(JSON.parse(snapshot?.flags_json ?? "[]")).toContain("insufficient_sample");
    await expect(pg.q(
      "UPDATE question_quality_snapshots SET confidence=1 WHERE analysis_version_id=$1",
      [draft.id]
    )).rejects.toThrow(/immutable/);

    await genome.reviewQuestion({
      actorUserId: adminId,
      questionVersionId,
      analysisVersionId: draft.id,
      decision: "keep",
      reason: "Reviewed against the source and answer key.",
    });
    const concepts = await pg.many<{ id: string }>("SELECT id FROM concepts ORDER BY label");
    const mapping = await genome.proposeConceptMapping({
      actorUserId: adminId,
      analysisVersionId: draft.id,
      sourceConceptId: concepts[0].id,
      targetConceptId: concepts[1].id,
      confidence: 0.9,
      rationale: "A human-reviewable mapping proposed from course context.",
    });
    expect(mapping).toMatchObject({ effectiveConfidence: 0.49, sampleLimited: true });
    await genome.reviewConceptMapping({
      actorUserId: adminId,
      mappingId: mapping.id,
      decision: "approved",
      reason: "Approved after checking both course concepts.",
    });
    await genome.reviewConceptMapping({
      actorUserId: adminId,
      mappingId: mapping.id,
      decision: "revoked",
      reason: "Revoked after a later curriculum review.",
    });
    expect((await pg.one<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM concept_mapping_events WHERE mapping_id=$1",
      [mapping.id]
    ))?.count).toBe(3);
    await expect(pg.q(
      "DELETE FROM concept_mapping_events WHERE mapping_id=$1",
      [mapping.id]
    )).rejects.toThrow(/immutable/);
    await expect(genome.publishLearningAnalysis(adminId, draft.id)).resolves.toMatchObject({
      status: "published",
      version: 1,
    });

    await genome.reviewQuestion({
      actorUserId: adminId,
      questionVersionId,
      analysisVersionId: draft.id,
      decision: "retire",
      reason: "Retired after the human review found a replacement was needed.",
    });
    const laterSession = await db.createLessonAnswerSession(learnerId, lessonIds[0]);
    expect(laterSession?.items.some(
      (item) => item.questionId === `lesson:${lessonIds[0]}:card:0`
    )).toBe(false);
  });

  it("keeps placement default-off and preserves learner overrides", async () => {
    const defaultRecommendation = await genome.getPlacementRecommendation(learnerId, courseId);
    expect(defaultRecommendation).toMatchObject({ enabled: false, confidence: 0 });
    expect(defaultRecommendation.recommendedLesson.id).toBe(lessonIds[0]);

    const flags = await genome.setLearningFeatureFlags({
      actorUserId: adminId,
      courseId,
      placementEnabled: true,
    });
    expect(flags).toMatchObject({ placement_enabled: true });
    const saved = await genome.savePlacementPreference({
      userId: learnerId,
      courseId,
      selectedLessonId: lessonIds[1],
      decision: "overridden",
    });
    expect(saved).toMatchObject({ selectedLessonId: lessonIds[1], decision: "overridden" });
    expect((await genome.getPlacementRecommendation(learnerId, courseId)).latestPreference)
      .toMatchObject({ selected_lesson_id: lessonIds[1], decision: "overridden" });
  });
});
