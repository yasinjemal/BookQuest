# Phase 3 institutional evidence architecture

Last updated: 2026-07-13

## Proven local slice

The institutional evidence model is anchored to immutable versions:

`Space -> course version -> completion-rule version -> assignment version -> participation attempt -> evidence events -> completion event -> credential lifecycle`

Migration 6 creates versioned completion rules and assignments, audience snapshots,
participation attempts, scheduled deliveries, attestations, assignment-scoped lesson
completion, practical submissions and reviews, completion decisions, credentials,
credential status events and audit-pack manifests. Evidence tables reject updates and
deletes. Projection rows may change status, but every consequential transition also
appends an event.

The older Space assignment service now creates the same default rule, assignment
version, audience, participation and event records. It no longer creates assignments
that bypass the institutional evidence chain.

## Completion and credential decisions

Completion evaluation locks the learner participation and evaluates only the exact
assigned course version and published rule version. It records:

- the latest immutable completion for every required lesson key;
- the latest exact-statement attestation for every required block lineage;
- the latest submission and manager review for every required practical lineage;
- the aggregate score and threshold decision;
- the evidence IDs and a canonical SHA-256 evidence hash.

A satisfied decision changes the participation projection once and may issue one
credential. Credentials have a non-enumerable verification token, a separate display
code, configured expiry and append-only issue/renew/revoke/expire status events.
Public verification is rate limited and the display code alone cannot retrieve learner
data. Revocation is reflected immediately.

## Assignment operations

Assignments can target individual memberships, teams or all current learners in a
Space, with start, due and expiry dates. Attempt limits are enforced during
reassignment. Reminders and escalations are scheduled per attempt, claimed with
`FOR UPDATE SKIP LOCKED`, sent with idempotency keys and cancelled when the attempt is
revoked or exempted. Space membership removal appends audience and participation
events before access is removed.

## Audit pack

Authorized owners, administrators, managers and read-only auditors can generate a
CSV and readable PDF for one immutable assignment version. The pack contains report
scope, course/rule/assignment versions, attempts, evidence counts and IDs, scores,
credential expiry/revocation, generation time, report-format version and manifest /
artifact hashes. The PDF states its interpretation limits and makes no universal
compliance claim.

The visually inspected local sample is:

- `output/pdf/phase3-audit-pack-sample.pdf`
- `output/pdf/phase3-audit-pack-sample.csv`

## Governed pilot closure

Migration 8 adds a tenant-scoped pilot control record rather than treating a
spreadsheet or launch decision as evidence. The pilot plan versions the partner's
manual-process baseline, agreed success criteria, identity-provider requirement and
SCIM decision. Observations store only a pilot-scoped hash of an opaque participant
code and append the observed admin/learner journey, time, support needs and whether
manual database work was required.

Gate decisions append the signed-in account, current Space role, outcome, summary,
evidence link or SHA-256 artifact hash, transparent remediation actions and optional
audit-pack/credential references. References are constrained to the same Space.
Plans, observations, decisions and status events reject update or deletion.

The product will not mark a pilot complete unless it finds:

- admin and learner observations completed without manual database work;
- a real completed assignment participation with zero version-binding failures;
- the exact accepted generated audit pack;
- the exact live-revoked credential and its revocation event;
- a selected sign-in method and its accepted test decision; password pilots use
  BookQuest's verified email/password and MFA controls, while OIDC/SAML pilots
  additionally require a matching active organization connection;
- accepted baseline, criteria, journey, penetration, incident/restore, marketing
  and willingness-to-pay decisions;
- an accepted accessibility audit or an accepted-with-actions decision that names
  its transparent remediation work.

This makes the remaining external gates executable and auditable; it does not turn
self-entered test data into partner or independent-assessor proof.

## Verification

- TypeScript: pass
- PostgreSQL integration: 136 tests in 27 files pass sequentially, including the
  institutional assignment, governed pilot refusal/completion, security-policy,
  MFA and migration-upgrade checks
- Production build: pass
- PDF visual QA: four rendered pages inspected; clipping and page-label alignment
  corrected

## Still required before Phase 3 can close

- a tested pilot-selected sign-in method. Blacksteel selected BookQuest
  email/password, so it does not require an external identity-provider connection;
  OIDC/SAML and SCIM remain demand-driven for partners that select them;
- external penetration test and updated institutional review;
- independent full-journey WCAG 2.2 AA assistive-technology audit;
- one to three real design partners, an observed no-database journey and named
  stakeholder acceptance of the pack.

## Institutional security controls added after the core slice

Migration 7 adds encrypted authenticator-TOTP MFA, one-time recovery codes and
single-use login challenges. Voluntary MFA is enforced on every later password
login. Organization policy publication can require MFA by role, but fails until
every affected member has enrolled, preventing lockout. Session lifetime uses the
strictest active organization policy and policy publication revokes existing member
sessions. Password reset enforces the strictest organization minimum length.

Organization policy versions also record retention and legal-hold settings. Active
legal holds can be scoped to a Space, assignment or membership, require reasons for
creation and release, and block Space deletion scheduling. Draft OIDC/SAML provider
configuration is represented, but activation remains pilot-driven and is not claimed
complete without a selected partner identity provider.

The Space interface now exposes controlled assignment creation, versioned rule
thresholds, team/member/whole-Space audiences, date and attempt policies, bulk
invitations, branding, role-scoped completion metrics and one-click PDF/CSV audit
downloads. The public credential-verification screen accepts only the private token.
`docs/INSTITUTIONAL_SECURITY.md` records data flow, current subprocessors, regional
limitations, recovery/incident procedures and factual security-questionnaire answers.
The same bounded claims are exposed in the product at `/security`, with the honest
accessibility status and remediation process at `/accessibility`.
