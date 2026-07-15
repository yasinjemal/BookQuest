# Phase 7 bounded multi-channel and offline core

**Engineering status:** Tested local foundation  
**External validation status:** Not available yet  
**Package profile:** `bookquest.channel-course.v1`

## One learning system

Offline and chat projections carry channel-neutral modules, lessons and blocks.
They reuse the existing stable `eventId`, server-authoritative answer endpoint,
evidence-reconciled completion, course/assignment access and mastery projection.
Unsupported media or complex activities receive deterministic text alternatives
from the same block capability registry; channel code never executes course data.

The authenticated offline-package endpoint returns private/no-store JSON. The
browser stores it under an account-and-course IndexedDB key, shows its saved
version, exposes answer/completion queue depth and deletes all cached course
packages on sign-out for shared-device safety.

## Messaging privacy boundary

- Channel addresses are HMAC-SHA256 hashed before persistence. Raw phone numbers,
  email addresses and message content do not enter channel tables or the learning
  ledger.
- Provider event IDs are unique per channel. Exact retries return the original
  result; reuse with different content is rejected.
- Linking and opt-in are explicit append-only consent events. STOP moves the link
  to `opted_out`; non-essential delivery then fails closed. HELP and opt-out
  confirmation remain permitted.
- Provider message IDs are hashed. Delivery history accepts only aggregate-safe
  metadata and records status and cost micros append-only.
- Resume links store only a digest, expire within 30 minutes and can be consumed
  once. Cross-channel resume sequence numbers cannot move backward.

## External boundary

There is no selected SMS/WhatsApp/email provider, sender, template, webhook or
real recipient pilot. Provider delivery, reminder scheduling, outcome parity,
complaints, cost per completion and named low-end-device behavior remain open
until real users, partner access and hardware are available.
