import crypto from "crypto";
import type { PoolClient } from "pg";
import { many, one, q, tx } from "./pg";
import {
  analyzeQuestionEvidence,
  DEFAULT_MINIMUM_LEARNER_SAMPLE,
  inferPrerequisiteCandidates,
  LEARNING_GENOME_ALGORITHM_VERSION,
  type EligibleEvidenceDatum,
} from "./learning-analysis";

export {
  analyzeQuestionEvidence,
  confidenceForSample,
  DEFAULT_MINIMUM_LEARNER_SAMPLE,
  inferPrerequisiteCandidates,
  LEARNING_GENOME_ALGORITHM_VERSION,
} from "./learning-analysis";
export type {
  EligibleEvidenceDatum,
  PrerequisiteCandidateResult,
  QuestionQualityResult,
} from "./learning-analysis";

export class LearningGenomeError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "LearningGenomeError";
  }
}


async function requireAdmin(actorUserId: number, client: PoolClient) {
  const row = (await client.query<{ role: string }>(
    "SELECT role FROM users WHERE id=$1 FOR SHARE",
    [actorUserId]
  )).rows[0];
  if (!row || row.role !== "admin") throw new LearningGenomeError("Admin only", 403);
}

async function eligibilityCounts(client?: PoolClient) {
  const sql = `WITH scoped AS (
       SELECT event.id,
              event.privacy_scope='public_course'
                AND question.privacy_scope='public_course' AS is_public,
              COALESCE(research.decision='granted',FALSE) AS is_consented
         FROM learning_events event
         JOIN question_versions question ON question.id=event.question_version_id
         JOIN learning_identities identity ON identity.learner_key=event.learner_key
         LEFT JOIN LATERAL (
           SELECT decision FROM consent_records
            WHERE user_id=identity.user_id AND purpose='product_research'
            ORDER BY recorded_at DESC,id DESC LIMIT 1
         ) research ON TRUE
     )
     SELECT COUNT(*)::int AS source_events,
            COUNT(*) FILTER (WHERE is_public)::int AS public_events,
            COUNT(*) FILTER (WHERE is_consented)::int AS consented_events,
            COUNT(*) FILTER (WHERE is_public AND is_consented)::int AS eligible_events
       FROM scoped`;
  type CountRow = {
    source_events: number;
    public_events: number;
    consented_events: number;
    eligible_events: number;
  };
  const result = client
    ? await client.query<CountRow>(sql)
    : await q<CountRow>(sql);
  return result.rows[0] ?? {
    source_events: 0,
    public_events: 0,
    consented_events: 0,
    eligible_events: 0,
  };
}

async function eligibleEvidence(client: PoolClient): Promise<EligibleEvidenceDatum[]> {
  const rows = (await client.query<{
    question_version_id: string;
    learner_key: string;
    course_id: number | null;
    concept_id: string;
    is_correct: number;
    was_skipped: number;
    response_time_ms: number;
    occurred_at: string;
  }>(
    `SELECT event.question_version_id,event.learner_key,event.course_id,
            event.concept_id,event.is_correct,event.was_skipped,
            event.response_time_ms,event.occurred_at
       FROM learning_events event
       JOIN question_versions question ON question.id=event.question_version_id
       JOIN learning_identities identity ON identity.learner_key=event.learner_key
       JOIN LATERAL (
         SELECT decision FROM consent_records
          WHERE user_id=identity.user_id AND purpose='product_research'
          ORDER BY recorded_at DESC,id DESC LIMIT 1
       ) research ON TRUE
      WHERE event.privacy_scope='public_course'
        AND question.privacy_scope='public_course'
        AND research.decision='granted'
      ORDER BY event.recorded_at,event.id`
  )).rows;
  return rows.map((row) => ({
    questionVersionId: row.question_version_id,
    learnerKey: row.learner_key,
    courseId: row.course_id,
    conceptId: row.concept_id,
    correct: Boolean(row.is_correct),
    skipped: Boolean(row.was_skipped),
    responseTimeMs: row.response_time_ms,
    occurredAt: row.occurred_at,
  }));
}

