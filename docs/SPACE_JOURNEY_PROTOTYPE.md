# Space Journey Prototype

**Status:** research prototype; no production Space API enabled  
**Last updated:** 12 July 2026

The prototype tests whether one Space primitive can serve personal learning,
private classes and managed organizations without making the personal path feel
administrative.

## Shared navigation model

The product keeps four stable contexts: **Learn**, **Create**, **Manage** and
**Discover**. A Space switcher appears only after an account has more than one
Space. Personal learners land in Learn and never need to understand roles or
policies. Owners/managers see Manage; creators/reviewers see Create.

Every screen displays the active Space beside actions that create, share, assign
or export content. Private/public state uses text plus an icon, never color alone.

## Journey A: personal learner

**Goal:** turn a document into a private course and learn it without configuring a
Space.

1. Registration creates `My learning` automatically.
2. Home offers `Upload a document`; the active personal Space is implicit.
3. Generated course shows `Private - only you` and opens directly in Learn.
4. Progress, review and export remain under the same personal Space.
5. The Space switcher stays hidden until the learner joins/creates another Space.

Prototype states: empty personal home, upload/generation progress, interrupted
generation recovery, first lesson, offline queued answer, personal export.

Acceptance:

- a new user reaches upload in at most two decisions;
- no role, invitation, tenancy or policy vocabulary is required;
- private-by-default state is visible before upload; and
- failure/offline states preserve source, progress and original event IDs.

## Journey B: private class/group

**Goal:** create a controlled class, invite a learner, assign an existing course,
and revoke access.

1. Owner selects `New Space -> Class or private group` and names it.
2. Defaults are hidden discovery, invitation-only entry, members hidden from
   learners, content by assignment, owner plus learner roles.
3. Owner creates a one-use, seven-day invitation link; raw reusable class codes
   are available only under a deliberate legacy-compatible policy.
4. Invitee sees Space name, inviter, role, expiry and requested profile fields
   before accepting.
5. Owner shares an existing personal course, selects its immutable version and
   creates an assignment.
6. Learner sees only assigned content and their own progress.
7. Owner removes the learner; membership becomes `removed`, invitations revoke,
   cached URLs and queued jobs fail authorization immediately, while historical
   evidence retains the Space/assignment version.

Prototype states: class preset, invitation preview/expired/revoked, member list,
course share-versus-move choice, assignment confirmation, learner view, removal
confirmation and post-removal denial.

Acceptance:

- class creation plus invitation takes under two minutes on a phone;
- invitation never exposes member/course metadata before acceptance;
- owner can explain whether content is owned, shared or copied; and
- revocation denial is immediate and indistinguishable from an unrelated private
  resource.

## Journey C: organization

**Goal:** establish governed creation, approval, assignment and audit roles without
building SSO/custom roles prematurely.

1. Organization owner supplies name, language, timezone and branding; default is
   private/invitation-only.
2. Setup checklist assigns at least one administrator and optionally creator,
   reviewer, manager and auditor. The last owner cannot remove themselves.
3. Creator adds a controlled source and draft; reviewer can comment/approve but
   not publish; manager can assign approved content but not edit it.
4. Auditor gets read-only evidence/report access with no member-management or
   source-edit capability.
5. Lifecycle controls suspend the Space immediately, archive it read-only, or
   schedule deletion after dependency/retention review.

Prototype states: organization setup, role explanation, permission-denied screen,
approval handoff, manager assignment, auditor evidence view, suspend/archive and
ownership-transfer blockers.

Acceptance:

- each built-in role can predict its allowed actions from its label/description;
- creators cannot see learner evidence and managers cannot publish;
- no platform administrator receives tenant access implicitly; and
- lifecycle actions state impact, reversibility, retention and required owner.

## Usability test protocol

Test five personal learners, three class owners/learners and three organization
administrators. Give outcome-based tasks without naming UI controls. Record task
completion, time, wrong-Space actions, privacy expectation mismatches, invitation
failures and role-prediction errors. Do not implement organization-only complexity
until the personal and class journeys meet their acceptance criteria.
