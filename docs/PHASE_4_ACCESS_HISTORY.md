# Phase 4 privacy-bounded verification history

**Decision date:** 14 July 2026

## Purpose

Learners need to know whether an active selective-share link has been used. That
does not justify identifying or fingerprinting the recipient. The access-history
contract therefore records only a successful BookQuest verification of a known,
currently valid share.

Each retained event contains:

- the internal share ID;
- the number of claim versions disclosed;
- whether the learner explicitly chose to disclose their display name;
- the verification time; and
- the automatic retention deadline.

It never stores an IP address or IP digest, user agent, referrer, device,
location, cookie, recipient account, email address or inferred identity. The
learner sees “private link opened,” not a claim that a particular person viewed
or understood the information.

## Authorization and enumeration

Access history is returned only inside the authenticated learner's private
Passport read model. Space owners, credential issuers, auditors and platform
administrators receive no implicit access. There is no public history endpoint.

Unknown, malformed, expired, revoked, consent-withdrawn or evidence-invalid
tokens create no history event. This prevents an unavailable link from becoming
a write primitive against the learner's log and preserves the uniform public
not-found response.

## Retention and integrity

Successful events are append-only during their 90-day retention window. Updates
are rejected. The privacy-maintenance job may physically delete events only after
their `retain_until` deadline; this operational history is deliberately not part
of the permanent credential/evidence ledger. Effective account erasure removes
the learner's retained access history immediately, even when 90 days have not
elapsed.

Public verification is serialized with share lifecycle changes. A verification
that acquired its read lock before a revocation may complete and be recorded;
once revocation or consent withdrawal commits, later verification cannot return
the disclosure or append an access event.

The public route has both per-IP and digest-derived per-share limits. Raw bearer
tokens are never written to rate-limit or access-history storage.

## Explicit boundary

This slice does not implement recipient identity, notifications, analytics,
tracking pixels, access approval, public profiles, correction/dispute resolution
or portable standards export. Phase 4 remains early implementation and Phase 3
closure gates remain unchanged.
