# Privacy, Retention and Controlled Deletion

**Status:** implemented Phase 0 baseline  
**Last updated:** 12 July 2026

This policy defines how BookQuest records consent, exports user-owned data,
retains operational and evidentiary records, and handles deletion without
silently rewriting learning history.

## User controls

- Registration records explicit acceptance of `service-v1`. Optional analytics
  and product-research consent start ungranted and can be granted or withdrawn
  independently from the profile page.
- Consent history is append-only. A new decision supersedes an older one; the
  earlier record is never edited.
- An authenticated user can download a snapshot-consistent JSON export containing
  profile data, consent and privacy history, owned sources and courses, learning
  activity, pseudonymous evidence, collaboration records, credentials and billing
  history. Password hashes, sessions and account tokens are never exported.
- Account deletion requires the current password and has a 30-day cancellation
  period. The sole remaining administrator cannot schedule deletion until another
  administrator exists.

## Retention classes

| Data | Default retention | End-of-life action |
|---|---|---|
| Sessions | Until expiry | Physical deletion |
| Verification/reset tokens | Expiry plus one day | Physical deletion |
| Rate-limit buckets | Until window expiry | Physical deletion |
| Operational events | 90 days by default, configurable 7-3650 days | Physical deletion |
| Private sources and generated courses | Account lifetime or explicit owner deletion | Physical deletion; immutable question/evidence history remains detached |
| Published course versions | While published and while evidence depends on them | Withdraw, remove source text and archive on owner erasure |
| Progress, review queues and current mastery projections | Account lifetime | Physical deletion on erasure; rebuildable projections are not historical truth |
| Learning events and question versions | Seven years after last related activity by default | Keep pseudonymous; use controlled redaction only for a documented legal/privacy need |
| Consent and privacy-action history | Seven years after erasure | Retain against the anonymized account for proof of the request and decisions |
| Financial transactions | Seven years, subject to applicable merchant/tax law | Retain against the anonymized account; restrict access |

The seven-year periods are conservative defaults, not claims about every
jurisdiction. An institutional Space may require a shorter or longer approved
schedule in Phase 1/3. Legal hold suspends scheduled destruction for only the
named records and must have an owner, reason and review date.

## Account erasure result

When the grace period ends, `npm run privacy:maintain`:

1. withdraws published courses, removes their source material and archives the
   evidentiary course version under the platform tombstone owner;
2. physically deletes private owned courses and classrooms;
3. deletes memberships, enrollments, projections, progress, reviews, credentials,
   sessions and tokens tied directly to the account;
4. replaces email, name and authentication material with irreversible tombstone
   values and removes privileges and entitlements;
5. preserves the random learner key and immutable events without the original
   name or email; and
6. appends an `erasure_completed` audit action naming the retained data classes.

The job is idempotent and locks due accounts so parallel workers cannot erase one
account twice.

## Archive, soft-delete and controlled-redaction rules

- **Archive** is reversible visibility/lifecycle state for shared or evidentiary
  content. Archived content is not published or offered for new enrollment.
- **Soft delete** means scheduling an account for destruction. It is used where a
  cancellation window is important; it is not presented as completed erasure.
- **Physical delete** is used for private source content, ephemeral security data
  and projections that are neither required evidence nor subject to a hold.
- **Controlled redaction** is exceptional. Immutable events are never updated or
  deleted through ordinary application code. A redaction must name the legal or
  privacy basis, affected evidence IDs, authorizer, timestamp and fields hidden;
  retain a non-identifying tombstone; rebuild affected projections; and produce a
  reconciliation report. Database-superuser trigger bypass is a documented
  incident/change procedure, never a product endpoint.
- A URL, course deletion or account tombstone never silently destroys evidence
  another learner, credential or audit report depends on.

## Volume decisions

The browser answer/completion outbox remains in `localStorage` while payloads are
small and account-scoped. Move it to IndexedDB when any trigger is observed:

- the 95th-percentile queue exceeds 100 records or 1 MiB;
- course/offline assets need transactional storage;
- storage failures exceed 0.1% of answer submissions; or
- multi-tab coordination causes duplicate delivery pressure.

Keep `learning_events` unpartitioned until one of these triggers is observed for
two consecutive weeks: 10 million rows, 50 GiB total relation size, routine vacuum
falling behind, or p95 learner/course time-range queries above 100 ms after index
tuning. Then introduce monthly range partitions through a forward migration,
retain event IDs and semantic uniqueness globally, rehearse attach/detach and
restore on a production-sized copy, and keep reconciliation partition-agnostic.

## Operational proof

- `tests/privacy-lifecycle.test.ts` covers append-only consent, secret-free export,
  cancellation, due-date enforcement, erasure and retained pseudonymous evidence.
- `tests/migration-upgrade.test.ts` proves existing users receive explicit legacy
  service-consent history and active lifecycle state.
- `scripts/privacy-maintenance.mjs` is the repeatable maintenance entry point.
- The Phase 0 recovery drill and provider PITR exercise remain governed by
  `DEPLOYMENT_AND_MIGRATION.md`.
