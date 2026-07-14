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
