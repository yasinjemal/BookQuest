# Phase 4 LTI 1.3 launch foundation

**Implemented:** 14 July 2026
**Status:** secure core implemented; pilot integration and LTI Advantage services
remain open.

BookQuest acts as an LTI 1.3 tool for a deliberately bounded Resource Link
launch. The implementation follows the 1EdTech LTI Core 1.3 and Security
Framework OIDC/JWT validation model. It is not a claim of LTI or LTI Advantage
certification.

## Deployment registration

A Space owner or administrator binds one LMS issuer, client ID and deployment ID
to one course already attached to that Space. The registration also stores the
platform authorization endpoint, token endpoint and JWKS URL. All URLs must be
public HTTPS hostnames; issuer comparison is exact and case-sensitive.

The BookQuest registration values for an LMS are:

- OIDC initiation URL: `/api/lti/oidc/login`
- Resource-link launch/redirect URL: `/api/lti/launch`
- LTI version: 1.3
- Launch message: `LtiResourceLinkRequest`

Registration revocation is terminal and immediately blocks initiation, launch
and unconsumed tickets.

## OIDC initiation and launch

The initiation route accepts GET or form POST, selects exactly one active
registration, requires the target to be BookQuest's own launch route, creates
256-bit state and nonce values and stores only their SHA-256 digests for ten
minutes. It redirects with `scope=openid`, `response_type=id_token`,
`response_mode=form_post`, the exact registered client and redirect URI, and the
opaque platform hints unchanged.

The launch route accepts only RS256 and a registered platform key selected by
`kid`. JWKS retrieval uses public HTTPS, no redirects, a five-second timeout and
a 256 KB response limit. Validation fails closed for:

- signature, key, algorithm or JOSE-header substitution;
- issuer, audience or authorized-party mismatch;
- expiry, issue-time or nonce mismatch;
- replayed/expired state;
- wrong LTI version, message type, deployment or exact target URI;
- missing/invalid subject, Resource Link ID, context or roles;
- malformed AGS endpoint claims.

State is consumed atomically only after cryptographic and claim validation. A
successful POST becomes a 303 redirect containing a different one-time 256-bit
ticket. The raw LMS subject is never stored; BookQuest retains a keyed digest
scoped to the registration.

## Account and authorization boundary

An LTI launch never creates an account, accepts LMS terms for a person, grants a
BookQuest role or treats an LMS role as authorization. The learner signs in to
an existing BookQuest account and must already have `learning.participate` in
the exact Space. The first valid launch binds the pseudonymous LMS subject to
that account. A subject and a BookQuest account are each one-to-one within the
registration; a second account cannot claim the link.

The ticket is consumed once and redirects to the configured course. Login now
preserves a validated same-origin `next` path, including MFA completion, so the
one-time launch can resume safely.

## LTI Advantage boundary

BookQuest validates and retains the AGS score scope and line-item URL offered in
a launch, but it does not yet request an LMS service token or post a score. Deep
Linking, Names and Role Provisioning, Assignment and Grade Services passback,
dynamic registration and iframe/cookie fallback are deliberately disabled.

Those features must be chosen from evidence produced by a named LMS pilot. At
minimum, grade passback requires a BookQuest tool signing key, the Security
Framework JWT client assertion, an exact requested AGS score scope, and an
idempotent completion-to-score delivery contract. No tracker item may call the
LTI Advantage integration complete before that real endpoint and acceptance
evidence exist.

## Privacy and retention

Account export schema 7 includes the learner's pseudonymous LTI link and
registration identifiers. Effective erasure removes that link and consumed
launch tickets. Expired login states and tickets are purged after a one-day
diagnostic window. Registration configuration is included in Space export
schema 2 without authentication or signing secrets.

## Verification

The PostgreSQL integration suite covers wrong-tenant registration, unsafe URLs,
duplicate deployment, exact initiation parameters, forged signature, claim
substitution, replay, missing Space membership, second-account takeover, keyed
subject storage, account export, erasure and terminal registration revocation.
These are local implementation checks; a production LMS conformance test and
the mandatory Phase 3 external gates remain open.
