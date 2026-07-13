# BookQuest usability foundation

BookQuest now uses an original editorial workspace identity: expressive enough to
be memorable, disciplined enough to keep complex training work easy. It retains
the clarity that motivated the earlier Notion-inspired pass without copying any
product's brand, layout, or visual language.

## Product rules

1. Show the next useful action before configuration.
2. Keep no more than five primary destinations on mobile.
3. Use one persistent desktop sidebar and stable page titles.
4. Group organization work into **Overview**, **People**, and **Settings**.
5. Hide advanced controls until the user asks for them.
6. Prefer plain labels and status words over emoji or jargon; expressive surfaces
   must communicate hierarchy, state, or workflow.
7. Use color with intent: forest for focus, acid paper for action, cobalt for
   evidence, and warm paper for reading.
8. Preserve keyboard focus, semantic landmarks, mobile reflow, and reduced motion.

## Visual identity

- **Typography:** Instrument Serif carries the editorial voice; Manrope carries
  interface detail and long-form clarity. The contrast makes important moments
  feel authored without sacrificing scan speed.
- **Palette:** deep forest (`#10261f`), warm paper (`#f3f0e8`), acid paper
  (`#dcfa72`), cobalt (`#5960ed`), and restrained coral and sky accents.
- **BookQuest mark:** two offset page forms create a recognizable open-book mark
  without initials, emoji, or a third-party icon set.
- **Signature surfaces:** dark gridded canvases represent the workspace; layered
  paper sheets represent courses and immutable evidence.
- **Motion:** small lift, rotation, and depth changes reward intent. All motion is
  removed when the user requests reduced motion.
- **Voice:** concise, confident, human, and specific. Product evidence is shown as
  something valuable, not administrative residue.

## Current information architecture

- **Home:** continue a course or quickly upload a document.
- **Create:** choose a Space, name the course, select material, then enter Studio.
- **Library:** discover published material.
- **Spaces:** manage courses and evidence in one workspace.
- **Practice:** review and retrieval practice.
- **Account:** personal settings, security, privacy, and billing.

Inside a Space:

- **Overview:** outcomes, assignments, pilot evidence, and assigned courses.
- **People:** invitations, members, teams, and optional bulk actions.
- **Settings:** branding, security policy, lifecycle, exports, and legal hold.

## Progressive disclosure

The default view keeps optional source-library text entry, teaching recipes, team
setup, bulk invitations, assignment configuration, security policy, and legal hold
behind explicit expandable controls or section tabs. The underlying permissions,
evidence rules, and APIs are unchanged.

## Verification boundary

The implementation must pass type checking, the full PostgreSQL-backed test suite,
and the production build. Browser checks cover signed-out and signed-in desktop and
mobile layouts, no horizontal overflow, tab behavior, semantic navigation, and
console warnings/errors. This local QA does not replace the independent Phase 3
WCAG 2.2 AA assessment.
