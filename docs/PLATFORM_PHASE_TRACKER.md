# BookQuest Platform Phase Tracker

**Purpose:** the single execution tracker for growing BookQuest from a
document-to-course app into an open, trusted and configurable learning platform.  
**Status:** active living roadmap  
**Last updated:** 13 July 2026
**Current phase:** Phase 2 — Course Studio, blocks and reusable recipes
**Next product slice:** versioned Source Library and immutable course drafts

This tracker turns `PRODUCT_BLUEPRINT.md` into buildable phases. Every phase has
an outcome, checklist, release gates, measurements and explicit deferrals.

---

## How to maintain this tracker

- `[ ]` Not started
- `[x]` Implemented and verified
- **IN PROGRESS** Work is active
- **BLOCKED** A named dependency prevents progress
- **DEFERRED** Intentionally retained for a later phase

Only check an item after its implementation and relevant verification are
complete. A phase closes only when every mandatory release gate passes.

After each meaningful change:

1. Update its checklist item and name the proof: test, report, screen or decision.
2. Record material scope or architecture changes in the decision log.
3. Put new ideas in the Idea Preservation Register instead of silently expanding
   the active phase.
4. When a phase closes, record its date, release reference, gate results, metric
   changes, accepted limitations and post-release owner.

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

| Phase | Outcome | Status | Dependency |
|---|---|---|---|
| 0. Evidence and reliability | Activity is trustworthy, replay-safe and operable | **COMPLETE** | — |
| 1. Spaces and tenancy | Anyone can create a controlled learning space | **COMPLETE** | Phase 0 gates passed |
| 2. Course Studio and recipes | Creators can build, edit and reuse many course types | **COMPLETE** | Phase 1 permissions passed |
| 3. Institutional pilot | An organization completes an auditable training journey | **IN PROGRESS** | Phases 1–2 complete |
| 4. Credentials and interoperability | Evidence can be shared, verified and moved | Not started | Phase 3 evidence |
| 5. Open ecosystem | Templates, APIs and sovereign hosting expand safely | Not started | Stable contracts |
| 6. Learning Genome | Evidence improves questions and learning paths | Not started | Representative consented data |
| 7. Multi-channel and scale | Learning works across web, offline and messaging | Not started | Stable learning services |

A later phase can be researched early, but production work must not bypass gates
protecting tenancy, privacy, evidence or versioning.

---

## Phase 0 — Evidence and reliability foundation

**Status:** COMPLETE (12 July 2026 UTC)
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

**Status:** COMPLETE (12 July 2026 UTC)
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

**Status:** COMPLETE (13 July 2026 UTC)
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

## Phase 3 — Institutional and government-ready pilot

**Status:** IN PROGRESS
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
- [ ] Add MFA and pilot-driven OIDC/SAML; add SCIM when volume justifies it.
- [x] Add organization password, session, retention and legal-hold policies.
- [x] Document regional residency, continuity, recovery and incident response.
- [ ] Add dependency scanning, security reviews and an external penetration test.
- [x] Publish data-flow, subprocessor and security questionnaire material.
- [x] Add branding, bulk invitation and role-scoped dashboards.
- [ ] Complete full-journey WCAG 2.2 AA testing and publish an accessibility
  statement with remediation process.
- [ ] Recruit one to three document-heavy design partners.
- [ ] Measure their current manual process and agree success criteria in advance.
- [ ] Observe real admins/learners, record support needs and validate willingness
  to pay.

Local progress on open combined items: authenticator MFA and recovery codes are
complete, while OIDC/SAML awaits a partner provider and SCIM remains
volume-triggered. Dependency automation and internal security review are complete,
while the independent penetration test remains open. The accessibility statement
and remediation process are published; independent full-journey assistive-technology
testing remains open.

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
- This does not close Phase 3: production currently has no organization Space,
  completion, credential or audit-pack rows. A real partner journey, stakeholder
  audit-pack acceptance, live revocation proof, pilot-selected identity provider,
  independent penetration test and assistive-technology audit remain required.

### Release gates

- [ ] A partner completes the journey without manual database work.
- [ ] The responsible stakeholder accepts the audit pack for its stated purpose.
- [ ] Course, rule, assignment, attestation and certificate versions reconcile.
- [ ] Revoked credentials fail verification.
- [ ] Manager/auditor scopes pass cross-team access tests.
- [ ] Backup, restore and incident exercises are documented.
- [ ] Accessibility gaps are resolved or transparently planned.
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

---

## Phase 4 — Skill Passport and interoperability

**Outcome:** learners privately hold, selectively share and independently verify
evidence-backed achievements across systems.

### Build checklist

