# BookQuest Platform Phase Tracker

**Purpose:** the single execution tracker for growing BookQuest from a
document-to-course app into an open, trusted and configurable learning platform.  
**Status:** active living roadmap  
**Last updated:** 14 July 2026
**Current product priority:** public-launch productization
**Next product slice:** public-launch conversion and accessibility polish based
on acquired-user feedback; Phase 5 remains paused

This tracker turns `PRODUCT_BLUEPRINT.md` into buildable phases. Every phase has
an outcome, checklist, release gates, measurements and explicit deferrals.

---

## How to maintain this tracker

- Engineering status is exactly one of: **Not started**, **In progress**,
  **Implemented**, **Tested**, or **Deployed**.
- External validation status is exactly one of: **Not available yet**,
  **Pending user acquisition**, **Early-user validated**, **Pilot validated**, or
  **Institutionally validated**.
- `[ ]` means evidence is still open; `[x]` means the named engineering work and
  its stated verification are complete.

Engineering progress and external validation are independent. Unavailable
external validation stays open honestly but never blocks safe product work.
Partner-dependent details are requested only after the builder explicitly says
access is available. No pilot, acceptance, identity-provider detail, measurement
or assessment may be invented.

After each meaningful change:

1. Update its checklist item and name the proof: test, report, screen or decision.
2. Record material scope or architecture changes in the decision log.
3. Put new ideas in the Idea Preservation Register instead of silently expanding
   the active phase.
4. Keep third-party proof in the **External validation backlog**, with the reason
   `Pending user acquisition and partner access`, until real access exists.

---

## North star

> Create any learning experience, from any trusted source, for any audience, in
> a space the user controls.

One platform should let an individual learn privately, a creator publish openly,
and an institution operate securely. Its four primary experiences are:

1. **Learn** — assignments, personal learning, progress and credentials.
2. **Create** — sources, recipes, editing, preview, review and publishing.
3. **Manage** — spaces, people, policies, assignments, evidence and reports.
4. **Discover** — public courses, creators, templates and communities.

---

## Product constitution — never lose these ideas

### Freedom without lock-in

- Users own their source content and can export their work.
- Personal, private, organizational and public use are first-class modes.
- AI providers, delivery channels and hosting models remain replaceable.
- Prefer documented APIs and portable formats over closed exports.
- Create limitless variation through composable primitives, not hundreds of
  unrelated settings.

### Private and permissioned by design

- Personal and organizational content is private by default.
- Access is evaluated for the authenticated identity and requested resource.
- A URL or room code alone cannot grant high-trust access.
- Private documents and answers are not used for model training or cross-tenant
  learning without explicit permission.
- Identity stays separate from pseudonymous learning evidence.

### Human authority over AI

- Generated content is a draft until an authorized human approves it.
- Important generated claims trace back to their source material.
- Model, prompt, source and course versions remain discoverable.
- Organizations can choose an AI provider, bring their own, or disable AI for
  approved content.
- BookQuest never describes AI output as automatically legally compliant.

### Evidence before claims

- Accepted answers are recorded exactly once.
- Published content, completion rules and credentials are versioned.
- Certificates and Skill Passport claims link to supporting evidence.
- Reports state what BookQuest can prove and show important limitations.

### Inclusive everywhere

- Mobile-first, low-bandwidth and interruption-safe behavior is a baseline.
- Accessibility targets WCAG 2.2 AA across authoring and learning.
- Courses support multiple languages, reading levels and accommodations.
- Device, bandwidth or channel limitations must not unfairly reduce results.

### One platform, shared primitives

- Web, offline and chat use the same course, assignment, answer and evidence
  services.
- Personal groups, classes, companies and departments use the same Space model
  with different policies.
- New verticals reuse versioning, roles, evidence and credentials.

---

## Master phase map

| Phase | Outcome | Engineering status | External validation status |
|---|---|---|---|
| 0. Evidence and reliability | Activity is trustworthy, replay-safe and operable | **Deployed** | **Not available yet** |
| 1. Spaces and tenancy | Anyone can create a controlled learning space | **Deployed** | **Pending user acquisition** |
| 2. Course Studio and recipes | Creators can build, edit and reuse many course types | **Deployed** | **Pending user acquisition** |
| 3. Institutional workflow | An organization can complete an auditable training journey | **Deployed** | **Pending user acquisition** |
| 4. Credentials and interoperability | Evidence can be shared, verified and moved | **Deployed** | **Pending user acquisition** |
| 5. Open ecosystem | Templates, APIs and sovereign hosting expand safely | **Not started** | **Not available yet** |
| 6. Learning Genome | Evidence improves questions and learning paths | **Not started** | **Not available yet** |
| 7. Multi-channel and scale | Learning works across web, offline and messaging | **Not started** | **Not available yet** |

“Deployed” describes the documented engineering scope, not institutional
validation or certification. Phase 5 architecture expansion is paused while the
public product is productized. Productization priorities and the A–D audit are in
`docs/PUBLIC_LAUNCH_PRODUCTIZATION.md`.

## External validation backlog

**Status:** Pending user acquisition

**Reason:** `Pending user acquisition and partner access`

The following evidence is deliberately open and does not block engineering:

- Blacksteel participation, real completion evidence, stakeholder audit-pack
  acceptance and willingness-to-pay feedback.
- Named LMS testing, including any future AGS grade-passback acceptance.
- Independent penetration testing and remediation confirmation.
- Independent full-journey WCAG 2.2 AA assessment.
- Institutional stakeholder acceptance, external identity-provider/SCIM proof,
  and other third-party deployment evidence.

Do not ask for contacts, client secrets, test accounts, pilot dates, baseline
measurements or external assessors unless the builder explicitly says access is
available. Never create synthetic validation evidence.

---

## Phase 0 — Evidence and reliability foundation

**Engineering status:** Deployed (12 July 2026 UTC)

**External validation status:** Not available yet
**Outcome:** BookQuest can prove what a learner answered, prevent replay from
changing outcomes twice, and operate reliably enough for organizations.

### Implemented baseline

- [x] Managed PostgreSQL production data layer.
- [x] Durable, resumable course generation.
- [x] Pseudonymous learner identities.
- [x] Stable concept, question and question-version identities.
- [x] Append-only evidence with database immutability guards.
- [x] Server-authoritative grading.
- [x] Idempotent event IDs and semantic answer uniqueness.
- [x] Transactional mastery and source-projection updates.
- [x] Persisted lesson, review and practice answer sessions.
- [x] Evidence-reconciled, idempotent lesson completion.
- [x] Account-scoped browser answer outbox.
- [x] Network-only caching for authenticated APIs.
- [x] Ledger-health counters and automated logic tests.

### Remaining build work

- [x] Rate-limit authentication, upload, generation and answer routes.
- [x] Add abuse, unexpected-cost and production-error monitoring.
- [x] Add email verification and password recovery.
- [x] Test backups and point-in-time recovery.
  (Logical backup restoration is automated in CI by
  `scripts/backup-restore-drill.mjs`: it restores a snapshot-consistent dump to a
  guarded disposable database and verifies tables, rows and schema objects.
  Neon provider-level PITR restoration and recorded RPO/RTO remain required.
  The production project/branch, 24-hour retention window, selected historical
  timestamp and privacy-safe verification counts are prepared in
  `docs/evidence/phase0-pitr-reference-2026-07-12T220239Z.json`; the isolated
  historical branch was subsequently created and verified successfully. Both
  real scripts passed with zero projection drift; measured recovery-point lag
  was 508 seconds and full operational recovery time was 301 seconds. Evidence
  is in `docs/evidence/phase0-pitr-drill-2026-07-12T222519Z.json`. The temporary
  branch was deleted after verification; production was never modified.)
- [x] Run database integration tests in CI on a scratch database.
  (`.github/workflows/ci.yml` runs typecheck, build and `npm test` against a
  throwaway Postgres 16 service, so the gated integration tests execute for real.)
- [x] Add generation-run tokens to block stale worker writes.
- [x] Replace lazy schema evolution with versioned transactional migrations.
  (`lib/migrations.ts` ledger + `ensureSchema` runner; tests in
  `tests/migrations.test.ts`.)
- [x] Test upgrades using a realistic pre-ledger database copy.
  (`tests/migration-upgrade.test.ts` applies the earliest Postgres schema in
  `tests/fixtures/pre-ledger-schema.sql`, seeds rows, runs the real
  `applyPendingMigrations`, and asserts backfills, new tables and preserved data.)
- [x] Queue lesson completion for fully offline reconciliation.
  (Durable, account-scoped completion outbox in `lib/answer-outbox.ts`, flushed
  after the answer outbox so evidence reconciliation passes; `409 evidence_pending`
  is transient. Tests in `tests/lesson-completion-outbox.test.ts`.)
