# Phase 2 Course Studio architecture

**Status:** implementation contract
**Last updated:** 13 July 2026

Phase 2 separates source truth, authoring state and published learning state. The
legacy `courses -> modules -> lessons.cards` projection remains readable during
the expand/migrate/switch period, but it is no longer the long-term authority.

## Stable identities and versions

- A source asset is a Space-owned identity. Every extraction or replacement adds
  an immutable source version with content hash, extractor provenance and
  retention/access policy; it never overwrites the prior extraction.
- A versioned source collection orders one or more source versions for a course.
- A course is a stable identity. A course version is a draft/review/approved/
  published/superseded/archived snapshot that references one collection version
  and, optionally, one recipe version.
- Publishing freezes the entire course version. Editing published work branches a
  new draft; learner evidence continues to name the version experienced.
- A block has a lineage identity across course branches. Revisions are append-only
  and record generated/manual/imported origin, source references, accessibility
  metadata, model/prompt provenance and author.
- A recipe is versioned independently from generated content. Forking keeps the
  source recipe/version lineage but never learner data.

## Compatibility and cutover

Migration 4 backfills each legacy course into a source asset/version, collection
version, course version and block revisions. Existing numeric course/module/
lesson IDs remain valid. New services dual-write a version snapshot while learner
routes continue using the proven legacy projection. Publishing materializes the
approved version into that projection transactionally; only then can versioned
content become the learner authority.

The cutover gate requires:

1. every course has a source/blank-origin record and version snapshot;
2. every legacy card maps to exactly one block lineage/revision;
3. published version triggers reject update/delete and new block revisions;
4. scoped regeneration uses a base revision and cannot overwrite intervening
   manual edits;
5. source coverage and accessibility checks run before review/publish; and
6. evidence continues resolving immutable question and course versions.

## Block registry

Built-in definitions cover explanation, image, audio/video, story, worked
example, flashcard, multiple choice, true/false, fill-in, scenario, practical
task, discussion, survey, attestation and recap. Each definition declares offline
and chat compatibility, fallback behavior and required accessibility metadata.
Executable third-party blocks remain deferred to Phase 5.

## Review and regeneration

Comments and review decisions are append-only facts. Requested changes create a
new draft revision; approval does not mutate published content. Regeneration is a
versioned job scoped to outline/module/lesson/block. It writes only when the
target base revision still matches, preserving every manual edit outside that
scope and failing stale work closed.

## Privacy and authorization

Every source, collection, course, recipe and draft has one owning Space. All
Studio actions use Phase 1 capabilities and resource-owner checks. Published
visibility does not expose private sources, prompts, comments or drafts. Copies
receive new identities and explicit lineage; moves follow
`SPACE_CONTENT_OWNERSHIP.md`.