export async function buildLearningAnalysis(actorUserId: number) {
  return tx(async (client) => {
    await requireAdmin(actorUserId, client);
    await client.query("SELECT pg_advisory_xact_lock($1)", [6612062026]);
    const counts = await eligibilityCounts(client);
    const evidence = await eligibleEvidence(client);
    const quality = analyzeQuestionEvidence(evidence);
    const prerequisites = inferPrerequisiteCandidates(evidence);
    const nextVersion = Number((await client.query<{ version: number }>(
      "SELECT COALESCE(MAX(version),0)+1 AS version FROM learning_analysis_versions"
    )).rows[0].version);
    const cutoff = new Date().toISOString();
    const limitations = [
      "Only public-course evidence from learners with current product-research consent is eligible.",
      "Statistics are descriptive; no causal learning claim is permitted.",
      `Questions below ${DEFAULT_MINIMUM_LEARNER_SAMPLE} unique learners remain low-confidence.`,
    ];
    const analysis = (await client.query<{ id: string }>(
      `INSERT INTO learning_analysis_versions
        (version,status,algorithm_version,minimum_learner_sample,
         source_event_count,public_event_count,consented_event_count,
         eligible_event_count,source_cutoff,limitations_json,created_by_user_id)
       VALUES ($1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        nextVersion,
        LEARNING_GENOME_ALGORITHM_VERSION,
        DEFAULT_MINIMUM_LEARNER_SAMPLE,
        counts.source_events,
        counts.public_events,
        counts.consented_events,
        counts.eligible_events,
        cutoff,
        JSON.stringify(limitations),
        actorUserId,
      ]
    )).rows[0];
    for (const item of quality) {
      await client.query(
        `INSERT INTO question_quality_snapshots
          (analysis_version_id,question_version_id,course_id,concept_id,attempts,
           unique_learners,correct_rate,skip_rate,avg_response_time_ms,difficulty,
           discrimination,confidence,flags_json,limitations_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          analysis.id,
          item.questionVersionId,
          item.courseId,
          item.conceptId,
          item.attempts,
          item.uniqueLearners,
          item.correctRate,
          item.skipRate,
          item.avgResponseTimeMs,
          item.difficulty,
          item.discrimination,
          item.confidence,
          JSON.stringify(item.flags),
          JSON.stringify(item.limitations),
        ]
      );
    }
    for (const candidate of prerequisites.slice(0, 500)) {
      await client.query(
        `INSERT INTO prerequisite_candidates
          (analysis_version_id,prerequisite_concept_id,target_concept_id,
           learner_sample,precedence_rate,confidence,provenance_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          analysis.id,
          candidate.prerequisiteConceptId,
          candidate.targetConceptId,
          candidate.learnerSample,
          candidate.precedenceRate,
          candidate.confidence,
          JSON.stringify(candidate.provenance),
        ]
      );
    }
    return {
      id: analysis.id,
      version: nextVersion,
      status: "draft" as const,
      counts,
      questionCount: quality.length,
      prerequisiteCandidateCount: prerequisites.length,
      limitations,
    };
  });
}

export async function publishLearningAnalysis(actorUserId: number, analysisId: string) {
  return tx(async (client) => {
    await requireAdmin(actorUserId, client);
    const target = (await client.query<{ id: string; status: string; version: number }>(
      "SELECT id,status,version FROM learning_analysis_versions WHERE id=$1 FOR UPDATE",
      [analysisId]
    )).rows[0];
    if (!target) throw new LearningGenomeError("Analysis version not found", 404);
    if (target.status !== "draft") {
      throw new LearningGenomeError("Only a draft analysis can be published", 409);
    }
    const at = new Date().toISOString();
    await client.query(
      "UPDATE learning_analysis_versions SET status='superseded' WHERE status='published'"
    );
    await client.query(
      "UPDATE learning_analysis_versions SET status='published',published_at=$2 WHERE id=$1",
      [analysisId, at]
    );
    return { id: target.id, version: target.version, status: "published" as const, publishedAt: at };
  });
}

export async function reviewQuestion(input: {
  actorUserId: number;
  questionVersionId: string;
  analysisVersionId?: string;
  decision: "keep" | "revise" | "retire";
  reason: string;
}) {
  if (!(new Set(["keep", "revise", "retire"])).has(input.decision)) {
    throw new LearningGenomeError("Invalid question review decision");
  }
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) {
    throw new LearningGenomeError("Review reason must be 5 to 1000 characters");
  }
  return tx(async (client) => {
    await requireAdmin(input.actorUserId, client);
    const question = (await client.query("SELECT 1 FROM question_versions WHERE id=$1", [
      input.questionVersionId,
    ])).rowCount;
    if (!question) throw new LearningGenomeError("Question version not found", 404);
    const row = (await client.query<{ id: string; created_at: string }>(
      `INSERT INTO question_review_decisions
        (question_version_id,analysis_version_id,decision,reason,reviewer_user_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,created_at`,
      [
        input.questionVersionId,
        input.analysisVersionId ?? null,
        input.decision,
        reason,
        input.actorUserId,
      ]
    )).rows[0];
    return { id: row.id, decision: input.decision, reason, createdAt: row.created_at };
  });
}

export async function proposeConceptMapping(input: {
  actorUserId: number;
  analysisVersionId: string;
  sourceConceptId: string;
  targetConceptId: string;
  confidence: number;
  rationale: string;
}) {
  if (input.sourceConceptId === input.targetConceptId) {
    throw new LearningGenomeError("A concept cannot map to itself");
  }
  const rationale = input.rationale.trim();
  if (rationale.length < 10 || rationale.length > 1000) {
    throw new LearningGenomeError("Mapping rationale must be 10 to 1000 characters");
  }
  if (!Number.isFinite(input.confidence)) {
    throw new LearningGenomeError("Mapping confidence must be a number from 0 to 1");
  }
  const proposedConfidence = Math.max(0, Math.min(1, input.confidence));
  return tx(async (client) => {
    await requireAdmin(input.actorUserId, client);
    const analysis = (await client.query<{
      minimum_learner_sample: number;
    }>(
      `SELECT minimum_learner_sample
         FROM learning_analysis_versions WHERE id=$1 FOR SHARE`,
      [input.analysisVersionId]
    )).rows[0];
    if (!analysis) throw new LearningGenomeError("Analysis version not found", 404);
    const concepts = await client.query(
      "SELECT id FROM concepts WHERE id=ANY($1::text[])",
      [[input.sourceConceptId, input.targetConceptId]]
    );
    if (concepts.rowCount !== 2) throw new LearningGenomeError("Concept not found", 404);
    const evidence = await eligibleEvidence(client);
    const sourceLearners = new Set(
      evidence.filter((row) => row.conceptId === input.sourceConceptId).map((row) => row.learnerKey)
    );
    const targetLearners = new Set(
      evidence.filter((row) => row.conceptId === input.targetConceptId).map((row) => row.learnerKey)
    );
    const overlappingLearners = [...sourceLearners].filter((key) => targetLearners.has(key)).length;
    const sampleCap = overlappingLearners < analysis.minimum_learner_sample ? 0.49 : 0.95;
    const effectiveConfidence = Math.min(proposedConfidence, sampleCap);
    const row = (await client.query<{ id: string; created_at: string }>(
      `INSERT INTO concept_mapping_proposals
        (analysis_version_id,source_concept_id,target_concept_id,
         proposed_confidence,effective_confidence,rationale,proposed_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at`,
      [
        input.analysisVersionId,
        input.sourceConceptId,
        input.targetConceptId,
        proposedConfidence,
        effectiveConfidence,
        rationale,
        input.actorUserId,
      ]
    )).rows[0];
    await client.query(
      `INSERT INTO concept_mapping_events (mapping_id,event_type,actor_user_id,reason)
       VALUES ($1,'proposed',$2,$3)`,
      [row.id, input.actorUserId, rationale]
    );
    return {
      id: row.id,
      status: "proposed" as const,
      proposedConfidence,
      effectiveConfidence,
      sampleLimited: effectiveConfidence < proposedConfidence,
      learnerSample: overlappingLearners,
      createdAt: row.created_at,
    };
  });
}

export async function reviewConceptMapping(input: {
  actorUserId: number;
  mappingId: string;
  decision: "approved" | "rejected" | "revoked";
  reason: string;
}) {
  if (!(new Set(["approved", "rejected", "revoked"])).has(input.decision)) {
    throw new LearningGenomeError("Invalid mapping decision");
  }
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) {
    throw new LearningGenomeError("Decision reason must be 5 to 1000 characters");
  }
  return tx(async (client) => {
    await requireAdmin(input.actorUserId, client);
    const mapping = (await client.query<{ status: string }>(
      "SELECT status FROM concept_mapping_proposals WHERE id=$1 FOR UPDATE",
      [input.mappingId]
    )).rows[0];
    if (!mapping) throw new LearningGenomeError("Mapping not found", 404);
    const valid =
      (mapping.status === "proposed" && ["approved", "rejected"].includes(input.decision)) ||
      (mapping.status === "approved" && input.decision === "revoked");
    if (!valid) throw new LearningGenomeError("Invalid mapping status transition", 409);
    const at = new Date().toISOString();
    await client.query(
      `UPDATE concept_mapping_proposals
          SET status=$2,reviewed_by_user_id=$3,reviewed_at=$4 WHERE id=$1`,
      [input.mappingId, input.decision, input.actorUserId, at]
    );
    await client.query(
      `INSERT INTO concept_mapping_events (mapping_id,event_type,actor_user_id,reason,occurred_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.mappingId, input.decision, input.actorUserId, reason, at]
    );
    return { id: input.mappingId, status: input.decision, reviewedAt: at };
  });
}

export async function setLearningFeatureFlags(input: {
  actorUserId: number;
  courseId: number;
  adaptiveReviewEnabled?: boolean;
  adaptiveSequencingEnabled?: boolean;
  placementEnabled?: boolean;
  explanationExperimentsEnabled?: boolean;
}) {
  if (!Number.isInteger(input.courseId) || input.courseId <= 0) {
    throw new LearningGenomeError("Invalid course");
  }
  return tx(async (client) => {
    await requireAdmin(input.actorUserId, client);
    if (!(await client.query("SELECT 1 FROM courses WHERE id=$1", [input.courseId])).rowCount) {
      throw new LearningGenomeError("Course not found", 404);
    }
    const row = (await client.query<{
      adaptive_review_enabled: boolean;
      adaptive_sequencing_enabled: boolean;
      placement_enabled: boolean;
      explanation_experiments_enabled: boolean;
      policy_version: number;
    }>(
      `INSERT INTO learning_feature_flags
        (course_id,adaptive_review_enabled,adaptive_sequencing_enabled,
         placement_enabled,explanation_experiments_enabled,updated_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (course_id) DO UPDATE SET
         adaptive_review_enabled=EXCLUDED.adaptive_review_enabled,
         adaptive_sequencing_enabled=EXCLUDED.adaptive_sequencing_enabled,
         placement_enabled=EXCLUDED.placement_enabled,
         explanation_experiments_enabled=EXCLUDED.explanation_experiments_enabled,
         policy_version=learning_feature_flags.policy_version+1,
         updated_by_user_id=EXCLUDED.updated_by_user_id,
         updated_at=${"to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')"}
       RETURNING adaptive_review_enabled,adaptive_sequencing_enabled,
                 placement_enabled,explanation_experiments_enabled,policy_version`,
      [
        input.courseId,
        Boolean(input.adaptiveReviewEnabled),
        Boolean(input.adaptiveSequencingEnabled),
        Boolean(input.placementEnabled),
        Boolean(input.explanationExperimentsEnabled),
        input.actorUserId,
      ]
    )).rows[0];
    return row;
  });
}

export async function getCourseLearningFlags(courseId: number) {
  return (await one<{
    adaptive_review_enabled: boolean;
    adaptive_sequencing_enabled: boolean;
    placement_enabled: boolean;
    explanation_experiments_enabled: boolean;
    policy_version: number;
  }>(
    `SELECT adaptive_review_enabled,adaptive_sequencing_enabled,placement_enabled,
            explanation_experiments_enabled,policy_version
       FROM learning_feature_flags WHERE course_id=$1`,
    [courseId]
  )) ?? {
    adaptive_review_enabled: false,
    adaptive_sequencing_enabled: false,
    placement_enabled: false,
    explanation_experiments_enabled: false,
    policy_version: 0,
  };
}

export async function getPlacementRecommendation(userId: number, courseId: number) {
  const flags = await getCourseLearningFlags(courseId);
  const lessons = await many<{
    id: number;
    title: string;
    module_position: number;
    lesson_position: number;
  }>(
    `SELECT lesson.id,lesson.title,module.position AS module_position,
            lesson.position AS lesson_position
       FROM lessons lesson JOIN modules module ON module.id=lesson.module_id
      WHERE module.course_id=$1
      ORDER BY module.position,lesson.position,lesson.id`,
    [courseId]
  );
  if (!lessons.length) throw new LearningGenomeError("Course has no lessons", 409);
  const concepts = await many<{
    lesson_id: number;
    mastery: number | null;
  }>(
    `SELECT DISTINCT question.lesson_id,mastery.mastery
       FROM question_versions question
       LEFT JOIN concept_mastery mastery
         ON mastery.user_id=$1 AND mastery.course_id=$2
        AND mastery.concept=question.concept_label
      WHERE question.course_id=$2 AND question.lesson_id IS NOT NULL`,
    [userId, courseId]
  );
  const byLesson = new Map<number, Array<number | null>>();
  for (const row of concepts) {
    const current = byLesson.get(row.lesson_id) ?? [];
    current.push(row.mastery);
    byLesson.set(row.lesson_id, current);
  }
  const recommended = flags.placement_enabled
    ? lessons.find((lesson) => {
        const values = byLesson.get(lesson.id) ?? [];
        return values.length === 0 || values.some((value) => value === null || value < 0.75);
      }) ?? lessons[lessons.length - 1]
    : lessons[0];
  const answeredConcepts = concepts.filter((row) => row.mastery !== null).length;
  const confidence = flags.placement_enabled
    ? Math.min(0.49, Number((answeredConcepts / Math.max(5, concepts.length || 5)).toFixed(4)))
    : 0;
  const analysis = await one<{ id: string; version: number }>(
    "SELECT id,version FROM learning_analysis_versions WHERE status='published' ORDER BY version DESC LIMIT 1"
  );
  const latestPreference = await one<{
    selected_lesson_id: number | null;
    decision: string;
    created_at: string;
  }>(
    `SELECT selected_lesson_id,decision,created_at FROM course_placement_preferences
      WHERE user_id=$1 AND course_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,
    [userId, courseId]
  );
  const limitations = flags.placement_enabled
    ? [
        "Placement uses only this learner's course-scoped mastery projection.",
        "The learner may override the recommendation or start at the beginning.",
        "Low evidence keeps placement confidence below 0.5.",
      ]
    : ["Placement is disabled for this course; the recommendation starts at the beginning."];
  return {
    enabled: flags.placement_enabled,
    policyVersion: flags.policy_version,
    analysisVersion: analysis ?? null,
    recommendedLesson: recommended,
    confidence,
    limitations,
    latestPreference: latestPreference ?? null,
    lessons,
  };
}

export async function savePlacementPreference(input: {
  userId: number;
  courseId: number;
  selectedLessonId?: number;
  decision: "accepted" | "overridden" | "start_beginning";
}) {
  const recommendation = await getPlacementRecommendation(input.userId, input.courseId);
  const selectedLessonId = input.decision === "start_beginning"
    ? recommendation.lessons[0].id
    : input.selectedLessonId ?? recommendation.recommendedLesson.id;
  if (!recommendation.lessons.some((lesson) => lesson.id === selectedLessonId)) {
    throw new LearningGenomeError("Selected lesson is not in this course");
  }
  const id = crypto.randomUUID();
  await q(
    `INSERT INTO course_placement_preferences
      (id,user_id,course_id,analysis_version_id,recommended_lesson_id,
       selected_lesson_id,decision,confidence,limitations_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      input.userId,
      input.courseId,
      recommendation.analysisVersion?.id ?? null,
      recommendation.recommendedLesson.id,
      selectedLessonId,
      input.decision,
      recommendation.confidence,
      JSON.stringify(recommendation.limitations),
    ]
  );
  return { id, selectedLessonId, decision: input.decision };
}

export async function learningGenomeDashboard() {
  const eligibility = await eligibilityCounts();
  const analysis = await one<{
    id: string;
    version: number;
    status: string;
    algorithm_version: string;
    minimum_learner_sample: number;
    source_event_count: number;
    public_event_count: number;
    consented_event_count: number;
    eligible_event_count: number;
    source_cutoff: string;
    limitations_json: string;
    created_at: string;
    published_at: string | null;
  }>("SELECT * FROM learning_analysis_versions ORDER BY version DESC LIMIT 1");
  const quality = analysis
    ? await many<{
        question_version_id: string;
        concept_label: string;
        attempts: number;
        unique_learners: number;
        correct_rate: number | null;
        skip_rate: number;
        avg_response_time_ms: number | null;
        discrimination: number | null;
        confidence: number;
        flags_json: string;
        limitations_json: string;
        review_decision: string | null;
        review_reason: string | null;
      }>(
        `SELECT quality.question_version_id,question.concept_label,
                quality.attempts,quality.unique_learners,quality.correct_rate,
                quality.skip_rate,quality.avg_response_time_ms,quality.discrimination,
                quality.confidence,quality.flags_json,quality.limitations_json,
                review.decision AS review_decision,review.reason AS review_reason
           FROM question_quality_snapshots quality
           JOIN question_versions question ON question.id=quality.question_version_id
           LEFT JOIN LATERAL (
             SELECT decision,reason FROM question_review_decisions
              WHERE question_version_id=quality.question_version_id
              ORDER BY created_at DESC,id DESC LIMIT 1
           ) review ON TRUE
          WHERE quality.analysis_version_id=$1
          ORDER BY quality.confidence DESC,quality.attempts DESC
          LIMIT 100`,
        [analysis.id]
      )
    : [];
  const mappings = await many(
    `SELECT mapping.id,mapping.analysis_version_id,mapping.source_concept_id,
            source.label AS source_label,mapping.target_concept_id,target.label AS target_label,
            mapping.proposed_confidence,mapping.effective_confidence,mapping.rationale,
            mapping.status,mapping.created_at,mapping.reviewed_at
       FROM concept_mapping_proposals mapping
       JOIN concepts source ON source.id=mapping.source_concept_id
       JOIN concepts target ON target.id=mapping.target_concept_id
      ORDER BY mapping.created_at DESC LIMIT 100`
  );
  const prerequisites = analysis
    ? await many(
        `SELECT candidate.*,source.label AS prerequisite_label,target.label AS target_label
           FROM prerequisite_candidates candidate
           JOIN concepts source ON source.id=candidate.prerequisite_concept_id
           JOIN concepts target ON target.id=candidate.target_concept_id
          WHERE candidate.analysis_version_id=$1
          ORDER BY candidate.confidence DESC LIMIT 100`,
        [analysis.id]
      )
    : [];
  return {
    eligibility,
    analysis: analysis
      ? { ...analysis, limitations: JSON.parse(analysis.limitations_json) as string[] }
      : null,
    quality: quality.map((row) => ({
      ...row,
      flags: JSON.parse(row.flags_json) as string[],
      limitations: JSON.parse(row.limitations_json) as string[],
    })),
    mappings,
    prerequisites,
  };
}
