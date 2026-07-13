# BookQuest usability foundation

This pass establishes an original, calm workspace design inspired by the clarity
of tools such as Notion without copying their brand or interface.

## Product rules

1. Show the next useful action before configuration.
2. Keep no more than five primary destinations on mobile.
3. Use one persistent desktop sidebar and stable page titles.
4. Group organization work into **Overview**, **People**, and **Settings**.
5. Hide advanced controls until the user asks for them.
6. Prefer plain labels and status words over emoji, decorative cards, or jargon.
7. Use restrained borders, neutral surfaces, and one dark primary action.
8. Preserve keyboard focus, semantic landmarks, mobile reflow, and reduced motion.

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
