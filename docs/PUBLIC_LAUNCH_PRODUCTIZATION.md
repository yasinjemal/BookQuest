# Public launch productization plan

**Positioning:** Upload a book, PDF, notes, or training document. Turn it into an
interactive course you can edit, study, and share.

**Priority:** make BookQuest understandable, usable and promotable for a solo
creator before expanding Phase 5 or adding deeper enterprise infrastructure.

## Product audit — 14 July 2026

BookQuest already has unusually deep course, evidence, credential and tenancy
capabilities. The launch risk is not missing infrastructure; it is that ordinary
creators encounter internal concepts before they experience the core promise.

### Implemented but too technical or too prominent

- Create presented four equal starting modes, a Space selector, recipes and a
  source library before the primary document upload.
- QTI exchange appeared inside the normal Studio quality flow.
- OAuth, webhooks and LTI were linked as a normal Space setting instead of an
  optional developer area.
- The public headline described “living story worlds” but did not immediately
  say that a document becomes an editable, shareable course.
- Email verification returned a new creator to the general home instead of the
  first-course action.
- Space, review and publishing controls are capable but still use vocabulary
  that needs plain-language guidance and better defaults.

### Implemented but hidden or incomplete for launch

- Full source text can be read in Studio, but there is no polished distraction-
  free full-book/document reading mode for learners.
- Public discovery exists, but course pages need stronger public previews,
  creator identity, sharing metadata and conversion actions.
- Creator account and course lists exist, but there is no public creator profile
  and cohesive library.
- Credits and payment fulfillment exist, but pricing is buried in Account and no
  clear public pricing page explains free versus paid use.
- Operational and learning evidence exists, but creator-facing analytics do not
  yet summarize reach, starts, completion and lesson drop-off.
- Demo data exists for engineering workflows, but public demo content, guided
  examples and empty states are not yet a launch-quality product tour.

## Prioritized build plan

### A. Launch blockers

1. Make the core promise explicit on the public home and creation page.
2. Route a verified new account directly into a guided first-course journey.
3. Make document upload the single primary creation action; progressively
   disclose blank courses, saved sources, recipes and workspace destination.
4. Keep QTI, OAuth, webhooks, LTI, SAML, SCIM and API credentials under clearly
   labelled advanced/developer or enterprise settings.
5. Add a plain public pricing page and make plan limits understandable before
   purchase.
6. Ensure a creator can publish, copy a public link and see the anonymous course
   page without learning Space or institutional terminology.

### B. Usability improvements

1. Mobile learner pass: thumb-safe navigation, persistent resume, readable quiz
   controls and interruption-safe completion feedback.
2. Distraction-free full-document reader with contents, search, position memory,
   font controls and a return-to-course action.
3. Plain-language Studio release flow with one clear next action at each state.
4. Helpful empty states for home, Studio, library, analytics and creator profile.
5. Replace internal terms with creator language while retaining precise terms in
   advanced help.

### C. Growth features

1. Public course landing pages with preview lessons, creator attribution, social
   metadata and a focused enrol/start action.
2. One-tap course sharing and creator library links.
3. Public creator profiles and curated libraries.
4. Creator analytics for views, starts, completion, lesson drop-off and shares.
5. Polished demo courses and reusable examples for tutors, teachers, authors,
   coaches and small training businesses.

### D. Enterprise validation backlog

Every item below remains open and must never be represented as passed without
real evidence. Reason: `Pending user acquisition and partner access`.

- Blacksteel participation, real completions and owner acceptance.
- Named LMS launch and Assignment and Grade Services acceptance.
- Independent penetration testing.
- Independent full-journey WCAG 2.2 AA assessment.
- Institutional stakeholder acceptance and willingness-to-pay evidence.
- External identity-provider, SCIM and institutional deployment validation.

These items do not block product development. Do not request contacts, secrets,
test accounts, dates, baselines or assessors unless the builder explicitly says
access is available.

## Smallest high-impact vertical slice

The first slice is **registration → verification → guided document upload →
editable Studio**. It changes no evidence or tenancy contracts and requires no
new enterprise infrastructure.

Implemented in this slice:

- Public positioning now states the document-to-interactive-course promise.
- Email verification sends a new creator to `/create?welcome=1`.
- Create leads with one document uploader and a three-step welcome cue.
- Privacy, editability and sharing control are explained before upload.
- Blank courses, saved sources, recipes and workspace selection remain available
  under “More ways to create.”
- QTI is under “Advanced assessment exchange.”
- OAuth, webhooks and LTI are under “Advanced & developer settings.”

## Public launch productization slice â€” implemented 14 July 2026

- Public `/pricing` explains Free, the 30-day manually renewed Creator Pass and
  one-time credit packs without presenting the existing billing contract as an
  automatic subscription.
- Anonymous `/c/[slug]` pages include creator attribution, a public outline,
  social metadata, focused start action and native-share/clipboard fallback.
  Drafts and source text remain unavailable anonymously.
- Registration preserves the requested public course through verification.
- Mobile lessons use a thumb-safe, safe-area-aware bottom action dock.
- Authenticated `/course/[id]/read` provides document selection, contents,
  search, font controls, reading-position memory and a return-to-course action.
- Public creator profiles/libraries are opt-in. Private is the migration default.
- Creator analytics summarizes privacy-minimal aggregate views, shares, starts,
  enrollments, completions and reader opens without visitor identifiers.
- `/demo` provides polished Blacksteel example content, while analytics,
  creator libraries and the reader have useful zero-data states.
- Migration 19 is forward-only; account export schema 8 includes creator/public
  fields and erasure removes public creator identity.

Engineering evidence: `tests/public-product.test.ts` exercises unpublished
course denial, anonymous source non-disclosure, creator opt-in, slug validation,
aggregate-event privacy, owner-only analytics and reader authorization.
`tests/productization.test.ts` covers the launch surface. The full PostgreSQL 16
suite passes 34 files / 189 tests after the migration-ledger expectation update;
production build and high-severity dependency audit pass. Browser QA verified
pricing, the anonymous Blacksteel page and the demo at a narrow viewport.
Commit `fd2fdd8` is deployed to production with Vercel status **Ready**; a
production semantic smoke test passed for `/pricing`.

## Active queue after this slice

The requested launch surface is implemented and tested. The next work should be
real public-launch polish informed by acquired users: conversion copy, content
quality, funnel measurement and accessibility fixes found through normal use.
Phase 5 remains paused until the builder explicitly reprioritizes it.

Phase 5 architecture expansion remains paused until these launch priorities are
understandable and browser-tested.