- [ ] Create stable competency and taxonomy versions.
- [ ] Generate claims from eligible versioned evidence.
- [ ] Show mastery, confidence, evidence volume, recency, sources and conditions.
- [ ] Keep claims private by default and let learners choose what to share.
- [ ] Add expiring/revocable links, access history and consent withdrawal.
- [ ] Add correction, dispute and portable export workflows.
- [ ] Import/export compatible assessments using QTI 3.
- [ ] Issue verifiable achievements using Open Badges 3.0.
- [ ] Add pilot-driven LTI 1.3/LTI Advantage integration.
- [ ] Publish versioned APIs, scoped OAuth and signed idempotent webhooks.
- [ ] Add a verification API for opaque IDs, expiry, revocation and only
  learner-granted claims.
- [ ] Prohibit ranking, employability inference and hiring decisions.

### Release gates

- [ ] Share one claim without exposing the full profile.
- [ ] Withdrawal, revocation or expiry blocks future verification immediately.
- [ ] Verification reproduces issuing evidence and rule versions.
- [ ] Credential exports validate against their selected profile.
- [ ] API clients cannot enumerate learners or unrelated credentials.
- [ ] Corrections preserve historical auditability.

### Measure

- Learner opt-in, sharing and successful verification
- Revoked/expired access attempts
- External import success and repeat API use
- Consent withdrawals and dispute resolution time

---

## Phase 5 — Open ecosystem and sovereign deployment

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

---

## Immediate next actions

Phase 0 closure proof:

| Proof | Result | Evidence |
|---|---|---|
| Provider PITR with measured recovery point/time | Passed | `docs/evidence/phase0-pitr-drill-2026-07-12T222519Z.json` |
| Production reliability baseline after recovery | Passed | `docs/evidence/phase0-reliability-closing-2026-07-12T223030Z.json` |
| Exact pushed state in CI and production | Passed | Commit `a4f0ba9`, GitHub Actions CI #6, Vercel production deployment |

1. [x] Assign owners and target dates to the remaining Phase 0 gates.
2. [x] Write the Space, membership, role and capability domain model.
   (`docs/PHASE_1_SPACE_MODEL.md`.)
3. [x] Map classrooms and global roles to Spaces.
   (Expand/backfill/verify/switch/contract mapping in the Phase 1 model.)
4. [x] Define the centralized authorization contract and threat model.
   (`lib/space-authorization.ts` deny-by-default capability contract.)
5. [x] Write cross-tenant tests before Space APIs.
   (`tests/space-authorization.test.ts` covers wrong-Space, inactive membership,
   role separation, lifecycle and public/unlisted boundaries; route/database
   variants remain paired with the gated migration.)
6. [x] Prototype personal, private and organization Space journeys.
   (`docs/SPACE_JOURNEY_PROTOTYPE.md` defines screens, states and measurable
   acceptance/usability tests without enabling gated APIs.)
7. [ ] Interview at least three compliance-pilot design partners.
8. [x] Define five starter recipes using real source documents.
   (`docs/STARTER_RECIPE_RESEARCH.md` grounds five versioned research recipes in
   the four uploaded financial-literacy, AI and architecture-review sources.)
9. [x] Establish baseline values for Phase 0 reliability metrics.
   (`npm run reliability:baseline` now produces the aggregate record without
   identities or samples; authenticated browser beacons now supply aggregate
   queue age/depth and replay-drain counts. Run it against production after
   migration/CI, then store the dated output. The first production run at
   `2026-07-12T21:46:46Z` is stored in
   `docs/evidence/phase0-reliability-baseline-2026-07-12T214646Z.json`; it is
   intentionally not accepted as the closing baseline because it exposed one
   stalled generation and 6,153 error events, including a 6,151-event recovery
   retry storm. The atomic recovery-lease remediation deployed successfully in
   commit `a4f0ba9`; CI #6 passed and the first post-deploy observation recorded
   zero new errors, but the existing course has not yet exercised recovery and
   remains stalled. Evidence is in
   `docs/evidence/phase0-reliability-postdeploy-2026-07-12T220851Z.json`.
   After protected recovery completed all 11 modules, the bounded deployment
   health window recorded zero errors/failures, no stalled generation and zero
   reconciliation drift while retaining the preceding 24-hour incident counts.
   Closing evidence:
   `docs/evidence/phase0-reliability-closing-2026-07-12T223030Z.json`.)

The first Phase 1 vertical slice should be:

> Create private Space → invite member → add existing course → authorize access →
> record Space context in evidence → revoke member → prove access stops.

This validates tenancy, permissions and evidence attribution before adding more
room types, custom roles or institutional administration.
