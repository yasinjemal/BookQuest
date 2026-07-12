# Phase 0 Threat Model and Security Review

**Review date:** 12 July 2026  
**Scope:** current BookQuest web application, authenticated API routes, learning
evidence, background generation, billing, browser offline delivery and account
privacy lifecycle.

This is the Phase 0 application review. It is not a substitute for the external
penetration test required before the institutional pilot in Phase 3.

## Assets and trust boundaries

Highest-value assets are account credentials and sessions, private source text,
course ownership, payment entitlements, immutable answer evidence, learner
identity mappings, progress/credentials and internal AI-generation capacity.

Trust boundaries:

1. browser input to authenticated Next.js routes;
2. public verification/payment redirects to server routes;
3. server routes to PostgreSQL;
4. BookQuest to Anthropic, Resend and Flutterwave;
5. background generation self-calls; and
6. browser local storage/service-worker cache across sign-ins on a shared device.

The browser, URL IDs, join codes, provider redirects and delayed workers are
untrusted. PostgreSQL constraints and server-derived sessions are authoritative.

## Route review

Every `app/api/**/route.ts` was classified by authentication and authorization:

- Account, course, lesson, practice, review, class, billing-checkout and admin
  routes require a valid server session. Admin and ownership checks occur before
  protected reads/writes.
- Public authentication routes are rate-limited and use one-time hashed tokens.
- The Flutterwave redirect is public but grants nothing from redirect parameters;
  it retrieves the transaction from PostgreSQL and verifies status, reference,
  amount and currency through Flutterwave before fulfillment.
- Certificate verification is intentionally link-public. Its current bearer-link
  disclosure of learner name and score is a documented moderate privacy
  limitation to replace with selective disclosure/revocation in Phase 3/4.
- Internal generation requires a run-scoped token and generation secret. Missing
  `GENERATION_SECRET` now fails closed in production.
- Explore requires authentication in the current product even though it lists
  published content; Phase 1 will separate public discovery policy explicitly.

## Threats, controls and proof

| Threat | Control | Proof |
|---|---|---|
| Client forges correctness/question/course/learner | Answer payload accepts only answer telemetry and saved session selectors; card, learner, course and grading are server-derived | `tests/answer-route-security.test.ts` |
| Session or question crosses users/courses | Lesson, practice and review sessions query by authenticated user and saved item identity | Adversarial route tests for all three sources |
| Replay inflates mastery, XP or progress | Event/semantic uniqueness, append-only triggers, transactional projections and per-completion advisory lock | Ledger tests plus simultaneous HTTP completion test |
| Payment callback grants twice | Transaction/user rows locked; status transition and entitlement grant commit together; failure only changes pending rows | `tests/billing-integrity.test.ts` |
| Stale AI worker overwrites retry | Run identity on claims, modules, lessons, metadata and chaining | Generation-run tests |
| Public triggers costly generation | Production fails closed without secret; run ID and rate limit required | `verifyGenerationSecret`, internal route checks |
| Brute-force auth, join codes, AI, answers or exports | Distributed keyed-hash fixed-window limits by account/network/resource | Route policies and rate-limit tests |
| Shared-device cache leaks account API data | All authenticated APIs are network-only; answer/completion queues are account-scoped | Service worker and outbox tests |
| Class learner reads peers' evidence | Only teacher receives member evidence/weak concepts; learner response contains own row | Class route authorization branch |
| Account deletion destroys audit history or leaves PII | 30-day cancellation, irreversible identity tombstone, source deletion, pseudonymous immutable evidence and append-only action history | Privacy lifecycle integration tests |
| Clickjacking, MIME confusion or excess browser capability | Secure production cookie plus DENY/nosniff/referrer/permissions headers | `lib/auth.ts`, `next.config.ts` |

## Findings resolved in this review

1. **High — concurrent payment fulfillment:** fixed with row-locked atomic
   fulfillment and a concurrent integration test.
2. **High — production generation open when secret missing:** fixed by failing
   closed in production.
3. **High — learners could receive every class member's progress:** fixed by
   returning only the authenticated learner's evidence to non-owners.
4. **Medium — simultaneous lesson completion crossed the final idempotency
   check:** fixed with a session-scoped advisory lock around the complete
   evidence-to-credential workflow.
5. **Medium — class-code and checkout abuse lacked dedicated limits:** fixed with
   account/network rate limits.
6. **Defense in depth — session cookie/security headers:** production cookie now
   uses `Secure`; frame, MIME, referrer and browser-capability headers added.

## Known non-high limitations

- `npm audit` reports two moderate advisories in Next's bundled PostCSS. The
  available automated fix incorrectly proposes a breaking downgrade; track the
  framework release that updates the transitive dependency and retest.
- Certificate links currently reveal learner name, course, score and issue date
  to anyone holding a random 64-bit URL ID. Do not use them for sensitive
  institutional credentials before Phase 3/4 selective disclosure and revocation.
- SameSite=Lax cookies provide baseline cross-site request protection. Add a
  shared Origin/CSRF policy before enabling organization custom domains or
  accepting untrusted same-site subdomains.
- Classroom join codes are bearer secrets in the legacy model. Dedicated limits
  reduce guessing; Phase 1 replaces them with policy-controlled, expiring and
  revocable invitations for higher-trust Spaces.
- No external penetration test has been performed. It remains a Phase 3 gate.

No known critical or high-severity issue remains open in this reviewed Phase 0
scope. New resource families must receive equivalent negative authorization and
concurrency tests before release.
