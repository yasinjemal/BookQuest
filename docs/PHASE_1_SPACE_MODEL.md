# Phase 1 Space, Membership and Authorization Model

**Status:** local implementation complete; CI/deployment proof pending
**Last updated:** 13 July 2026

## Domain model

`Space` is the sole tenancy and collaboration boundary. Each person receives one
automatic personal Space; classes, private groups, organizations and public
communities are configurations of the same primitive.

A Space has an opaque UUID, type (`personal`, `private`, `unlisted`,
`organization`, `public`), lifecycle (`active`, `suspended`, `archived`,
`deletion_scheduled`), profile/branding/language/timezone, optional parent, and
separate discovery, entry, member-directory and content-sharing policies.

Visibility is not authorization. Public permits anonymous access only to an
explicitly published resource. Unlisted suppresses search but still requires an
approved membership or invitation. A URL or code never grants private access.

A membership is unique per account/Space and records status (`invited`, `active`,
`suspended`, `removed`, `expired`), role (`owner`, `administrator`, `creator`,
`reviewer`, `manager`, `learner`, `auditor`), invitation provenance, lifecycle
timestamps, optional expiry and the policy version authorizing each change.

Sources, courses, recipes, assignments and reports have one `owning_space_id`.
Sharing never changes ownership implicitly. Cross-Space assignment requires an
explicit revocable share grant and preserves the experienced course version.
Evidence records server-derived Space, membership/enrollment/assignment and policy
versions; the client supplies only opaque attempt/session IDs.

## Authorization contract

The executable matrix in `lib/space-authorization.ts` denies by default:

- creators author but cannot read member evidence;
- reviewers approve but cannot publish or manage membership;
- managers assign/report but cannot author or publish;
- auditors are read-only;
- learners see assigned/published content and their own evidence; and
- platform `admin` is not a Space role. Support access requires a future explicit,
  expiring and audited break-glass grant.

Every protected route/job supplies authenticated user, capability, Space, active
membership and resource ownership to this contract. Denials use stable reason
codes without confirming that an unrelated private resource exists.

## Classroom and global-role migration

| Legacy record | Phase 1 result |
|---|---|
| User | Personal Space plus active owner membership |
| `users.role=user` | No global tenant capability |
| `users.role=admin` | Platform operator flag; no implicit Space access |
| Classroom | Private Space with `class` preset and legacy-ID mapping |
| Classroom owner/member | Owner/learner membership preserving timestamps |
| Classroom code | Retained only on a `class` preset with explicit `join_code_enabled`; all other Spaces use invitations |
| Owned course | Owned by creator's personal Space |
| Classroom assignment | Versioned assignment referencing course/share grant |
| Enrollment | Space-aware enrollment preserving progress and time |
| Evidence | Server-provable assignment Space, otherwise personal Space |

Migration is expand/backfill/verify/switch/contract: add nullable keys and mapping
tables; create personal/class Spaces idempotently; backfill in batches; dual-read
and compare legacy vs Space authorization; switch writes after zero unexplained
mismatch; remove legacy authority only after rollback and backup proof.

## Negative test matrix before APIs

| Attempt | Required result |
|---|---|
| Guess private Space/resource UUID | 404-style denial, no metadata |
| Use Space A membership in Space B | `wrong_space` |
| Reuse revoked/expired invitation | denial plus audit event |
| Suspended member uses cache or old job | immediate denial |
| Creator reads learner evidence | `capability_missing` |
| Manager publishes/edits course | `capability_missing` |
| Learner lists peer progress | own evidence only |
| Platform admin lacks tenant grant | denial |
| Unlisted URL lacks membership/invitation | denial |
| Anonymous user requests public draft/archive | denial |
| Resource owning Space differs | `wrong_space` |
| Role changes during long job | reauthorize before committed effect |
| Evidence payload forges Space/assignment | ignore and derive from session |

`tests/space-authorization.test.ts` proves the pure contract.
`tests/spaces-tenancy.test.ts` proves the migration-backed private-Space journey,
cross-tenant denial, invitation replay/revocation, immediate role enforcement,
late assignment membership, server-derived answer/completion context and audit
immutability. The `/api/spaces` route family uses these services; `/spaces` is
the first member-facing management experience.

## First vertical slice

Create private Space -> invite member -> accept -> share existing course -> create
assignment -> authorize learning -> record Space/assignment in evidence -> revoke
member -> prove cached URLs, sessions and queued jobs stop.

This slice is implemented. Migration 3 creates and backfills the Space domain,
new accounts receive personal Spaces transactionally, and cached/queued answer
delivery is rejected after live membership removal. The remaining closure work is
operational: push the local commit, pass CI, apply the migration in deployment,
and smoke-test personal Space, private invite, assignment, revocation and legacy
Class compatibility in production. Custom role bundles are explicitly deferred
to the Phase 3 institutional pilot.
