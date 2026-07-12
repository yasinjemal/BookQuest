# BookQuest Platform Phase Tracker

**Purpose:** the single execution tracker for growing BookQuest from a
document-to-course app into an open, trusted and configurable learning platform.  
**Status:** active living roadmap  
**Last updated:** 12 July 2026  
**Current phase:** Phase 0 — Evidence and reliability foundation  
**Next product slice:** Phase 1 — Spaces, tenancy and permissions

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
| 0. Evidence and reliability | Activity is trustworthy, replay-safe and operable | **IN PROGRESS** | — |
| 1. Spaces and tenancy | Anyone can create a controlled learning space | Not started | Phase 0 gates |
| 2. Course Studio and recipes | Creators can build, edit and reuse many course types | Not started | Phase 1 permissions |
| 3. Institutional pilot | An organization completes an auditable training journey | Not started | Phases 1–2 |
| 4. Credentials and interoperability | Evidence can be shared, verified and moved | Not started | Phase 3 evidence |
| 5. Open ecosystem | Templates, APIs and sovereign hosting expand safely | Not started | Stable contracts |
| 6. Learning Genome | Evidence improves questions and learning paths | Not started | Representative consented data |
| 7. Multi-channel and scale | Learning works across web, offline and messaging | Not started | Stable learning services |

A later phase can be researched early, but production work must not bypass gates
protecting tenancy, privacy, evidence or versioning.

---

## Phase 0 — Evidence and reliability foundation

**Status:** IN PROGRESS  
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
- [ ] Test backups and point-in-time recovery.
  (Logical backup restoration is automated in CI by
  `scripts/backup-restore-drill.mjs`: it restores a snapshot-consistent dump to a
  guarded disposable database and verifies tables, rows and schema objects.
  Neon provider-level PITR restoration and recorded RPO/RTO remain required.)
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
  migrations matched. Provider-level Neon PITR remains a separate open item.)
- [ ] Type checking, tests and production build pass in CI.
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

**Outcome:** individuals, groups, schools, companies and departments use one
Space model while retaining distinct privacy and access rules.

### Build checklist

- [ ] Create an automatic personal Space for every account.
- [ ] Support personal, private, unlisted, organization and public Space types.
- [ ] Separate discovery, visibility, joining and content-sharing policies.
- [ ] Add active, suspended, archived and deletion-scheduled states.
- [ ] Add profile, branding, language, timezone and optional child Spaces.
- [ ] Migrate classrooms without losing members, courses or progress.
- [ ] Keep “class” as a simple Space preset.
- [ ] Add invited, active, suspended, removed and expired memberships.
- [ ] Add owner, administrator, creator, reviewer, manager, learner and auditor.
- [ ] Store roles per Space instead of relying on one global role.
- [ ] Centralize authorization for every protected route.
- [ ] Later allow custom roles as bundles of approved capabilities.
- [ ] Add teams/groups and secure expiring, revocable invitations.
- [ ] Keep join codes only where a Space policy explicitly allows them.
- [ ] Audit membership and permission changes immutably.
- [ ] Associate sources, courses, templates, assignments and reports with a Space.
- [ ] Derive Space, assignment and enrollment evidence context on the server.
- [ ] Define ownership and move/copy rules for personal and organization content.
- [ ] Add cross-Space tests for every resource family, storage key, cache and job.
- [ ] Add safe tenant export, archive and deletion workflows.

### Privacy modes

| Mode | Discovery | Entry | Default content access |
|---|---|---|---|
| Personal | Owner only | Owner | Owner only |
| Private | Hidden | Invitation/approval | Members by role |
| Unlisted | Not searchable | Controlled link/code | Approved participants |
| Organization | Policy controlled | Managed membership | Role/team scoped |
| Public | Searchable | Open or moderated | Published content only |

### Release gates

- [ ] Accounts and classrooms migrate without losing content or progress.
- [ ] Every protected resource has a Space owner and policy.
- [ ] Tests prove users cannot read or change another private Space.
- [ ] Revoked or expired invitations cannot be reused.
- [ ] Role changes take effect immediately and are audited.
- [ ] Public, unlisted and private metadata behave differently as documented.
- [ ] Evidence uses server-derived Space and assignment context.
- [ ] Personal learning remains simple after Spaces are introduced.

### Measure

- Space creation and invitation completion
- Time to create a class/private group
- Authorization denials and suspicious access
- Cross-tenant coverage and incidents (target: zero)
- Classroom migration success

**Deferred:** custom domains, SSO/SCIM and data residency → Phase 3; template
marketplace → Phase 5; cross-installation federation → future evaluation.

---

## Phase 2 — Course Studio, blocks and reusable recipes

**Outcome:** creators can generate, manually build, review, customize and reuse
unique learning experiences with source traceability.

### Source Library and lifecycle

- [ ] Store versioned, Space-owned source records.
- [ ] Retain PDF, DOCX, Markdown and text support.
- [ ] Add PowerPoint, webpage, transcript and manual sources.
- [ ] Combine multiple sources into a controlled collection.
- [ ] Record extraction, source and processing provenance.
- [ ] Add source-level permissions, replacement and retention rules.
- [ ] Show source coverage and unsupported claims during review.
- [ ] Add draft, review, approved, published, superseded and archived states.
- [ ] Make published course versions immutable.
- [ ] Branch new drafts from published versions and show version differences.
- [ ] Preserve evidence against the version each learner experienced.
- [ ] Add comments, requested changes, approval history and safe rollback.