- [x] Add consent, retention, export and erasure workflows.
  (`lib/privacy.ts`, account privacy/export/deletion APIs, profile controls and
  `scripts/privacy-maintenance.mjs`; database proof in
  `tests/privacy-lifecycle.test.ts`.)
- [x] Define archive, soft-delete and controlled-redaction rules.
  (`docs/PRIVACY_LIFECYCLE.md` defines retention classes, account/course outcomes,
  legal holds and exceptional controlled-redaction procedure.)
- [x] Add projection rebuild and ledger reconciliation commands.
  (`lib/projection.ts` reconciles/rebuilds `concept_mastery` from the immutable
  ledger; `node scripts/reconcile.mjs [--rebuild] [--course=<id>]` exits non-zero
  on drift. Tests in `tests/projection-reconciliation.test.ts`.)
- [x] Add admin drill-down for delayed events and outbox failures.
  (`deliveryHealth` in `lib/observability.ts` aggregates delayed events
  (recorded_at − occurred_at) and `learning.answer_failed` events with samples;
  surfaced in the admin dashboard. Tests in `tests/delivery-health.test.ts` and
  `tests/observability.test.ts`.)
- [x] Decide when volume requires IndexedDB and table partitioning.
  (`docs/PRIVACY_LIFECYCLE.md` records measurable queue/storage and
  row/size/query-latency triggers.)

### Release gates

- [x] Every answer source produces exactly one immutable event.
  (`tests/learning-ledger.test.ts` and the database uniqueness/immutability
  triggers; all database tests pass against isolated Postgres 16.)
- [x] Replay cannot increment mastery, progress or XP twice.
  (`tests/learning-ledger.test.ts` verifies answer and completion replay.)
- [x] Clients cannot set correctness or another learner's context.
  (`tests/answer-route-security.test.ts` submits forged correctness, course and
  learner fields and proves the server grades/stores its saved context.)
- [x] Lesson, practice and review contexts cannot cross users or courses.
  (Adversarial route integration tests cover foreign accounts, sessions, lessons,
  practice items and review records.)
- [x] Failed delivery recovers using the original event ID.
  (Account-scoped answer and completion outbox tests, including answers-first
  reconciliation and transient `evidence_pending` recovery.)
- [x] Projections reconcile against immutable evidence.
  (`reconcileConceptMastery` / `rebuildConceptMastery` + `scripts/reconcile.mjs`.)
- [x] Rate limits protect costly and authentication-sensitive routes.
  (Distributed route policies plus `tests/rate-limit.test.ts`; privacy export and
  mutations now have account-scoped limits too.)
- [x] A documented backup restoration succeeds.
  (12 July 2026 isolated PostgreSQL 16 drill: snapshot dump restored into a
  guarded disposable database; 28 tables, 2 rows, 203 schema objects and both
  migrations matched. Neon PITR then restored and verified an isolated
  historical branch with measured recovery-point lag and operational recovery
  time; `docs/evidence/phase0-pitr-drill-2026-07-12T222519Z.json`.)
