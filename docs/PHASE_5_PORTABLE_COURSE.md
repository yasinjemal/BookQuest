# Phase 5 portable course archive

**Engineering status:** In progress  
**Archive format:** `bookquest.course` schema version `1`  
**External validation status:** Not available yet

## Purpose

The first Phase 5 slice lets a creator download one exact editable course
version and restore it into a Space they control. It is a bounded authoring
archive, not an account backup, evidence export or claim of complete sovereign
deployment.

The archive contains:

- the selected draft or published course version, appearance and lifecycle
  metadata;
- exact attached source versions, extracted content, usage policy and hashes;
- the exact teaching recipe definition when one is attached; and
- current lesson blocks, layout, accessibility data and package-local source
  citations.

It deliberately excludes users, memberships, invitations, answers, progress,
completion decisions, evidence, credentials, comments, authentication data,
API credentials, webhooks, raw-storage keys and generation-run identifiers.

## Export contract

`GET /api/studio/courses/{courseId}/portable`

- requires authentication and `content.update` permission in the owning Space;
- is rate limited and returned with `private, no-store` and `nosniff` headers;
- replaces installation-specific source identifiers with archive-local IDs;
- strips secret-like and user-identity metadata recursively; and
- seals the canonical archive body with SHA-256.

The creator UI places the download under Studio's quality tools and describes
the excluded learner and evidence records before download.

## Dry-run and import contract

`POST /api/studio/imports/course`

The request supplies `mode: "dry_run" | "import"`, the destination Space, the
archive and an optional title. The Create UI always performs a dry-run first.
Both paths require `content.create` permission in the destination Space.

Dry-run verifies the same archive and authorization contract as import, writes
nothing, and reports counts plus title, source-content and replay conflicts.
Import then runs in one transaction and creates:

- an unpublished course in `draft` authoring state;
- isolated owned copies of all archived source versions;
- a private draft recipe when the archive contains one;
- remapped block and source identities; and
- an import-ledger row keyed by destination Space and archive digest.

It never overwrites or silently merges existing content. An identical archive
cannot be imported twice into the same Space.

## Validation limits

Before a write, BookQuest enforces:

- exact format and schema version;
- whole-archive and per-source/per-recipe SHA-256 integrity;
- a 10 MB serialized archive limit;
- at most 50 sources, 5,000 blocks and 100 citations per block;
- unique source IDs, block IDs and block positions;
- supported source kinds and current block schemas;
- source citations that resolve only inside the archive, including nested refs,
  while installation-specific `sourceVersionId` values fail closed; and
- a title between 2 and 120 characters.

Unknown format versions fail closed. The imported course must pass the normal
review and publishing lifecycle before learners can access it.

## Threat model

| Threat | Control |
| --- | --- |
| Cross-tenant export or import | Stored-membership authorization on both source and destination |
| Archive tampering | Canonical whole-document digest plus source and recipe digests |
| Identifier or secret leakage | Archive-local IDs and recursive sensitive-metadata filtering |
| Broken or substituted citations | Package-local reference validation and transactional remapping |
| Unsupported or malicious block payload | Strict Zod envelope and current block-registry validation |
| Oversized-resource abuse | Route and service size limits plus bounded arrays |
| Partial restore | One database transaction |
| Duplicate replay | Unique destination-Space and archive-digest ledger entry |
| Accidental publication | Imported courses and recipes are private drafts |
| Learner/evidence disclosure | Those record families are absent from the schema and export queries |

## Verification evidence

`tests/portability.test.ts` exercises tenant denial, secret exclusion, whole and
source-level tampering, dry-run no-write behavior, conflict reporting,
transactional source/recipe/block restoration, remapped citations, private
defaults, absence of learner records, semantic round trip and replay blocking.

`tests/phase5-portability-contract.test.ts` locks the authenticated, rate-limited,
no-store API surface and creator-facing dry-run/private-draft language.

`tests/migration-upgrade.test.ts` verifies migration 20 applies forward from the
pre-ledger schema and is recorded once.

## Open Phase 5 boundaries

This slice does not yet provide a standalone recipe archive, a full Space or
account restore, multi-version history, binary raw-source transfer, evidence or
credential restoration, self-hosted installation guidance, upgrade proof or a
clean-install restore exercise. The full Phase 5 release gate remains open.

External validation remains `Pending user acquisition and partner access` and
is not represented as passed.
