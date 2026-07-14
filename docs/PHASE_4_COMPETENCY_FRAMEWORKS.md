# Phase 4 competency frameworks and evidence summaries

**Engineering status:** Deployed

**External validation status:** Pending user acquisition
**External validation reason:** `Pending user acquisition and partner access`

## Boundary

This slice creates BookQuest's internal versioning contract for competency
frameworks and prepares clean mappings to 1EdTech CASE 1.1 and Open Badges 3.0.
It is not a claim of CASE Provider, CASE Consumer or Open Badges certification.

Only a current Space member with `assignments.manage` may publish a framework
version or align an item to a course version. Learners and auditors cannot read
the private authoring inventory through this API. A published version is
append-only; corrections require a new framework and item version.

## Stable identity and exact versions

- A framework has one stable BookQuest identifier and stable key.
- Every publication has a distinct immutable framework-version identifier and a
  CASE-shaped `case_document_sourced_id`.
- A competency item has one stable identifier, stable key and CASE-shaped
  `case_item_sourced_id` across revisions.
- Every revision has a distinct immutable item-version identifier.
- Course alignment names an exact Space, course version, item version, author,
  basis and human-readable condition.
- Claim creation copies the exact alignment, item version, framework version and
  condition into `competency_claim_alignments`. Later framework or course changes
  cannot alter an existing claim.

The shape follows CASE 1.1's framework/document and competency-item model so a
future certified provider can serialize it without replacing BookQuest's
identity model. The current endpoints are private BookQuest authoring APIs, not
the `/ims/case/v1p1` conformance surface.

## Evidence summary semantics

The Passport exposes six transparent fields derived only from the immutable
completion event:

- `mastery.status` is `not_assessed` unless a separately validated mastery scale
  exists. This slice never manufactures a mastery percentage.
- `confidence.status` is `verified_evidence`; it describes evidence-chain
  reconciliation, not confidence in employability or future performance.
- evidence volume counts recorded lesson completions, attestations and approved
  practical reviews in the completion manifest.
- recency is the credential evidence issue time.
- sources are the counted evidence categories, never recipient surveillance.
- conditions reproduce the exact completion-rule version, score threshold,
  observed completion score and required evidence counts.

These fields appear in the learner's private Passport and in a learner-selected
share. They contain no ranking, peer comparison, hiring recommendation or hidden
model output.

## Open Badges alignment

When a claim froze one or more author-declared competency versions, its readable
and signed Open Badges 3.0 credential includes Achievement `alignment` entries.
Each entry carries the stable item sourced identifier, human coding scheme or
stable key, exact framework version and competency statement. A badge issued for
an unaligned claim remains valid and contains no invented alignment.

## Failure rules

- Unknown or cross-Space framework and item identifiers fail without disclosure.
- A course can be aligned only when it is attached to the same Space and the
  exact course version exists.
- Duplicate publication keys, duplicate item keys and malformed statements fail
  before database writes.
- Existing claims are never backfilled after a later alignment.
- Frameworks, versions, items, mappings and claim alignment snapshots reject
  update and deletion at the database boundary.

## External validation backlog

CASE conformance endpoints, certification testing, bulk import/export and
external framework validation remain future demand-driven work. Institutional
claims still require real pilot, security, accessibility and stakeholder
evidence. Status: Pending user acquisition. Reason:
`Pending user acquisition and partner access`. None of these items blocks public
product development.
