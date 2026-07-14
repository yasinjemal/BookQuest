# Phase 4 QTI 3 assessment exchange

**Implemented:** 14 July 2026  
**Profile:** `bookquest-qti-3.0-item-bank-v1`

BookQuest exchanges a deliberately small, fail-closed QTI 3.0 Item Bank
profile. It is implementation evidence, not a claim of 1EdTech product
certification or general QTI conformance.

## Supported exchange

- A top-level `imsmanifest.xml` using the QTI 3.0 Item Bank content-package
  namespace and `imsqti_item_xmlv3p0` resources.
- Single-response choice interactions mapped to Studio multiple choice.
- Two-option `True`/`False` choice interactions mapped to Studio true/false.
- Single string text-entry interactions mapped to Studio fill-in.
- Correct-response declarations and general feedback.
- Export of compatible blocks from the authorized course version.
- Import into one new draft module and lesson, with the source identifier,
  SHA-256 package digest and `QTI 3.0` provenance frozen on every block.

Unsupported interactions, response cardinalities and package variants are
rejected before a database write. BookQuest never silently approximates an
unsupported assessment.

## Safety and authorization boundary

Import accepts one zip up to 5 MB, at most 200 archive entries, 20 MB expanded,
5 MB per entry and 100 assessment items. The central directory is inspected
before decompression. Encrypted entries, unsupported compression, unsafe or
duplicate paths, DTDs, entities and XML stylesheets are rejected. The selected
profile requires the documented default namespaces on the manifest and item
roots.

All items parse and validate before a single transaction writes them. The
transaction rechecks `content.update` in the exact owning Space, requires a
draft version, and rejects a retry of the same package digest so an interrupted
client cannot duplicate the bank. Export uses the existing tenant-authorized
Studio read path. Both routes are authenticated, private/no-store; import is
user-rate-limited.

## Deliberate exclusions

This slice does not support tests, sections, adaptive items, media dependencies,
rubrics, custom response processing, multiple response, ordering, matching,
hotspot, upload, portable custom interactions or arbitrary HTML. Those require
separate profiles and interoperability fixtures before they may be accepted.

## Verification

The isolated PostgreSQL integration test round-trips all three supported block
types, verifies frozen provenance, tenant denial, duplicate-import safety and
all-or-nothing writes, and rejects traversal, active XML, oversized and
unsupported packages. Full-suite, build, typecheck and dependency-audit results
are recorded in the dated Phase 4 evidence file.
