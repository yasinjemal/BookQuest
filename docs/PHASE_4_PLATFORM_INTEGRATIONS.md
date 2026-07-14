# Phase 4 platform integrations

**Implemented:** 14 July 2026
**API version:** `2026-07-14`

This slice publishes a small read-only machine API, OAuth 2.0 client-credentials
access and signed outbound webhooks. It follows the client-credentials pattern
in RFC 6749 and JWT/webhook design guidance without claiming conformance or
certification beyond the documented BookQuest contract.

## Administrator workflow

Space owners and administrators open **Settings → OAuth clients & signed
webhooks**. The exact `space.manage_policy` capability is checked again in each
transaction. A client secret or webhook signing secret is returned once and is
never available through a list or export response.

Client and endpoint revocation is permanent. Revoking a client also revokes all
of its unexpired access tokens. Archived, suspended or deletion-scheduled Spaces
cannot use machine tokens.

## OAuth client credentials

`POST /api/oauth/token` accepts `application/x-www-form-urlencoded` with
`grant_type=client_credentials` and HTTP Basic client authentication. An
optional space-separated `scope` must be a subset of the client's grant.
Successful responses return an opaque bearer token for 3,600 seconds. Only a
SHA-256 digest of the high-entropy token is retained.

Supported scopes:

- `courses.read`
- `assignments.read`

Token and API responses are no-store. Token requests are limited per IP and
client; API reads are limited per client. Invalid, expired and revoked tokens
return a Bearer challenge, while a wrong Space or missing scope returns
`insufficient_scope` without tenant data.

## Versioned API

- `GET /api/v1/spaces/{spaceId}/courses`
- `GET /api/v1/spaces/{spaceId}/assignments`

Every response carries `apiVersion: "2026-07-14"`. Fields are deliberately
bounded to Space-owned course and assignment metadata. This first contract does
not expose member identity, Passport claims, evidence, credentials or learner
activity.

## Signed, idempotent webhooks

Supported events:

- `course.published`
- `credential.issued`
- `credential.revoked`

Each immutable event has one stable UUID. A unique event/endpoint delivery row
prevents duplicate queue insertion. Retries reuse the event UUID and
`Idempotency-Key`, claim due rows with `FOR UPDATE SKIP LOCKED`, reclaim an
abandoned delivery after five minutes and stop after eight attempts. Successful
deliveries are terminal.

The exact UTF-8 body is a JSON envelope:

```json
{
  "id": "event UUID",
  "type": "course.published",
  "apiVersion": "2026-07-14",
  "occurredAt": "ISO-8601 timestamp",
  "data": {}
}
```

`X-BookQuest-Signature` is `t=<unix>,v1=<hex>`, where `v1` is
HMAC-SHA256 over:

```text
<unix>.<event UUID>.<exact request body>
```

Consumers must reject stale timestamps, compare signatures in constant time and
store the event UUID before applying side effects. The headers also include
`X-BookQuest-Event-Id`, `X-BookQuest-Delivery-Id` and `Idempotency-Key`.

Signing secrets are 256-bit random values encrypted with AES-256-GCM and
endpoint-bound additional authenticated data. Webhook URLs must be public HTTPS
hostnames; credentials, fragments, IP literals and local/internal suffixes are
rejected. Delivery never follows redirects, uses a ten-second timeout and never
stores response bodies. Network-level DNS rebinding protection should also be
enforced by the production egress layer.

## Privacy and lifecycle

Space export schema 2 includes safe client metadata, endpoint URLs and immutable
event history. It excludes client-secret hashes, access-token digests, encrypted
signing secrets, IVs and authentication tags. No learner identity is present in
the initial event payloads. Endpoint and client lifecycle rows, events and token
records are retained as security evidence and protected by terminal/append-only
database triggers.

This is implementation evidence, not a Phase 4 production-readiness statement.
Phase 3 closure and external production validation remain mandatory.
