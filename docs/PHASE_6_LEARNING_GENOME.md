# Phase 6 bounded Learning Genome

**Engineering status:** Tested local governance core  
**External validation status:** Not available yet  
**Algorithm profile:** `learning-genome-v1`

## Contract

An analysis includes only events where both the event and immutable question
version are `public_course` and the learner's latest `product_research` consent
decision is `granted`. Counts for source, public, consented and fully eligible
evidence remain separate on every version.

The engine calculates descriptive difficulty, response time, skip rate and
item-versus-other-item discrimination. It can flag insufficient samples, likely
ambiguity, poor discrimination, very easy/difficult items and possible answer-key
errors. Flags are review prompts, not automatic content decisions.

Thirty unique learners are required before high-confidence use. Smaller samples
are mathematically capped below 0.5. Every result records its algorithm version,
cutoff, sample counts and limitations in an immutable materialized snapshot.

## Human authority

- Admins build and publish analytical versions in `/admin/learning-genome`.
- Question keep/revise/retire decisions are append-only.
- Concept mappings carry proposed and sample-capped confidence, require human
  approval and can later be revoked without deleting their history.
- Prerequisite candidates carry an algorithm version, temporal-precedence rule,
  learner sample and explicit non-causal limitation.
- Placement starts disabled, stays below 0.5 confidence in this profile, explains
  its limits and preserves a learner's accepted, overridden or start-at-beginning
  decision.
- Adaptive review, sequencing, placement and explanation experiments are
  course-level feature flags and default off.

## Claims not made

This profile does not establish learning causation, adaptive-path superiority,
fairness across cohorts or IRT validity. Those require real, sufficiently
represented cohorts and appropriate experimental designs. The explanation
experiment schema stores `causal_claim_allowed = false` as a database invariant.