### Composable blocks

- [ ] Create stable, versioned block identities and a block registry.
- [ ] Support explanation, image, audio/video, story and worked example.
- [ ] Support flashcard, multiple choice, true/false and fill-in.
- [ ] Support scenario, practical task, discussion, survey and attestation.
- [ ] Define offline/channel compatibility and fallbacks per block.
- [ ] Validate accessibility metadata per block.
- [ ] Design a safe future extension contract.

### Recipes and templates

- [ ] Define a versioned recipe separate from generated content.
- [ ] Capture audience, objectives, difficulty, duration and lesson size.
- [ ] Capture teaching style, tone, language and reading level.
- [ ] Capture assessment mix, pass rule, credential and expiry behavior.
- [ ] Capture delivery and accessibility preferences.
- [ ] Allow private, Space-shared, unlisted and public recipes.
- [ ] Allow forking while preserving lineage and version.
- [ ] Ship starter recipes for onboarding, compliance, school subjects, exam prep,
  certification, public awareness, safety, product training, micro-courses and
  scenario simulations.

### Studio experience

- [ ] Separate Learn, Create, Manage and Discover contexts.
- [ ] Edit the outline before full generation.
- [ ] Edit and reorder lesson blocks.
- [ ] Regenerate only a selected block, lesson or module.
- [ ] Preserve manual edits outside regeneration scope.
- [ ] Preview mobile, desktop and offline experiences.
- [ ] Show estimated duration, accessibility and source-coverage checks.
- [ ] Make AI optional in every creation path.

### Release gates

- [ ] Create a course from one source, multiple sources or a blank draft.
- [ ] Every generated lesson is editable before publishing.
- [ ] Published versions cannot be silently changed.
- [ ] Published assessments resolve to immutable question versions.
- [ ] Reviewers can trace important material back to sources.
- [ ] Recipes can be saved, forked and reused without learner data.
- [ ] Manual edits survive unrelated regeneration.
- [ ] Starter recipes pass accessibility, mobile and offline checks.

### Measure

- Time from upload to draft and draft to publication
- Generated blocks edited/rejected and unsupported-claim rate
- Recipe reuse/fork rate and creator abandonment
- Accessibility issues caught before publication

**Deferred:** paid template marketplace and executable extensions → Phase 5;
automatic legal-compliance claims → permanent non-goal; adaptation → Phase 6.

---

## Phase 3 — Institutional and government-ready pilot

**Outcome:** a real organization completes this controlled journey:

> Private Space → controlled source → compliance recipe → review and approval →
> immutable publication → learner assignment → evidence → completion rule →
> accepted audit pack.

### Build checklist

- [ ] Assign individuals, teams or a Space with start/due dates and expiry.
- [ ] Add reminders, escalations, reassignment and attempt policies.
- [ ] Add versioned completion rules, thresholds and attestations.
- [ ] Add manager-approved practical tasks where needed.
- [ ] Preserve assignment history through membership and version changes.
- [ ] Link completion to assignment, course version and evidence IDs.
- [ ] Issue expiring, revocable, evidence-linked certificates.
- [ ] Add privacy-preserving certificate verification.
- [ ] Export completion data as CSV and a readable PDF audit pack.
- [ ] Include report scope, rule versions, attempts, attestations, revocations,
  generator time and report-format version.
- [ ] Give auditors read-only evidence/report access.
- [ ] Add MFA and pilot-driven OIDC/SAML; add SCIM when volume justifies it.
- [ ] Add organization password, session, retention and legal-hold policies.
- [ ] Document regional residency, continuity, recovery and incident response.
- [ ] Add dependency scanning, security reviews and an external penetration test.
- [ ] Publish data-flow, subprocessor and security questionnaire material.
- [ ] Add branding, bulk invitation and role-scoped dashboards.
- [ ] Complete full-journey WCAG 2.2 AA testing and publish an accessibility
  statement with remediation process.
- [ ] Recruit one to three document-heavy design partners.
- [ ] Measure their current manual process and agree success criteria in advance.
- [ ] Observe real admins/learners, record support needs and validate willingness
  to pay.

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

Phase 0 closure ownership:

| Remaining proof | Owner role | Target |
|---|---|---|
| Restore a historical production timestamp to a temporary Neon branch; record RPO/RTO | Deployment operator with Neon console/API access | 13 July 2026 |
| Commit/push this slice and confirm the GitHub Actions run is green | Repository maintainer with GitHub write access | Next controlled push, no later than 13 July 2026 |

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
9. [ ] Establish baseline values for Phase 0 reliability metrics.
   (`npm run reliability:baseline` now produces the aggregate record without
   identities or samples; authenticated browser beacons now supply aggregate
   queue age/depth and replay-drain counts. Run it against production after
   migration/CI, then store the dated output.)

The first Phase 1 vertical slice should be:

> Create private Space → invite member → add existing course → authorize access →
> record Space context in evidence → revoke member → prove access stops.

This validates tenancy, permissions and evidence attribution before adding more
room types, custom roles or institutional administration.
