# Space content ownership and lifecycle rules

**Status:** Phase 1 contract
**Last updated:** 13 July 2026

Every course has exactly one `owning_space_id`. Modules, lessons and immutable
question versions inherit that owner; assignments and evidence carry their own
server-derived Space context. Attaching a course to another Space grants use for
an assignment but never transfers ownership.

## Move and copy

- Personal-to-organization transfer must be an explicit owner-authorized move,
  accepted by an administrator of the destination Space and immutably audited.
- A move creates a new content version before the owning key changes. Existing
  evidence and credentials keep the experienced version and original context.
- Copy creates a new course identity, version lineage and destination owner. It
  never copies learner evidence, memberships, assignments or private comments.
- Public content must be copied into a Space before it can be edited or assigned
  by someone other than its owner. A public URL is not an ownership grant.
- Cross-Space attachments must be explicit and revocable. The current Phase 1
  slice permits attaching only an actor-owned course; broader share grants remain
  closed until their revocation and version semantics are implemented.
- Sources and future recipes/templates follow the same rule when their Phase 2
  records are introduced: one owner, explicit shares, no implicit transfer.

## Archive, deletion and export

- Archive makes a Space read-only while preserving memberships, assignments,
  evidence and audit history. The owner can restore it.
- Deletion is scheduled, never immediate. Scheduling records a timestamp and
  makes the Space read-only; restoring clears the schedule.
- Physical purge is a retention job, not a request-path cascade. It must preserve
  legally retained pseudonymous evidence and append-only audit facts while
  removing tenant profile/content that no longer has a retention basis.
- Owner export is rate-limited and contains Space profile/policy, memberships,
  course links, assignments and audit records. It does not expose password data,
  authentication tokens or unrelated Spaces.

The transition APIs intentionally do not implement silent move/copy or immediate
purge. Those actions remain denied until a versioned workflow satisfies these
rules.

## Current resource map

| Resource | Space ownership/policy source |
|---|---|
| Course | Required `courses.owning_space_id` |
| Stored source chapters | Inherit their course owner; standalone sources begin in Phase 2 |
| Module, lesson, question version | Inherit the course and experienced content version |
| Answer/practice session | Server-stamped Space context; live membership is rechecked on reuse |
| Assignment | Required `space_assignments.space_id` and policy version |
| Answer/completion evidence | Server-derived Space, membership, assignment and policy version |
| Mastery, progress, review | Learner-scoped projections of Space-attributed immutable evidence |
| Class | Deterministic class-preset Space mapping during compatibility period |
| Teams and membership | Direct Space foreign keys |
| Reports | Computed inside an authorized Space dashboard from attributed evidence |
| Recipe/template | Phase 2 records must add a required owner before their routes ship |
| Certificate | Public verification projection over immutable course/learner evidence |

Protected course reads call live participation resolution. Course mutation,
publish and generation-retry routes authorize the course's owning Space; a global
platform administrator receives no implicit tenant capability. Account privacy,
billing and authentication routes remain account-scoped rather than pretending
to be tenant resources.
