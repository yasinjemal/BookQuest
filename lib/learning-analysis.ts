export const LEARNING_GENOME_ALGORITHM_VERSION = "learning-genome-v1";
export const DEFAULT_MINIMUM_LEARNER_SAMPLE = 30;

export interface EligibleEvidenceDatum {
  questionVersionId: string;
  learnerKey: string;
  courseId: number | null;
  conceptId: string;
  correct: boolean;
  skipped: boolean;
  responseTimeMs: number;
  occurredAt: string;
}

export interface QuestionQualityResult {
  questionVersionId: string;
  courseId: number | null;
  conceptId: string;
  attempts: number;
  uniqueLearners: number;
  correctRate: number | null;
  skipRate: number;
  avgResponseTimeMs: number | null;
  difficulty: number | null;
  discrimination: number | null;
  confidence: number;
  flags: string[];
  limitations: string[];
}

export interface PrerequisiteCandidateResult {
  prerequisiteConceptId: string;
  targetConceptId: string;
  learnerSample: number;
  precedenceRate: number;
  confidence: number;
  provenance: {
    algorithmVersion: string;
    rule: string;
    limitations: string[];
  };
}

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 5) return null;
  const meanX = average(xs);
  const meanY = average(ys);
  if (meanX === null || meanY === null) return null;
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < xs.length; index++) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }
  const denominator = Math.sqrt(sumX * sumY);
  return denominator > 0 ? numerator / denominator : null;
}

export function confidenceForSample(uniqueLearners: number, minimumSample: number): number {
  if (uniqueLearners < minimumSample) {
    return Math.min(0.49, Number((0.49 * (uniqueLearners / minimumSample)).toFixed(4)));
  }
  return Math.min(
    0.95,
    Number((0.65 + Math.log10(Math.max(1, uniqueLearners / minimumSample)) * 0.15).toFixed(4))
  );
}

/**
 * Calculate descriptive item statistics only. Flags are review prompts, never
 * automatic content decisions or causal claims.
 */
export function analyzeQuestionEvidence(
  evidence: EligibleEvidenceDatum[],
  minimumSample = DEFAULT_MINIMUM_LEARNER_SAMPLE
): QuestionQualityResult[] {
  const learnerAnswered = new Map<string, EligibleEvidenceDatum[]>();
  for (const row of evidence) {
    if (row.skipped) continue;
    const current = learnerAnswered.get(row.learnerKey) ?? [];
    current.push(row);
    learnerAnswered.set(row.learnerKey, current);
  }

  const grouped = new Map<string, EligibleEvidenceDatum[]>();
  for (const row of evidence) {
    const current = grouped.get(row.questionVersionId) ?? [];
    current.push(row);
    grouped.set(row.questionVersionId, current);
  }

  return [...grouped.entries()].map(([questionVersionId, rows]) => {
    const answered = rows.filter((row) => !row.skipped);
    const uniqueLearners = new Set(rows.map((row) => row.learnerKey)).size;
    const correctRate = average(answered.map((row) => (row.correct ? 1 : 0)));
    const skipRate = rows.length
      ? rows.filter((row) => row.skipped).length / rows.length
      : 0;
    const avgResponseTimeMs = average(answered.map((row) => row.responseTimeMs));

    const perLearnerItem = new Map<string, number[]>();
    for (const row of answered) {
      const current = perLearnerItem.get(row.learnerKey) ?? [];
      current.push(row.correct ? 1 : 0);
      perLearnerItem.set(row.learnerKey, current);
    }
    const itemScores: number[] = [];
    const otherScores: number[] = [];
    for (const [learnerKey, scores] of perLearnerItem) {
      const other = (learnerAnswered.get(learnerKey) ?? []).filter(
        (row) => row.questionVersionId !== questionVersionId
      );
      const otherScore = average(other.map((row) => (row.correct ? 1 : 0)));
      const itemScore = average(scores);
      if (otherScore !== null && itemScore !== null) {
        itemScores.push(itemScore);
        otherScores.push(otherScore);
      }
    }
    const discrimination = correlation(itemScores, otherScores);
    const confidence = confidenceForSample(uniqueLearners, minimumSample);
    const flags: string[] = [];
    const limitations: string[] = [
      "Descriptive observational statistics do not establish learning causation.",
    ];
    if (uniqueLearners < minimumSample) {
      flags.push("insufficient_sample");
      limitations.push(
        `Only ${uniqueLearners} unique learners; ${minimumSample} are required before high-confidence use.`
      );
    }
    if (correctRate !== null && uniqueLearners >= minimumSample) {
      if (correctRate >= 0.95) flags.push("very_easy");
      if (correctRate <= 0.2) flags.push("very_difficult");
      if (correctRate <= 0.1 && (discrimination ?? 0) <= 0) {
        flags.push("possible_answer_key_error");
      }
    }
    if (uniqueLearners >= minimumSample && discrimination !== null && discrimination < 0.1) {
      flags.push("poor_discrimination");
    }
    if (uniqueLearners >= minimumSample && skipRate >= 0.25) flags.push("possible_ambiguity");

    return {
      questionVersionId,
      courseId: rows[0]?.courseId ?? null,
      conceptId: rows[0]?.conceptId ?? "",
      attempts: rows.length,
      uniqueLearners,
      correctRate,
      skipRate,
      avgResponseTimeMs,
      difficulty: correctRate === null ? null : 1 - correctRate,
      discrimination,
      confidence,
      flags,
      limitations,
    };
  }).sort((a, b) => b.attempts - a.attempts || a.questionVersionId.localeCompare(b.questionVersionId));
}