- [x] Type checking, tests and production build pass in CI.
  ([GitHub Actions CI #6](https://github.com/yasinjemal/BookQuest/actions/runs/29210905776)
  passed for commit `a4f0ba9` on 12 July 2026; the Postgres-backed typecheck,
  production build and test job completed successfully.)
- [x] No known critical or high-severity security issue remains open.
  (`docs/PHASE_0_THREAT_MODEL.md` records the route/threat review and resolved
  billing, generation, class-evidence and concurrency findings; all 65 tests pass.
  Dependency audit reports zero high/critical and two documented moderate issues.)

### Measure

- Missing events and reconciliation mismatches
- Oldest queued answer and replay success
- Generation completion and recovery
- Abuse rate and error-free request rate
- Backup recovery time and recovery point

**Deferred:** organizations → Phase 1; editable courses/templates → Phase 2;
audit packs → Phase 3; adaptive learning → Phase 6.

---

## Phase 1 — Spaces, tenancy and permissions

**Engineering status:** Deployed (12 July 2026 UTC)

**External validation status:** Pending user acquisition
**Outcome:** individuals, groups, schools, companies and departments use one
Space model while retaining distinct privacy and access rules.

### Build checklist

- [x] Create an automatic personal Space for every account.
  (`createUser` and migration 3 create one idempotent owner membership; verified
  by `tests/spaces-tenancy.test.ts` and the legacy upgrade test.)
- [x] Support personal, private, unlisted, organization and public Space types.
  (`spaces.type`, policy defaults and the `/spaces` creation journey.)
- [x] Separate discovery, visibility, joining and content-sharing policies.
  (Independent database policy fields with private-by-default presets.)
- [x] Add active, suspended, archived and deletion-scheduled states.
  (Constrained lifecycle state plus deny/read-only enforcement in centralized
  authorization; lifecycle transition UI remains part of the open workflow work.)
- [x] Add profile, branding, language, timezone and optional child Spaces.
  (`updateSpaceProfile` validates and audits these fields, authorizes both sides
  of a parent link and rejects hierarchy cycles; database tests cover the flow.)
- [x] Migrate classrooms without losing members, courses or progress.
  (Migration 3 deterministically backfills class Spaces, memberships, course
  links, assignments and assignees while retaining all legacy records; verified
  by `tests/migration-upgrade.test.ts`.)
- [x] Keep “class” as a simple Space preset.
  (`preset='class'` on migrated classrooms; no separate authorization model.)
- [x] Add invited, active, suspended, removed and expired memberships.
  (Constrained membership lifecycle, live expiry/status authorization and
  invitation/removal transitions.)
- [x] Add owner, administrator, creator, reviewer, manager, learner and auditor.
  (`ROLE_CAPABILITIES` deny-by-default matrix and per-Space membership role.)
- [x] Store roles per Space instead of relying on one global role.
  (All Space service authorization reads `space_memberships`; platform admin has
  no implicit tenant access.)
- [x] Centralize authorization for every protected route.
  (`authorizeSpace`, stored-membership services and live course participation are
  the shared enforcement points for Space, class, course, lesson, practice,
  review, answer and completion routes. Course owner mutations no longer grant a
  global admin bypass; account/billing/privacy routes remain account-scoped.)
- **DEFERRED (Phase 3):** custom roles as bundles of approved capabilities.
  (The fixed Phase 1 role matrix must stabilize in a real institutional pilot
  before administrators can compose safer custom bundles.)
- [x] Add teams/groups and secure expiring, revocable invitations.
  (Space-scoped team membership APIs reject cross-Space/inactive members;
  invitation acceptance, expiry and revocation are single-use and audited.)
- [x] Keep join codes only where a Space policy explicitly allows them.
  (Only migrated/new `class` presets set `join_code_enabled`; legacy class join,
  creation and assignment now update Space state transactionally.)
- [x] Audit membership and permission changes immutably.
  (Invitation, activation, removal, role and revocation events are protected by
  append-only database triggers and adversarial tests.)
- [x] Associate every current tenant resource with a Space; require the same for
  Phase 2 source/template records before their routes ship.
  (`docs/SPACE_CONTENT_OWNERSHIP.md` maps direct and inherited ownership for
  courses, embedded source chapters, modules, lessons, sessions, assignments,
  evidence, projections, classes, teams and reports. Standalone source/template
  records do not exist yet and remain a Phase 2 creation gate.)
- [x] Derive Space, assignment and enrollment evidence context on the server.
  (Answer and lesson-completion events reauthorize live membership and persist
  server-selected Space, membership, assignment and policy version.)
- [x] Define ownership and move/copy rules for personal and organization content.
  (`docs/SPACE_CONTENT_OWNERSHIP.md` defines single ownership, explicit sharing,
  version/evidence preservation and denied-until-safe move/copy semantics.)
- [x] Add cross-Space tests for every current resource family, storage key, cache and job.
  (Pure and PostgreSQL suites cover Space/resource mismatch, foreign courses,
  assignments, roles, teams, class codes, answer/practice sessions, completion,
  queued answers and immutable evidence. Account-scoped outbox tests prevent
  cross-user storage keys; generation-run tests prevent stale/foreign job writes.)
- [x] Add safe tenant export, archive and deletion workflows.
  (Owner-only rate-limited export, audited archive/restore and reversible
  deletion scheduling; read-only enforcement is covered by database tests. The
  retention worker for eventual physical purge remains governed by the ownership
  contract rather than a request-path cascade.)

### Privacy modes

| Mode | Discovery | Entry | Default content access |
|---|---|---|---|
| Personal | Owner only | Owner | Owner only |
| Private | Hidden | Invitation/approval | Members by role |
| Unlisted | Not searchable | Controlled link/code | Approved participants |
| Organization | Policy controlled | Managed membership | Role/team scoped |
| Public | Searchable | Open or moderated | Published content only |

### Release gates

- [x] Accounts and classrooms migrate without losing content or progress.
  (The pre-ledger upgrade test preserves users, course hierarchy and progress,
  and verifies class Space memberships/course/assignment backfills; compatibility
  tests cover post-migration create, code join, assign and unassign.)
- [x] Every protected current resource has a Space owner and policy.
  (The ownership matrix documents direct/inherited keys; migration 3 backfills
  courses and classes, session/evidence writes stamp context, and shared route
  authorization rechecks policy. Future Phase 2 records are gated on adding their
  owner before exposure.)
- [x] Tests prove users cannot read or change another private Space.
  (`tests/space-authorization.test.ts` and `tests/spaces-tenancy.test.ts` cover
  missing membership, wrong-Space resources and cross-tenant attachment.)
- [x] Revoked or expired invitations cannot be reused.
  (`tests/spaces-tenancy.test.ts` verifies accepted, revoked and expired tokens
  fail on reuse and membership state follows invitation lifecycle.)
- [x] Role changes take effect immediately and are audited.
  (Database test promotes a learner to manager, uses the capability, demotes the
  learner, observes immediate denial and verifies immutable audit events.)
- [x] Public, unlisted and private metadata behave differently as documented.
  (Anonymous discovery returns only active public Spaces with public discovery;
  database tests prove private and unlisted metadata are excluded.)
- [x] Evidence uses server-derived Space and assignment context.
  (Schema v2 answer and completion records are asserted against the resolved
  live membership and assignment; forged client context is not accepted.)
- [x] Personal learning remains simple after Spaces are introduced.
  (Account creation supplies an owner-only personal Space automatically; existing
  course/enrollment flows resolve it without setup, and the Spaces screen lists
  it alongside collaborative Spaces.)

### Closure evidence

- Implementation commit `6b48c5a818c8141b7d9d5d64aa4437a48b17afcd` passed
  [GitHub Actions CI #7](https://github.com/yasinjemal/BookQuest/actions/runs/29212859675)
  with the full scratch-Postgres suite, type checking and production build.
- Vercel reported a successful production deployment for the same commit at
  `https://book-quest-silk.vercel.app`.
- Migration 3 applied under the production advisory migration lock at
  `2026-07-12T23:11:34.055Z`.
- The read-only production readiness gate found 10/10 required tables, automatic
  personal Spaces for 2/2 users, Space ownership for 2/2 courses, a valid class
  Space for 1/1 classroom and zero ownership, membership, assignment-audience or
  post-migration evidence-context failures.
- Production HTTP smoke checks returned `200` for public discovery and the Spaces
  shell, `401` for protected Space/course APIs, and redirected the unauthenticated
  Spaces experience to login. The exact deployed commit's PostgreSQL tests supply
  the mutating invite/assignment/revocation proof without creating synthetic
  customer-visible production records.
- Dated evidence is stored in
  `docs/evidence/phase1-readiness-2026-07-12T231208Z.json`.
- Accepted limitation: custom role bundles remain deferred to the Phase 3 pilot;
  the fixed deny-by-default role matrix is the supported Phase 1 contract.

### Measure

- Space creation and invitation completion
- Time to create a class/private group
- Authorization denials and suspicious access
- Cross-tenant coverage and incidents (target: zero)
- Classroom migration success

**Deferred:** custom domains, SSO/SCIM, data residency and custom role bundles →
Phase 3; template marketplace → Phase 5; cross-installation federation → future
evaluation.

---

## Phase 2 — Course Studio, blocks and reusable recipes

**Engineering status:** Deployed (13 July 2026 UTC)

**External validation status:** Pending user acquisition
**Outcome:** creators can generate, manually build, review, customize and reuse
unique learning experiences with source traceability.

### Source Library and lifecycle

- [x] Store versioned, Space-owned source records.
  (Migration 4 backfills every legacy upload into `source_assets` and immutable
  `source_versions`; new upload/manual paths initialize them transactionally in
  `lib/studio.ts`.)
- [x] Retain PDF, DOCX, Markdown and text support.
  (The existing byte-stream extractors remain active and now append their output
  to the versioned Source Library.)
- [x] Add PowerPoint, webpage, transcript and manual sources.
  (PPTX slide XML is extracted with bounded ZIP expansion; webpage import pins
  validated public DNS addresses, blocks SSRF ranges/redirects and limits bytes;
  transcript/manual entry is available in Create. Tests cover PPTX order, empty
  files, IP blocking and safe HTML text extraction.)
- [x] Combine multiple sources into a controlled collection.
  (`createCourseDraftFromSources` validates 1–20 same-Space immutable source
  versions, orders primary/supporting items and creates a versioned collection;
  the Create screen exposes the flow.)
- [x] Record extraction, source and processing provenance.
  (Source versions persist SHA-256 content hash, MIME type, extractor version,
  optional model, file extension/size, chapter count and structured provenance.)
- [x] Add source-level permissions, replacement and retention rules.
  (Owner/editor/member access policy, immutable replacement versions, archive/
  restore/deletion scheduling and structured retention policy are enforced in
  `lib/studio.ts`; archived sources cannot be replaced.)
- [x] Show source coverage and unsupported claims during review.
  (`analyzeCourseVersion` verifies source-version references per block and the
  Studio draft-check panel reports traced and unsupported blocks.)
- [x] Add draft, review, approved, published, superseded and archived states.
  (Studio lifecycle services enforce each transition, require approval before
  publication, supersede the previous release atomically and archive only
  unpublished working versions.)
- [x] Make published course versions immutable.
  (Migration 4 guards published/superseded/archived versions, their block layout
  and append-only block/source revisions; upgrade tests prove mutation fails.)
- [x] Branch new drafts from published versions and show version differences.
  (Branching copies immutable source links and current block snapshots while
  retaining lineage; Studio shows added, removed and changed lineage counts.)
- [x] Preserve evidence against the version each learner experienced.
  (Lesson, practice and review sessions capture their content version at session
  creation; question and learning evidence use that captured version even after
  a newer release is published. The lifecycle test proves this race.)
- [x] Add comments, requested changes, approval history and safe rollback.
  (Reviewer notes can be resolved, review decisions are append-only, requested
  changes return a version to draft, and any superseded release can be restored
  as a new draft without altering history.)

### Composable blocks

- [x] Create stable, versioned block identities and a block registry.
  (`block_types`, stable lineage IDs and append-only `course_block_revisions`;
  legacy cards and completed generation runs are backfilled/snapshotted.)
- [x] Support explanation, image, audio/video, story and worked example.
- [x] Support flashcard, multiple choice, true/false and fill-in.
- [x] Support scenario, practical task, discussion, survey and attestation.
  (All built-ins have validated Studio editors, immutable publication snapshots
  and safe learner-player rendering. Graded types normalize into the existing
  server-graded immutable question pipeline; media opens without executable
  embeds and supplies its required text alternative.)
- [x] Define offline/channel compatibility and fallbacks per block.
  (`BLOCK_CHANNELS` and the persisted registry declare offline/chat support and
  deterministic non-executable fallbacks for all built-in types.)
- [x] Validate accessibility metadata per block.
  (Zod block contracts and media-specific alternative checks reject inaccessible
  edits; draft analysis surfaces remaining issues before review.)
- [x] Design a safe future extension contract.
  (`PHASE_2_ARCHITECTURE.md` restricts Phase 2 to the allowlisted data-only block
  registry; executable third-party blocks remain gated to Phase 5.)

### Recipes and templates

- [x] Define a versioned recipe separate from generated content.
  (`recipes` and immutable `recipe_versions` remain independent of content and
  learner data; a course pins one exact optional recipe version.)
- [x] Capture audience, objectives, difficulty, duration and lesson size.
- [x] Capture teaching style, tone, language and reading level.
- [x] Capture assessment mix, pass rule, credential and expiry behavior.
- [x] Capture delivery and accessibility preferences.
  (The validated recipe contract persists each of these fields explicitly rather
  than hiding generation policy in a prompt.)
- [x] Allow private, Space-shared, unlisted and public recipes.
  (Constrained visibility is Space-owned and all management uses live Space
  capabilities.)
- [x] Allow forking while preserving lineage and version.
  (Public/unlisted recipes can be copied into another Space with origin recipe
  and exact version retained; later revision appends instead of overwriting.)
- [x] Ship starter recipes for onboarding, compliance, school subjects, exam prep,
  certification, public awareness, safety, product training, micro-courses and
  scenario simulations.
  (Ten data-only starter contracts carry mobile/offline, accessibility, trace and
  safety defaults and can be added from Create without learner data.)

### Studio experience

- [x] Separate Learn, Create, Manage and Discover contexts.
  (Navigation now exposes Create and Studio alongside Learn, Spaces/Manage and
  Explore without changing learner routes.)
- [x] Edit the outline before full generation.
  (Draft module titles, summaries, ordering and lesson titles are editable in
  Studio and are resnapshotted transactionally before review/publication.)
- [x] Edit and reorder lesson blocks.
  (Studio provides validated field editors, optimistic revision checks, source
  links and per-lesson move controls backed by a complete-order transaction.)
- [x] Regenerate only a selected block, lesson or module.
  (Scope-specific jobs snapshot target revisions, ground each replacement in the
  pinned source versions, validate the returned block schema and reject stale
  writes; Studio exposes block, lesson and module actions.)
- [x] Preserve manual edits outside regeneration scope.
  (Scoped application writes revisions only for job targets. The authoring test
  edits an unrelated block after job start, applies regeneration, and proves the
  manual revision and origin remain intact.)
- [x] Preview mobile, desktop and offline experiences.
  (Studio switches between editable, narrow mobile, wide desktop and offline
  learner previews; offline-incompatible blocks show their declared fallback.)
- [x] Show estimated duration, accessibility and source-coverage checks.
  (The analysis panel uses pinned recipe timing when present, otherwise a
  deterministic block estimate, alongside schema/accessibility and source-link
  results.)
- [x] Make AI optional in every creation path.
  (Blank and Source Library drafts remain AI-free, while direct document upload
  now has an explicit AI toggle; the off path extracts into Studio, charges no
  generation credit and schedules no model work.)

### Release gates

- [x] Create a course from one source, multiple sources or a blank draft.
  (The Create screen and Studio APIs cover all three paths; blank/manual creation
  consumes no AI generation credit.)
- [x] Every generated lesson is editable before publishing.
  (Completed legacy generation is snapshotted into editable Studio blocks;
  publication is restricted to reviewed and approved version snapshots.)
- [x] Published versions cannot be silently changed.
  (Database guards reject version, layout and revision mutation after publish;
  both migration and authoring suites exercise the boundary.)
- [x] Published assessments resolve to immutable question versions.
  (Publication materializes a versioned learner projection; answer sessions pin
  its course version and immutable question content hash before accepting work.)
- [x] Reviewers can trace important material back to sources.
  (Per-block immutable source-version references and the coverage panel remain
  visible through review, and publication rejects missing/out-of-scope links.)
- [x] Recipes can be saved, forked and reused without learner data.
  (`tests/recipes.test.ts` creates, publishes, appends, forks and attaches an
  exact version to a course while proving the recipe tables contain no learner
  state.)
- [x] Manual edits survive unrelated regeneration.
  (`tests/studio-authoring.test.ts` exercises the concurrent manual-edit case and
  verifies only the selected block receives a regenerated revision.)
- [x] Starter recipes pass accessibility, mobile and offline checks.
  (The starter-contract test requires every starter to declare WCAG 2.2 AA,
  mobile, low-bandwidth and offline defaults plus at least one safety boundary;
  their data-only controls use the existing responsive Create journey.)

### Closure evidence

- Release commit `b665ab671b7128f6dddbdb973569a918ed6a3ab0` passed
  [GitHub Actions CI #29215549437](https://github.com/yasinjemal/BookQuest/actions/runs/29215549437)
  from `2026-07-13T00:32:37Z` to `2026-07-13T00:34:07Z`. The job completed
  TypeScript checking, production build, migrations 1–5, 120 unit/database tests
  on PostgreSQL 16 and logical backup restoration.
- Vercel reported a successful production deployment for the same SHA at
  `https://vercel.com/dynasty-built-academy/book-quest/B2q9TkdjW1SmvdfsXzM669yTTTe5`;
  the production application is `https://book-quest-silk.vercel.app`.
- Migration 4 (`course_studio_foundation`) applied at
  `2026-07-12T23:39:24.549Z`; fix-forward migration 5
  (`phase2_lifecycle_hardening`) applied at `2026-07-13T00:36:40.410Z`.
  The release also replaced session-level schema locking, which is unsafe through
  transaction pooling, with a transaction-scoped lock. One lock leaked by the
  prior implementation was identified precisely, terminated with operator
  approval and confirmed absent before migration 5 ran.
- The post-smoke read-only production gate found every required table and trigger,
  verified the hardened lifecycle function and checked 5 courses, 6 course
  versions, 5 sources/versions, 317 blocks, one recipe and two published immutable
  versions with all 13 failure counters at zero. Exact output is stored in
  `docs/evidence/phase2-readiness-2026-07-13T004248Z.json`.
- Anonymous production smoke checks returned `200` for Create, `401` for protected
  Source/Recipe/regeneration APIs and `405` for unsupported GET on the POST-only
  course-creation route. An authenticated synthetic journey proved AI-off upload
  without credit use, automatic personal Space, pinned source/recipe versions,
  outline/block edits, ordering, coverage/accessibility checks, approval,
  immutable publication, branching and lineage diff. It then unpublished the
  synthetic course, archived working drafts and revoked the session. Exact proof
  is stored in `docs/evidence/phase2-production-smoke-2026-07-13T004203Z.json`.
- Accepted limitation: production had no post-migration learner answer events at
  measurement time. Exact-version learning evidence is therefore established by
  the deployed PostgreSQL integration suite rather than synthetic learner records
  in production. The smoke account remains as non-visible audit evidence; it owns
  no visible published course and its session was revoked.

### Measure

- Time from upload to draft and draft to publication
- Generated blocks edited/rejected and unsupported-claim rate
- Recipe reuse/fork rate and creator abandonment
- Accessibility issues caught before publication

**Deferred:** paid template marketplace and executable extensions → Phase 5;
automatic legal-compliance claims → permanent non-goal; adaptation → Phase 6.

---

## Phase 3 — Institutional workflow

**Engineering status:** Deployed

**External validation status:** Pending user acquisition

**External validation reason:** `Pending user acquisition and partner access`
**Outcome:** a real organization completes this controlled journey:

> Private Space → controlled source → compliance recipe → review and approval →
> immutable publication → learner assignment → evidence → completion rule →
> accepted audit pack.

### Build checklist

- [x] Assign individuals, teams or a Space with start/due dates and expiry.
- [x] Add reminders, escalations, reassignment and attempt policies.
- [x] Add versioned completion rules, thresholds and attestations.
- [x] Add manager-approved practical tasks where needed.
- [x] Preserve assignment history through membership and version changes.
- [x] Link completion to assignment, course version and evidence IDs.
- [x] Issue expiring, revocable, evidence-linked certificates.
- [x] Add privacy-preserving certificate verification.
- [x] Export completion data as CSV and a readable PDF audit pack.
- [x] Include report scope, rule versions, attempts, attestations, revocations,
  generator time and report-format version.
- [x] Give auditors read-only evidence/report access.
- [x] Add MFA and validate the pilot-selected sign-in path. The first partner chose
  verified BookQuest email/password; OIDC/SAML and SCIM remain demand-driven.
- [x] Add organization password, session, retention and legal-hold policies.
- [x] Document regional residency, continuity, recovery and incident response.
- [x] Add dependency scanning and internal security review. Independent
  penetration testing is tracked separately as external validation.
- [x] Publish data-flow, subprocessor and security questionnaire material.
- [x] Add branding, bulk invitation and role-scoped dashboards.
- [x] Publish an accessibility statement and remediation process; independent
  full-journey WCAG 2.2 AA assessment is tracked as external validation.
- [x] Build the governed pilot workflow without fabricating partner activity.

Authenticator MFA and recovery codes are complete. The first partner selected
BookQuest email/password rather than external SSO; migration 9 and the governed
pilot workflow now treat that as an explicit, tested sign-in choice without
fabricating an OIDC/SAML connection. OIDC/SAML and SCIM remain demand-triggered.
Dependency automation and internal security review are complete,
while the independent penetration test remains open. The accessibility statement
and remediation process are published; independent full-journey assistive-technology
testing remains open.

The governed pilot workflow is implemented. Organization owners can
version the partner baseline and success criteria, managers can append pseudonymous
admin/learner observations, and owners can append role-snapshotted stakeholder or
assessor decisions linked to exact audit-pack and credential records. The closure
service refuses completion without no-database admin/learner observations, a real
completed participation, reconciled versions, an accepted audit pack, a live-revoked
credential, a tested selected sign-in method (and an active connection when the
method is OIDC/SAML), and every external gate.
This makes external validation executable but does not satisfy it. Product
development continues independently; the workflow must not demand partner data
until the builder explicitly has access.

### Production evidence to date

- Release commit `74c5abb0cb73aeeb5d368c197a4964ba8b0a61f8` passed
  [GitHub Actions CI #29244515362](https://github.com/yasinjemal/BookQuest/actions/runs/29244515362)
  and the independent
  [production dependency audit #29244515389](https://github.com/yasinjemal/BookQuest/actions/runs/29244515389).
  CI completed type checking, the production build, migrations 1–7, 134
  unit/database tests on PostgreSQL 16 and logical backup restoration.
- Vercel reported a successful production deployment for the same commit at
  `https://vercel.com/dynasty-built-academy/book-quest/F4cbVuHyRbcDFredZmsSVv3NBFsY`;
  the production application is `https://book-quest-silk.vercel.app`.
- Migration 6 (`institutional_evidence_foundation`) applied at
  `2026-07-13T10:59:45.834Z`; migration 7
  (`institutional_policy_and_mfa`) applied at `2026-07-13T10:59:46.071Z`.
- The read-only production gate found all 21 required tables and 13 append-only/
  version-lock triggers. It reconciled six migrated assignments and nine
  participations with all eight binding, tenant, policy and credential-expiry
  failure counters at zero.
- Production HTTP/browser smoke checks rendered the security, accessibility and
  opaque credential-verification pages, returned `404` for an unknown private
  token and recorded no browser warnings or errors.
- Exact evidence is stored in
  `docs/evidence/phase3-production-readiness-2026-07-13T110212Z.json`.
- Governed-pilot release `60a4408d7876e52774024ee5ca6f757146d6602c`
  passed [CI #29246436133](https://github.com/yasinjemal/BookQuest/actions/runs/29246436133),
  the [security audit #29246436003](https://github.com/yasinjemal/BookQuest/actions/runs/29246436003)
  and Vercel deployment. Migration 8 (`institutional_pilot_evidence`) applied at
  `2026-07-13T11:31:53.709Z`. The expanded production gate found all 26 tables,
  all 18 integrity triggers and all ten consistency counters at zero. Anonymous
  API access returned `401`, the page redirected to login and the browser logged
  no warnings or errors. Exact evidence is in
  `docs/evidence/phase3-pilot-workflow-production-2026-07-13T113208Z.json`.
- This does not validate Phase 3 externally: production currently has no Blacksteel organization
  Space,
  completion, credential or audit-pack rows. A real partner journey, stakeholder
  audit-pack acceptance, live revocation proof, pilot sign-in test,
  independent penetration test and assistive-technology audit remain required.
- Blacksteel pilot-enablement release
  `101888e7215765e4591a5bb0c1a076cd51452349` passed
  [CI #29250291188](https://github.com/yasinjemal/BookQuest/actions/runs/29250291188),
  [security checks #29250291192](https://github.com/yasinjemal/BookQuest/actions/runs/29250291192)
  and a Ready Vercel production deployment. Migration 9
  (`pilot_password_sign_in`) applied at `2026-07-13T12:36:59.349Z`; the read-only
  production gate found all 26 required tables, all 18 integrity triggers and all
  ten failure counters at zero. Exact evidence is in
  `docs/evidence/phase3-blacksteel-sign-in-production-2026-07-13T123718Z.json`.

### External validation candidate — not started

- Partner: Blacksteel Clothing Pilot, clothing wholesale and retail, South Africa.
- Responsible stakeholder: business owner; proposed cohort: one administrator and
  three to five employees.
- Source: employee onboarding and shop-procedures document (final document pending).
- Current process: verbal training plus WhatsApp messages, with no formal record,
  assessment, completion proof or verifiable certificate.
- Audit purpose: prove employee completion of onboarding and workplace procedures.
- Agreed journey: upload one document, create and review a course, assign it, obtain
  at least three real completions, generate an audit pack, and record the owner's
  usefulness and willingness-to-pay decision.
- Sign-in: BookQuest email/password; SCIM is not required.
- Pilot dates and the quantitative time/administration baseline remain open. The
  execution and evidence procedure is in `docs/BLACKSTEEL_PHASE_3_PILOT.md`.

### External validation backlog

**Status:** Pending user acquisition

**Reason:** `Pending user acquisition and partner access`

- [ ] A partner completes the journey without manual database work.
- [ ] The responsible stakeholder accepts the audit pack for its stated purpose.
- [x] Course, rule, assignment, attestation and certificate versions reconcile in
  the PostgreSQL integration suite.
- [x] Revoked credentials fail verification in automated tests.
- [x] Manager/auditor scopes pass cross-team authorization tests.
- [x] Application backup/restore and incident exercises are documented.
- [ ] An independent penetration test closes material findings.
- [ ] An independent full-journey WCAG 2.2 AA assessment is completed.
- [ ] Real admin/learner use, support needs and willingness-to-pay are observed.
- [ ] Marketing claims do not exceed pilot evidence.

### Measure

- Upload-to-assignment time and administrative hours saved
- Start, completion and on-time completion
- Audit-pack corrections and acceptance
- Support incidents per 100 learners
- Pilot-to-paid conversion, renewal and seat expansion

**Deferred/permanent limits:** no automated hiring/ranking, no invasive biometric
proctoring, no universal compliance claim, and no premature active/active global
architecture.

### Usability hardening before Phase 4

- [x] Replace the phone-width desktop frame with a responsive workspace shell.
- [x] Reduce mobile navigation to five stable destinations and make creation the
  single emphasized action.
- [x] Replace the generic game-like/emoji-heavy visual language with a restrained,
  original document-workspace system.
- [x] Put the essential course-creation path before optional source and recipe
  controls.
- [x] Divide Space administration into Overview, People and Settings, with advanced
  assignment, team, bulk-invitation, security-policy and legal-hold controls behind
  progressive disclosure.
- [x] Preserve keyboard focus, semantic navigation, reduced motion and responsive
  reflow. Local browser QA does not close the independent accessibility gate.
- [x] Re-verify the redesign locally: 27/27 PostgreSQL-backed test files and
  136/136 tests pass, the production build completes, the production dependency
  audit reports zero vulnerabilities, and signed-in/signed-out browser checks at
  1440x900 and 390x844 show no horizontal overflow or console errors.
- [x] Make page navigations network-first with a cached offline fallback so a
  returning online user receives the current interface instead of one stale page.
- [x] Establish a distinctive premium BookQuest identity across the public story,
  authentication, workspace shell, creation flow, Spaces, course view, and Studio:
  editorial typography, a bespoke page mark, forest/paper/cobalt/acid palette,
  layered course sheets, and meaningful restrained motion.
- [x] Remove the signed-in home request loop discovered during visual QA so account
  and course data settle after the initial load instead of refetching continuously.
- [x] Rebuild Studio around one understandable authoring path: visible outline,
  lesson canvas, searchable block library, automatic saving, structured editors,
  reversible block actions, in-product source reading and section links, real
  learner preview, quality coaching, and a guided release desk.
- [x] Create, review and publish a realistic Blacksteel onboarding sample through
  the rebuilt Studio. Desktop, tablet-width and phone browser checks cover source
  reading, autosave, assessment editing, attestation, preview and publication;
  28/28 test files and 142/142 tests pass, the production build completes and the
  production dependency audit reports zero vulnerabilities.

The design principles and information architecture are recorded in
`docs/UX_FOUNDATION.md`. This work improves the existing Phase 0-3 experience and
does not start Phase 4. Dated local evidence is stored in
`docs/evidence/pre-phase4-usability-local-2026-07-13T154352Z.json` and
`docs/evidence/pre-phase4-premium-design-local-2026-07-13T163121Z.json`, with the
Studio rebuild recorded in
`docs/evidence/pre-phase4-studio-rebuild-local-2026-07-13T233800Z.json`.

---

## Phase 4 — Skill Passport and interoperability

**Engineering status:** Deployed

**External validation status:** Pending user acquisition

**External validation reason:** `Pending user acquisition and partner access`
**Outcome:** learners privately hold, selectively share and independently verify
evidence-backed achievements across systems.

The documented Phase 4 engineering scope is deployed. This does not mean it is
institutionally validated or certified. Partner and assessor proof remains open
in the external validation backlog and does not block productization.

### Build checklist

- [x] Create stable competency and taxonomy versions. Migration 16 adds
  Space-owned stable framework/item identities, immutable publication versions,
  CASE-shaped sourced identifiers, exact author-declared course-version mapping
  and claim-time alignment snapshots. Existing claims are never backfilled.
- [x] Generate claims from eligible versioned evidence. Migration 12 and
  `lib/skill-passport.ts` accept only the authenticated learner's active,
  unexpired credential when its completion decision and every repeated evidence
  binding reconcile; `tests/skill-passport.test.ts` covers cross-user denial and
  immutable exact-version links.
- [x] Show mastery, confidence, evidence volume, recency, sources and conditions.
  The private Passport and learner-selected verification response derive volume,
  recency, source categories and rule conditions from immutable completion
  evidence. Mastery is explicitly `not_assessed`; confidence means only that the
  exact evidence chain reconciles and has no numeric score.
- [x] Keep claims private by default and let learners choose what to share. The
  account-scoped `/passport` has no public handle or visibility switch, and each
  share freezes only learner-selected claim-version IDs. Display name disclosure
  is off by default.
- [x] Add expiring/revocable links and consent withdrawal. Opaque 256-bit bearer
  tokens are stored only as digests; terminal database transitions and live
  verification checks block future access after expiry, learner revocation,
  consent withdrawal, credential revocation or effective account erasure.
- [x] Add privacy-bounded recipient access history. Migration 13 records only a
  successful verification time, disclosed claim count and learner-controlled
  name-disclosure flag. It stores no recipient identity or fingerprint, is
  private to the learner, append-only until its 90-day purge deadline, removed
  by effective account erasure and never written for unavailable tokens.
- [x] Add private correction and dispute workflows. Migration 14 binds a
  learner's structured request to one exact claim version and issuing Space;
  only `assignments.manage` members can resolve it. Accepted correction requires
  a reconciled replacement credential for the same learner/course/Space and
  creates an immutable successor while old links stop verifying.
- [x] Add portable standards export workflows. Authenticated learners can
  download exactly one current claim through the versioned
  `bookquest-open-badges-3.0-jsonld-document-v1` profile. Identity is excluded by
  default, the complete evidence chain is frozen into the document and stale or
  cross-user claims fail uniformly. The UI and response explicitly distinguish
  this unsigned readable document from the separately signed VC-JWT workflow.
- [x] Import/export compatible assessments using QTI 3. The deliberately
  bounded `bookquest-qti-3.0-item-bank-v1` profile round-trips single-response
  choice, true/false and text-entry items. Imports are tenant-authorized,
  all-or-nothing and provenance-preserving; zip-bomb, path, active-XML,
  unsupported-interaction and duplicate-retry cases fail closed. This is not a
  claim of 1EdTech product certification or general QTI conformance.
- [x] Issue verifiable achievements using Open Badges 3.0. Migration 15 stores
  encrypted, rotatable Space-scoped RS256 keys, immutable learner-owned VC-JWTs,
  digest-only opaque status identifiers and append-only lifecycle evidence.
  Public verification enforces signature/profile/JWT-claim consistency and live
  evidence status; learner revocation, source credential revocation, supersession
  or erasure blocks future valid status. This is implementation evidence, not a
  claim of 1EdTech product certification.
- [x] Add a secure LTI 1.3 Resource Link foundation. The secure Resource
  Link launch foundation is implemented in forward-only migration 18: exact
  Space/course deployment registration, OIDC state/nonce, strict RS256/JWKS
  validation, one-time account-link tickets, pseudonymous one-to-one subject
  binding, live Space authorization, erasure and retention controls. Optional AGS
  grade passback, Deep Linking and NRPS expansion is demand-driven and remains in
  the external validation backlog; no LTI Advantage or certification claim is
  made.
- [x] Publish versioned APIs, scoped OAuth and signed idempotent webhooks.
  Migration 17 adds terminal Space-scoped API clients, digest-only one-hour
  opaque access tokens, encrypted webhook endpoints, immutable event IDs and a
  retry-safe delivery outbox. The `2026-07-14` API exposes only bounded course
  and assignment metadata under exact scopes. Webhook retries preserve the same
  event/idempotency identity and use a timestamped HMAC-SHA256 signature. Secrets
  are shown once and excluded from list/export responses.
- [x] Add a verification API for opaque IDs, expiry, revocation and only
  learner-granted claims. `/api/passport/verify` is rate-limited, no-store,
  no-index and returns the same 404 for unknown, expired, revoked,
  consent-withdrawn or evidence-invalid tokens.
- [x] Prohibit ranking, employability inference and hiring decisions. The first
  claim type is server-derived `verified_course_completion`; arbitrary or
  model-inferred competency statements, scores, recommendations and public
  learner profiles are absent from the schema and API.

### Early implementation evidence

- The prerequisite Phase 3 audit, Phase 4 domain model and internal threat model
  are recorded in `docs/PHASE_4_CONTRACT_AUDIT.md`,
  `docs/PHASE_4_SKILL_PASSPORT_MODEL.md` and `docs/PHASE_4_THREAT_MODEL.md`.
- Forward-only migration 12 adds learner-owned private passports, stable claims,
  immutable claim versions with direct course/rule/assignment/completion/
  participation/credential/evidence links, selective grants, frozen claim
  selections and append-only consent/status history. Terminal share guards reject
  reactivation and claim/history triggers reject update or deletion.
- The local PostgreSQL 16 suite passes 29/29 files and 152/152 tests, including
  negative authorization, token enumeration, unrelated-claim disclosure,
  boundary-time expiry, share revocation, consent withdrawal, credential
  revocation, export-secret exclusion and account-erasure withdrawal. TypeScript,
  the production build and the production dependency audit also pass;
  the audit reports zero vulnerabilities.
- Isolated browser QA created a second eligible sample claim, selected exactly one
  claim, issued a seven-day identity-hidden link, verified the version/evidence
  chain, withdrew consent and confirmed the same URL immediately returned the
  uniform not-found state. Revoked historical claims are visible only in the
  learner's private record and disabled for sharing. Checks at 390×844 and
  1440×900 found no horizontal overflow.
- Exact dated evidence is stored in
  `docs/evidence/phase4-skill-passport-local-2026-07-14T075827Z.json`.
- Forward-only migration 13 and the privacy-bounded verification-history
  contract are implemented in `lib/migrations.ts`, `lib/skill-passport.ts`,
  `lib/privacy.ts` and `docs/PHASE_4_ACCESS_HISTORY.md`. Verification and event
  insertion share one transaction and row-lock boundary with terminal share
  lifecycle changes; the public route adds a digest-derived per-share limiter
  without storing the bearer token.
- The local PostgreSQL 16 regression suite passes 29/29 files and 155/155 tests.
  It proves successful minimal logging, learner-only reads, uniform no-write
  behavior for guessed/expired/revoked/consent-withdrawn tokens, append-only
  enforcement, 90-day purge, export inclusion without secrets and immediate
  erasure deletion. TypeScript, the production build and dependency audit pass;
  browser checks at 390×844 and 1440×900 found no horizontal overflow or errors.
- Exact dated evidence for this slice is stored in
  `docs/evidence/phase4-access-history-local-2026-07-14T082225Z.json`.
- Forward-only migration 14, `docs/PHASE_4_CLAIM_CORRECTIONS.md` and the expanded
  threat model define the private dispute and immutable supersession contract.
  Learner free text is separately erasable; structured terminal history remains
  append-only. Claim creation, sharing and verification now consistently select
  only the latest version and serialize against accepted correction.
- The local PostgreSQL 16 suite passes 29/29 files and 158/158 tests, including
  learner ownership, auditor denial, terminal withdrawal/rejection, same-learner/
  course/Space replacement validation, old-link failure, immutable version-2
  evidence, private export and free-text erasure. TypeScript, production build
  and dependency audit pass with zero vulnerabilities.
- Browser QA submitted a private learner request, observed its open history and
  verified the issuing-Space manager queue, structured resolution choices and
  safely disabled acceptance when no replacement credential exists. Manager
  checks at 390×844 and 1440×900 found no horizontal overflow or browser errors.
- Exact dated evidence for this slice is stored in
  `docs/evidence/phase4-claim-corrections-local-2026-07-14T121534Z.json`.
- The portable-export slice adds an authenticated, private/no-store JSON-LD
  download for one current claim and validates every generated document against
  BookQuest's selected Open Badges 3.0 document profile. Negative tests cover
  ownership, unknown IDs, default identity exclusion and explicit name consent.
  The standards decision and deliberate unsigned boundary are recorded in
  `docs/PHASE_4_PORTABLE_EXPORT.md`.
- The resulting PostgreSQL 16 regression passes 29/29 files and 160/160 tests;
  TypeScript, the production build and dependency audit pass with zero reported
  vulnerabilities. Dated evidence is stored in
  `docs/evidence/phase4-portable-export-local-2026-07-14T130823Z.json`.
- The signed-issuance contract uses the Open Badges 3.0 VC-JWT Compact JWS format,
  the minimum interoperable RS256 algorithm, dereferenceable public-only JWKs,
  Space-authorized key rotation and opaque live status. Negative tests cover
  forgery, cross-user issuance/revocation, cross-role rotation, key/credential
  mutation, underlying evidence revocation and terminal lifecycle transitions.
  The exact contract is documented in `docs/PHASE_4_OPEN_BADGE_ISSUANCE.md`.
- The signed-issuance regression passes 29/29 PostgreSQL 16 test files and
  164/164 tests. It includes active-credential account-erasure revocation,
  terminal signed-credential lifecycle enforcement and encrypted issuer-key
  handling. TypeScript, the production build and dependency audit pass with zero
  reported vulnerabilities. Authenticated Passport browser QA confirmed the
  issuance and revocation controls at 390x844 and 1440x900 with no horizontal
  overflow or console errors. Exact dated evidence is stored in
  `docs/evidence/phase4-open-badge-issuance-local-2026-07-14T135204Z.json`.
- Migration 16 and `docs/PHASE_4_COMPETENCY_FRAMEWORKS.md` define stable
  Space-owned framework/item identity, immutable versions, exact author-declared
  course alignment and claim-time snapshots. CASE-shaped sourced identifiers are
  preserved for future exchange without claiming CASE conformance. Open Badges
  exports use only the alignment frozen into the claim.
- The competency/evidence regression passes 29/29 PostgreSQL 16 test files and
  166/166 tests. Negative coverage includes cross-role authoring/alignment,
  immutable publication rows, no retroactive claim backfill, exact account export
  and the absence of numeric mastery/confidence inference. TypeScript, production
  build and dependency audit pass with zero vulnerabilities. Browser QA exercised
  the owner Standards workspace and learner evidence summary at 390x844 and
  1440x900 without page-level horizontal overflow or console errors. Exact dated
  evidence is stored in
  `docs/evidence/phase4-competency-frameworks-local-2026-07-14T150730Z.json`.
- `docs/PHASE_4_QTI.md` defines the bounded QTI 3.0 Item Bank profile and its
  explicit non-conformance boundary. The PostgreSQL 16 regression passes 30/30
  files and 169/169 tests, including cross-tenant denial, traversal, active XML,
  archive limits, unsupported-interaction atomicity and duplicate-retry safety.
  TypeScript and the production build pass, and the dependency audit reports
  zero vulnerabilities. Studio browser QA exposed the import/export workflow at
  707x945 and 1440x900 with no page overflow or console errors. Exact dated
  evidence is stored in
  `docs/evidence/phase4-qti-local-2026-07-14T153631Z.json`.
- Forward-only migration 17 and `docs/PHASE_4_PLATFORM_INTEGRATIONS.md` add the
  `2026-07-14` read API, exact Space/scoped OAuth client credentials, encrypted
  webhook signing secrets and a retry-safe event outbox. The five focused tests
  prove secret non-disclosure, scope/tenant/expiry/revocation denial, independent
  HMAC verification and stable idempotency identity. Exact dated evidence is in
  `docs/evidence/phase4-platform-integrations-local-2026-07-14T163317Z.json`.
- Forward-only migration 18 and `docs/PHASE_4_LTI_FOUNDATION.md` implement the
  secure LTI 1.3 Resource Link launch boundary without claiming LTI Advantage
  completion. Six focused tests cover OIDC state/nonce, canonical RS256 JWT/JWKS
  validation, substitution/replay, live Space membership, one-to-one subject
  linking, export, erasure and revocation. The final PostgreSQL 16 regression is
  32/32 files and 180/180 tests; production build, generated-route typecheck and
  dependency audit pass with zero vulnerabilities. Browser QA at 707x945 and
  1440x900 found no horizontal overflow or console errors. Exact evidence is in
  `docs/evidence/phase4-lti-foundation-local-2026-07-14T163317Z.json`.
- This is deployed engineering evidence, not institutional validation or a
  standards-certification declaration.

### Release gates

- [x] Share one claim without exposing the full profile. The verifier receives
  only the frozen claim selection and omits learner identity by default.
- [x] Withdrawal, revocation or expiry blocks future verification immediately.
  Service, route and isolated browser tests cover the terminal paths.
- [x] Verification reproduces issuing evidence and rule versions. The response
  contains direct course, course-version, assignment-version, completion-rule,
  completion-decision, participation, credential and evidence-hash bindings.
- [x] Credential exports validate against their selected profile. Generated
  documents pass `bookquest-open-badges-3.0-jsonld-document-v1` before download;
  malformed documents fail closed. This is profile validation, not a claim of
  1EdTech certification or cryptographic issuer conformance.
- [x] API clients cannot enumerate learners or unrelated credentials. Tokens are
  random and digest-only, all unavailable states use the same 404, and selective
  disclosure tests prove another learner's claim never appears.
- [x] Corrections preserve historical auditability. The predecessor, successor,
  exact evidence chains, dispute lifecycle and authorized resolver remain
  linked; neither claim version can be edited or deleted.

### Measure

- Learner opt-in, sharing and successful verification
- Revoked/expired access attempts
- External import success and repeat API use
- Consent withdrawals and dispute resolution time

### External validation backlog

**Status:** Pending user acquisition

**Reason:** `Pending user acquisition and partner access`

- [ ] Validate Resource Link launches with a real named LMS.
- [ ] Implement and validate AGS score passback only when a real product use case
  and partner endpoint are available.
- [ ] Decide whether Deep Linking or NRPS is needed from observed demand.
- [ ] Complete external interoperability/conformance testing where commercially
  justified.
- [ ] Complete the independent security, accessibility and stakeholder validation
  listed in Phase 3 before making institutional-readiness claims.

---

## Phase 5 — Open ecosystem and sovereign deployment

**Engineering status:** Not started

**External validation status:** Not available yet

**Product decision:** architecture expansion is paused until public-launch
productization is understandable, usable and promotable.

**Outcome:** users can extend, move and deploy BookQuest without surrendering
control, while hosted editions remain commercially sustainable.

### Build checklist

- [ ] Publish course, recipe and Space export formats.
- [ ] Export owned sources, content, evidence and credentials.
- [ ] Import with validation, dry-run and conflict reporting.
- [ ] Publish stable APIs, webhook events and examples.
- [ ] Support configurable AI providers and AI-disabled approved content.
- [ ] Ship self-hosted deployment and upgrade guidance.
- [ ] Evaluate isolated/air-gapped use.
- [ ] Decide open-source/commercial licensing after legal review.
- [ ] Add free/paid template publishing, provenance, ratings and moderation.
- [ ] Preserve fork lineage so upstream changes cannot overwrite local work.
- [ ] Add payouts, refunds, tax and transaction reconciliation.
- [ ] Define reviewed plugin/integration permissions.
- [ ] Sandbox or prohibit executable extensions until isolation is proven.
- [ ] Define free community, hosted creator/team and enterprise editions.
- [ ] Keep export, accessibility and learner ownership outside lock-in paywalls.

### Release gates

- [ ] A full export restores into a clean compatible installation.
- [ ] Self-hosted upgrades preserve tenancy, content and evidence.
- [ ] One organization uses a non-default AI configuration.
- [ ] Moderation and abuse workflows exist before paid public submissions.
- [ ] Payout/refund ledgers reconcile with the provider.
- [ ] Extensions cannot access other Spaces by default.

### Measure

- Export/import and self-hosted upgrade success
- API, integration and non-default AI adoption
- Template publishing, forks, reuse and refunds
- Creator payout failures
- Percentage of users able to leave with usable data

---

## Phase 6 — Learning Genome and adaptation

**Engineering status:** Not started

**External validation status:** Not available yet

**Outcome:** eligible evidence improves questions, placement, explanations and
sequencing without overstating what the data proves.

### Build checklist

- [ ] Separate public, private, consented and research-eligible evidence.
- [ ] Define sample thresholds and data-quality alerts.
- [ ] Keep course-scoped concepts as historical truth.
- [ ] Add reversible, confidence-scored cross-course mappings with human review.
- [ ] Calculate interpretable difficulty and timing statistics.
- [ ] Flag ambiguity, poor discrimination and likely answer-key errors.
- [ ] Add human question review and retirement.
- [ ] Version explanation experiments and avoid causal claims from correlation.
- [ ] Add course placement with learner review/override.
- [ ] Infer prerequisite candidates with confidence and provenance.
- [ ] Feature-flag adaptive review and sequencing.
- [ ] Compare adaptive and fixed paths for learning and fairness.
- [ ] Consider formal item-response models only after sample gates are met.

### Release gates

- [ ] Only permissioned evidence enters cross-course analysis.
- [ ] Recommendations expose data version, confidence and sample limitations.
- [ ] Low-sample items cannot make high-confidence decisions.
- [ ] Humans can override mappings and retire questions.
- [ ] Adaptation does not reduce measured outcomes by accessibility, bandwidth or
  language cohort.
- [ ] Rebuilds reproduce published analytical versions.

### Measure

- Question-review precision and mastery calibration
- Placement time and unnecessary learning skipped
- Retention/completion versus fixed paths
- Controlled explanation learning gains
- Outcome differences across sufficiently represented cohorts

---

## Phase 7 — Multi-channel delivery and scale

**Engineering status:** Not started

**External validation status:** Not available yet

**Outcome:** learners start, continue and complete the same course through
appropriate channels without fragmented evidence or compromised privacy.

### Build checklist

- [ ] Define channel-neutral lessons/interactions and block fallbacks.
- [ ] Reuse answer, assignment, mastery and consent services across channels.
- [ ] Make inbound messages and webhooks idempotent.
- [ ] Keep phone/channel identities outside the learning ledger.
- [ ] Synchronize progress and cross-channel resume.
- [ ] Pilot one course and one assignment flow through messaging.
- [ ] Add explicit linking/opt-in, short cards, reminders, STOP and help.
- [ ] Use short-lived web links for sensitive or complex actions.
- [ ] Track delivery, replies, opt-outs, complaints, outcomes and cost.
- [ ] Add account-scoped offline course caching and visible pending evidence.
- [ ] Test downloadable packages, shared devices and low-end hardware.

### Release gates

- [ ] Cross-channel answers appear once in the same ledger.
- [ ] The wrong account cannot receive private course content.
- [ ] STOP/withdrawal prevents non-essential messages.
- [ ] Cross-channel resume preserves progress.
- [ ] Outcome differences are measured rather than assumed equivalent.
- [ ] Cost per completion meets pilot limits.

### Measure

- Linking, opt-in, delivery, reply, start and completion
- Cross-channel resume and outcome parity
- Opt-outs, complaints and wrong-recipient incidents
- Cost per completed learner
- Offline queue age and reconciliation

---

## Cross-phase release checklist

Apply this to every production release:

- [ ] Primary journeys work on mobile and desktop.
- [ ] Empty, loading, offline, failure and recovery states are understandable.
- [ ] New power features do not make personal learning harder.
- [ ] New resources have authentication and authorization tests.
- [ ] No personal identifier enters the learning ledger.
- [ ] Logs exclude secrets and unnecessary personal content.
- [ ] Rate limits, abuse, retention, export and deletion are considered.
- [ ] Historical learning stays linked to its experienced content version.
- [ ] Published/evidentiary records are never silently overwritten.
- [ ] Retry and offline behavior remains idempotent.
- [ ] Keyboard, screen-reader, long-translation and low-bandwidth behavior is tested.
- [ ] Monitoring, rollback and recovery impacts are understood.

---

## Idea Preservation Register

| Core idea | Planned home | Preservation rule |
|---|---|---|
| Private rooms for anyone | Phase 1 | Personal/private Spaces avoid organization-only assumptions |
| Public and community rooms | Phases 1, 5 | Public discovery never exposes private metadata |
| Different templates for every need | Phase 2 | Recipes are versioned, forkable and composable |
| Limitless unique creation | Phase 2 | Blocks + recipes + sources, not uncontrolled settings |
| Government/enterprise adoption | Phase 3 | Trust, auditability and accessibility precede claims |
| Freedom to use it differently | Phases 1, 2, 5 | Preserve export, APIs, self-hosting and provider choice |
| Compliance Training Engine | Phase 3 | First focused institutional commercial workflow |
| Skill Passport | Phase 4 | Private, learner-controlled and evidence-backed |
| Employer verification | Phase 4 | Read-only; no ranking or hiring decisions |
| Open learning ecosystem | Phase 5 | Portability and ownership precede marketplace lock-in |
| Creator marketplace/income | Phase 5 | Moderation, lineage, refunds and reconciliation required |
| Learning Genome | Phase 6 | No advanced models before representative evidence |
| Adaptive learning | Phase 6 | Explainable, feature-flagged and fairness evaluated |
| WhatsApp/chat learning | Phase 7 | A channel using the shared evidence engine |
| Low bandwidth/offline | Every phase | Never final-phase polish |
| Multiple languages | Phase 2 onward | Models and UI cannot assume one language |
| Bring-your-own AI/no-AI | Phase 5, designed in Phase 2 | Avoid provider-specific content contracts |
| On-premise/sovereign hosting | Phase 5 | Architecture stays deployable outside one vendor |

New idea intake:

```text
Idea:
User/problem served:
Why it matters:
Required foundation:
Proposed phase:
How success will be measured:
What should not be built yet:
```

---

## Decision log

| Date | Decision | Reason | Revisit trigger |
|---|---|---|---|
| 12 Jul 2026 | Evidence Ledger remains Phase 0 | History cannot be reconstructed later | Phase gates pass |
| 12 Jul 2026 | Spaces are the universal collaboration primitive | One model serves people, classes and institutions | Pilot finds an incompatible tenancy need |
| 12 Jul 2026 | Recipes + blocks replace unlimited independent settings | Composition gives freedom without chaos | Creator research finds a missing primitive |
| 12 Jul 2026 | Compliance is the first institutional pilot | Clear document-to-evidence buying journey | Partners reject the problem or model |
| 12 Jul 2026 | Learning Genome waits for representative evidence | Avoid confident decisions from weak samples | Data and validation thresholds pass |
| 12 Jul 2026 | Messaging is a channel, not another learning system | Preserves shared progress and evidence | A channel proves irreducibly different |
| 12 Jul 2026 | Versioned forward-only migrations with an idempotent baseline | Deterministic, once-only, transactional schema changes replace per-boot lazy DDL | A change needs non-transactional DDL (e.g. `CREATE INDEX CONCURRENTLY`) |
| 12 Jul 2026 | Automate logical restore proof but keep the PITR gate open | CI can continuously prove application-level recoverability; only a provider restore can prove Neon's recovery controls and measured RPO/RTO | Provider, plan or retention policy changes |
| 12 Jul 2026 | Pseudonymize immutable evidence during account erasure | Deleting identity must not rewrite proof or invalidate other learners' credentials | Legal review requires narrower retention or controlled redaction |
| 12 Jul 2026 | Use measured thresholds for IndexedDB and event partitioning | Complexity should respond to observed queue and database pressure, not guesses | Any documented threshold is crossed for two weeks |
| 12 Jul 2026 | Payment fulfillment is a row-locked entitlement transaction | Provider callbacks and redirects are replayable and may arrive concurrently | A second provider or multi-currency ledger changes the contract |
| 12 Jul 2026 | Internal generation fails closed in production | Missing configuration must not expose costly AI work publicly | Background execution moves to a provider-authenticated queue |
| 12 Jul 2026 | Platform admin is not a tenant role | Operating BookQuest must not silently grant access to private Space data | Audited break-glass support access is designed |
| 14 Jul 2026 | Separate engineering status from external validation | A solo builder can continue safe product work without inventing unavailable partner evidence | Real users or partners become available |
| 14 Jul 2026 | Productization precedes Phase 5 expansion | The existing capability must become understandable, usable and promotable before deeper architecture | Public activation and first-course completion show the core journey is clear |

---

## Immediate next actions

1. [x] Audit launch blockers, usability, growth and external validation separately
   (`docs/PUBLIC_LAUNCH_PRODUCTIZATION.md`).
2. [x] Ship the guided first-course slice: public positioning → registration →
   verification → document upload → editable Studio. Engineering status:
   **Deployed**. `tests/productization.test.ts` passes 3/3; the isolated PostgreSQL
   16 regression passes 33/33 files and 183/183 tests; typecheck, production build
   (49 static pages), dependency audit (zero vulnerabilities) and diff check pass.
   Local browser QA completed the synthetic registration/verification journey at
   390×844 with no horizontal overflow or console errors. Exact evidence:
   `docs/evidence/public-launch-first-course-local-2026-07-14T183333Z.json`.
   Commit `f88f016` passed GitHub PostgreSQL CI and the dependency audit, and its
   Vercel production deployment is Ready.
3. [x] Move QTI and platform integrations behind advanced/developer disclosure.
4. [x] Add clear public pricing and subscription UX. The page states the current
   30-day manual-renewal contract and one-time credit packs exactly.
5. [x] Add a strong anonymous public course page and one-tap sharing. Published-
   only lookup, anonymous source non-disclosure, native sharing and clipboard
   fallback are covered by `tests/public-product.test.ts` and
   `tests/productization.test.ts`.
6. [x] Improve the mobile learner journey with a thumb-safe, safe-area-aware
   action dock and additional content clearance.
7. [x] Add a clean full-book/document reading mode with authenticated access,
   contents, search, font controls and reading-position memory.
8. [x] Add opt-in creator profiles/libraries, privacy-minimal creator analytics,
   polished Blacksteel demo content and launch-quality empty states.

Items 4â€“8 engineering status: **Deployed**. Evidence: migration 19; account export
schema 8; `tests/public-product.test.ts` 4/4; `tests/productization.test.ts` 5/5;
full PostgreSQL 16 regression 34 files / 189 tests (the sole initial migration-
ledger expectation was updated and its 11/11 suite rerun); production build
(54 pages/routes) and dependency audit (zero high-severity vulnerabilities).
In-app browser QA verified `/pricing`, `/c/[slug]` and `/demo` at a narrow
viewport. Exact local evidence:
`docs/evidence/public-launch-productization-local-2026-07-14T210615Z.json`.
Commit `fd2fdd8` is live in the Vercel production deployment with status **Ready**;
the production `/pricing` semantic smoke check confirms all plans, manual-renewal
disclosure and public conversion actions render.

External validation stays in its backlog and must not be reintroduced into this
active build queue until the builder explicitly reports partner access.
