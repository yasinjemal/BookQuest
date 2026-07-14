# Phase 4 Skill Passport threat model

**Reviewed:** 14 July 2026
**Boundary:** the early private Passport and selective-share vertical slice.

| Threat | Required control | Verification |
|---|---|---|
| Guess or enumerate verification identifiers | 256-bit random bearer token; digest-only storage; uniform not-found result for every invalid state; rate-limited public route | Negative service and route tests |
| Read another learner's passport | Every authenticated mutation/read filters by `user_id`; Space and platform roles confer no access | Cross-user and manager denial tests |
| Attach another learner's credential or claim | Eligibility and share selection are joined to authenticated ownership inside one transaction | Cross-user credential/claim tests |
| Expose unrelated credentials | Frozen allowlist of selected claim-version IDs; verifier queries only that allowlist and returns no account identifiers | Selective-disclosure test |
| Continue access after consent withdrawal | Append consent-withdrawal event and terminal grant status; verifier checks both before returning claims | Consent-withdrawal test |
| Continue access after share or credential revocation | Terminal share transition plus live credential-status join on every verification | Revocation tests |
| Continue access after expiry | Verifier compares grant and credential expiry at request time | Boundary-time expiry tests |
| Rewrite issuing evidence or claim history | Existing Phase 3 append-only triggers plus Phase 4 append-only claim/event triggers; exact foreign keys and evidence hash | Direct SQL tamper tests |
| Infer unsupported competency | Only server-derived `verified_course_completion`; no free-form or model-generated competency assertion | Contract/unit tests and API schema |
| Leak identity by default | `include_learner_name` defaults false; never return email, user ID, learner key or membership | Response-shape tests |
| Re-enable a withdrawn/revoked share | Terminal database transition guard; no renew/reactivate API | Direct SQL lifecycle test |
| Cache disclosed claims | Verification API and page use `Cache-Control: no-store` and no indexing | Route/header test and page metadata |
| Turn access history into recipient surveillance | Store only successful timestamp, claim count and learner-controlled name-disclosure flag; prohibit IP, user-agent, referrer, device and recipient identity fields | Schema and private-read tests |
| Spam a learner's history through a closed or guessed link | Record only after full live verification; unknown, expired, revoked, withdrawn and evidence-invalid tokens append nothing; apply per-IP and per-share limits | Negative logging tests |
| Race verification against revocation | Verify and append under a shared row lock while lifecycle transitions take an exclusive lock | Transactional concurrency contract and revocation tests |
| Retain operational access records indefinitely | Set a 90-day deadline at write time and purge only expired rows through privacy maintenance | Retention test |
| Rewrite a disputed claim or infer a replacement | Never update a claim version; accept only a reconciled replacement credential for the same learner, course and issuing Space; derive the next statement server-side | Supersession and replacement-evidence tests |
| Resolve another tenant's dispute | Require `assignments.manage` in the dispute's exact issuing Space; platform role grants no tenant access | Wrong-role and wrong-evidence tests |
| Expose a learner's dispute publicly | Return disputes only in the learner's private Passport and authorized Space queue; public verification contains no dispute data | Private-read and response-shape tests |
| Keep sensitive learner dispute text after erasure | Store free text separately, reject updates and delete it on effective account erasure while retaining structured pseudonymous lifecycle evidence | Export, append-only and erasure tests |
| Keep sharing a corrected-but-wrong version | Verify and create shares only for the latest immutable claim version; never silently substitute a successor | Old-link and old-version denial tests |
| Export another learner's achievement | Require authenticated ownership of the exact current claim and return one uniform unavailable result | Cross-user, manager and unknown-ID export tests |
| Leak identity through a portable file | Use opaque URNs; omit learner name by default; never include email or numeric account ID | Default and explicit-name export tests |
| Present unsigned metadata as a verified issuer credential | Mark the readable JSON-LD export and response as unsigned; issue cryptographic credentials only through the distinct RS256 VC-JWT workflow | Response header, UI copy and signed-format tests |
| Export stale or revoked evidence | Reconcile the complete live credential/completion chain and require the latest claim version under shared locks at export time | Service eligibility and supersession tests |
| Forge or alter a signed badge | RS256 Compact JWS; strict JOSE allowlist; public key selected by dereferenceable `kid`; duplicate JWT claims must match the validated credential | Signature, tamper and claim-consistency tests |
| Leak issuer private keys | AES-256-GCM encryption at rest; public endpoint returns JWK without private parameters; key rows are immutable | Storage and public-key response tests |
| Rotate a key across tenants or invalidate old badges | Require `assignments.manage` in the exact Space; retire rather than delete; keep retired public keys dereferenceable | Cross-role rotation and old-badge verification tests |
| Enumerate learners through status | Opaque 256-bit status value stored as a digest; response contains status only; unknown values return a uniform 404 | Status-token and response-shape tests |
| Verify after revocation or erasure | Live underlying evidence/account checks plus shared verification locks and exclusive terminal revocation lock | Badge revocation, credential revocation and erasure tests |
| Rewrite a competency after claims exist | Stable framework/item identity with immutable publication versions and claim-time alignment snapshots | Version and direct-SQL tamper tests |
| Infer mastery from course completion | Report mastery as `not_assessed`; evidence confidence has no numeric score and describes reconciliation only | Passport and selected-share response tests |
| Align another tenant's course or framework | Require `assignments.manage`, same-Space framework ownership, attached course and exact existing course version | Cross-role and cross-Space negative tests |
| Substitute a newer competency during export | Build Passport shares and Open Badges alignment only from the item/framework versions frozen into the claim | Versioned alignment and export tests |
| Expand a malicious QTI zip before validating it | Inspect the central directory first; cap compressed, per-file and total expanded sizes, file count and item count; reject encryption and unsupported compression | Oversized archive tests |
| Read files through a QTI path or XML entity | Normalize and reject absolute, empty, duplicate and parent paths; prohibit DTD, entity and stylesheet declarations | Traversal and active-XML tests |
| Partially import a malformed bank | Parse every declared item before one tenant-authorized transaction writes; reject unsupported interactions rather than approximating them | Mixed-package atomicity test |
| Duplicate an item bank on client retry | Freeze the package SHA-256 in provenance and reject the same digest inside the draft transaction | Duplicate-import test |
| Import into or export from another tenant | Reuse exact-course Studio authorization and require `content.update` inside the import transaction | Cross-tenant import/export tests |

## Residual risks and production boundary

Bearer-link recipients can intentionally copy information they were allowed to
view; revocation prevents future BookQuest access but cannot erase an external
copy. The UI must say this plainly before sharing. Endpoint rate limiting reduces
online guessing but infrastructure-level abuse monitoring remains required.

This threat model is an internal design review, not the mandatory independent
penetration test. Phase 4 cannot be called production-ready until Phase 3's
Blacksteel pilot, independent penetration test, full-journey WCAG 2.2 AA
assessment, production evidence, restore exercise and stakeholder acceptance are
formally closed.
