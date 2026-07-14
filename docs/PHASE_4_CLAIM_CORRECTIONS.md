# Phase 4 private claim correction and dispute contract

**Decision date:** 14 July 2026

## Safe correction boundary

A competency claim is not editable prose. It is a server-derived statement bound
to an exact credential, course version, assignment version, completion rule,
completion decision, participation and evidence hash. A learner may privately
dispute the current claim version, but neither the learner nor a resolver may
type a replacement competency assertion.

An accepted correction requires a different active, unexpired credential owned
by the same learner, for the same course and issued through the same Space. The
server re-runs the complete eligibility reconciliation and derives the next claim
version from that replacement evidence. The previous version is retained and the
new version points directly to it through `supersedes_claim_version_id`.

## Authorization and lifecycle

- Only the learner who owns a current claim version can submit a dispute.
- The learner chooses a structured category and supplies a private explanation.
- Only an active Space owner, administrator or manager with
  `assignments.manage` can see or resolve disputes for that exact issuing Space.
- Auditors, creators, reviewers, unrelated learners and platform administrators
  have no implicit dispute access.
- An open dispute may be withdrawn by its learner, rejected by an authorized
  resolver, or accepted with eligible replacement evidence. Terminal disputes
  cannot be reopened or rewritten; a new dispute must be created.
- Only one open dispute may exist for one claim version.

The structured dispute and lifecycle events are retained as audit evidence.
Learner free text is stored separately, is never publicly disclosed, cannot be
updated, is included in the learner's private export and is deleted on effective
account erasure.

## Selective disclosure after correction

Only the latest claim version is shareable. Once a correction is accepted, any
existing link that selected a superseded version returns the same not-found
response as every other unavailable link. A learner must deliberately create a
new link for the corrected version. Verification never silently substitutes one
version for another.

## Explicit non-goals

This slice does not add free-form competency editing, public disputes, recipient
notifications, compensation decisions, ranking, employability inference,
automated adjudication, QTI, Open Badges, LTI, OAuth or public profiles. Phase 4
remains early implementation while every Phase 3 closure gate stays open.
