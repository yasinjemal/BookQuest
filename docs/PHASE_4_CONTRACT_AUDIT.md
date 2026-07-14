# Phase 4 contract audit

**Audit date:** 14 July 2026
**Scope:** the Phase 3 credential, evidence, verification, revocation, tenancy and
privacy contracts that the first Skill Passport slice must preserve.

## Existing authoritative chain

The current institutional completion service evaluates a published completion
rule against server-selected evidence and appends an `assignment_completion_events`
row. That record binds the participation, assignment version, completion-rule
version, learner key, decision, rule evaluation, evidence manifest and evidence
hash. Database triggers prevent update or deletion.

An issued `credential_records` row points to that completion event and repeats the
exact user, course, course version, assignment version, participation, rule version
and evidence hash. Credential lifecycle changes append `credential_status_events`;
manager authorization is derived through the credential's assignment to its Space
and requires the live `assignments.manage` capability.

Public Phase 3 credential verification uses a 32-byte random token, stores only its
digest and applies `no-store`. Unknown tokens are not found. Credential status is
checked at read time so configured expiry is effective even before the maintenance
worker persists `expired`.

## Contracts carried into Phase 4

1. A claim is eligible only when its credential belongs to the requesting learner,
   is active and unexpired, points to a `completed` completion event, and every
   repeated version/evidence field reconciles exactly.
2. A claim version stores direct foreign keys to the course, assignment version,
   completion-rule version, completion event, participation and credential. It
   also stores the course version and evidence hash. It never relies on a mutable
   “current version” pointer to reconstruct the basis later.
3. Claim versions and sharing consent/status events are append-only. Corrections
   will create a later version; the first slice does not silently rewrite claims.
4. The passport belongs to the learner account. Space owners, platform admins and
   credential managers receive no implicit passport access.
5. The passport has no public username, directory entry or discoverable profile.
   A disclosure exists only after the learner creates a bounded share grant.
6. A share token is high-entropy and opaque; only its digest is stored. Invalid,
   expired, revoked, consent-withdrawn or evidence-invalid tokens all produce the
   same not-found result.
7. Verification returns only the claim versions selected when the share was
   created. It never queries “all credentials for learner” and never returns user
   IDs, email addresses, membership IDs or unrelated credentials.
8. Verification rechecks the live credential and completion decision. Credential
   revocation, credential expiry, share revocation or consent withdrawal blocks
   every future access immediately.

## Privacy and lifecycle findings

The existing privacy service records append-only consent decisions and preserves
pseudonymous learning evidence during account erasure. The first Passport slice
uses purpose-specific share consent events rather than treating analytics or
research consent as authorization to disclose credentials. Account export and
erasure integration, correction/dispute workflow and portable standards export
remain later Phase 4 work and must be completed before production readiness.

## Gaps this slice intentionally closes

- No learner-controlled private aggregate of eligible credentials exists.
- Existing credential verification is credential-wide rather than a selective
  learner-created disclosure.
- Existing credential tokens do not model learner consent withdrawal.
- There is no versioned claim layer between immutable evidence and disclosure.

This audit authorizes only a verified-course-completion claim. It does not support
competency inference, ranking, confidence scoring, hiring recommendations, public
profiles or interoperability claims about QTI, Open Badges or LTI.
