# Phase 4 Skill Passport domain model

**Slice:** immutable eligible evidence to selective verification
**Status:** early implementation; not production-ready while Phase 3 is open

## Aggregate and ownership

- `skill_passports` — one private aggregate per learner account. It has no public
  slug or visibility switch.
- `competency_claims` — a stable learner-owned claim identity. The initial claim
  type is only `verified_course_completion`.
- `competency_claim_versions` — immutable statements derived from one eligible
  credential and its exact evidence chain. The server derives the title and
  statement from the pinned course version; arbitrary competency text is not
  accepted from the learner or an AI system.
- `skill_passport_entries` — the learner's private inclusion of an immutable claim
  version in the passport.
- `passport_share_grants` — a time-bounded selective disclosure. It contains a
  frozen list of claim-version IDs and disclosure choices, plus only a hash of the
  random bearer token.
- `passport_share_consent_events` — append-only `granted` and `withdrawn`
  decisions for the exact share.
- `passport_share_status_events` — append-only `issued`, `revoked` and
  `consent_withdrawn` lifecycle evidence.
- `passport_verification_events` — private, short-lived proof that a valid
  selective link was opened. It stores only the share ID, disclosed claim count,
  learner-controlled name-disclosure flag, verification time and 90-day
  retention deadline. It never identifies or fingerprints the recipient.
- `competency_claim_disputes` — a structured learner-owned correction request
  bound to one exact claim version and its issuing Space. Its guarded lifecycle
  is open, withdrawn, rejected or accepted.
- `competency_claim_dispute_details` — the learner's private explanation,
  separated so effective account erasure can delete free text without rewriting
  the structured audit record.
- `competency_claim_dispute_events` — append-only submission and resolution
  history with the authorized actor and any resulting claim-version ID.

## Eligibility invariant

A credential can create one current claim version only when all conditions hold:

1. `credential.user_id` equals the authenticated learner.
2. Credential status is active and its expiry is in the future or absent.
3. Its completion event exists with decision `completed`.
4. Credential and completion rows agree on participation, assignment version,
   rule version and evidence hash.
5. The assignment version points to the same course version as the credential,
   and the assignment points to the same course.
6. The completion rule points to that course and the assignment's Space.

The claim pins `course_id`, `course_version`, `assignment_version_id`,
`completion_rule_version_id`, `completion_event_id`, `participation_id`,
`credential_id` and `evidence_hash` directly.

An accepted correction never updates that row. It requires a different eligible
credential owned by the same learner for the same course and issuing Space. The
server derives the next statement, pins the replacement evidence chain and links
the new immutable row to its predecessor with `supersedes_claim_version_id`.
Only the latest version is shareable; links frozen to an older version stop
verifying without being silently redirected.

## Disclosure contract

Passports and claims are private by default. Creating a claim does not create a
share. A learner explicitly selects one or more claim versions, chooses an expiry
no more than 30 days in the future, and separately chooses whether their display
name is disclosed. The default is not to disclose it.

The bearer token is returned once. Verification either returns the complete frozen
selection or returns not found; it never falls back to a partial profile. Every
selected claim is revalidated against live credential status and completion state.

Revocation and consent withdrawal are separate learner actions with the same
external effect: future verification is blocked. Shares cannot be renewed or
reactivated; a learner creates a new grant and makes a new consent decision.

Successful verification and event insertion run in one transaction under shared
share, claim and credential locks. Revocation, consent withdrawal and accepted
claim correction use the corresponding exclusive lifecycle lock, so future
access is blocked once the lifecycle change commits.
Unknown or unavailable tokens never create an event. Retained events are visible
only to their learner, included in that learner's private account export, purged
after 90 days and deleted early by effective account erasure.

## Explicit non-goals

This slice does not implement ranking, mastery/confidence scores, employability
scores, hiring recommendations, public learner profiles, searchable handles,
unsupported competency inference, QTI, Open Badges, LTI,
OAuth, webhooks or portable standards export.