/** Infer only reviewable precedence candidates from first successful evidence. */
export function inferPrerequisiteCandidates(
  evidence: EligibleEvidenceDatum[],
  minimumSample = DEFAULT_MINIMUM_LEARNER_SAMPLE
): PrerequisiteCandidateResult[] {
  const firstSuccess = new Map<string, Map<string, number>>();
  for (const row of evidence) {
    if (row.skipped || !row.correct) continue;
    const time = Date.parse(row.occurredAt);
    if (!Number.isFinite(time)) continue;
    const learner = firstSuccess.get(row.learnerKey) ?? new Map<string, number>();
    const current = learner.get(row.conceptId);
    if (current === undefined || time < current) learner.set(row.conceptId, time);
    firstSuccess.set(row.learnerKey, learner);
  }
  const conceptIds = [...new Set(evidence.map((row) => row.conceptId))].sort();
  const results: PrerequisiteCandidateResult[] = [];
  for (const prerequisiteConceptId of conceptIds) {
    for (const targetConceptId of conceptIds) {
      if (prerequisiteConceptId === targetConceptId) continue;
      let learnerSample = 0;
      let before = 0;
      for (const concepts of firstSuccess.values()) {
        const prerequisiteTime = concepts.get(prerequisiteConceptId);
        const targetTime = concepts.get(targetConceptId);
        if (prerequisiteTime === undefined || targetTime === undefined) continue;
        learnerSample++;
        if (prerequisiteTime < targetTime) before++;
      }
      if (learnerSample < minimumSample) continue;
      const precedenceRate = before / learnerSample;
      if (precedenceRate < 0.7) continue;
      results.push({
        prerequisiteConceptId,
        targetConceptId,
        learnerSample,
        precedenceRate,
        confidence: Math.min(
          confidenceForSample(learnerSample, minimumSample),
          Number((precedenceRate * 0.9).toFixed(4))
        ),
        provenance: {
          algorithmVersion: LEARNING_GENOME_ALGORITHM_VERSION,
          rule: "first successful evidence for the prerequisite preceded the target",
          limitations: [
            "Temporal precedence is not proof of a prerequisite or causal dependency.",
            "A human reviewer must approve this candidate before product use.",
          ],
        },
      });
    }
  }
  return results.sort(
    (a, b) => b.confidence - a.confidence ||
      a.prerequisiteConceptId.localeCompare(b.prerequisiteConceptId) ||
      a.targetConceptId.localeCompare(b.targetConceptId)
  );
}
