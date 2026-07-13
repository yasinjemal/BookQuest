# Phase 2 release and closure guide

Phase 2 must remain **IN PROGRESS** until every gate below is evidenced against
the same commit. Local tests alone do not close the phase.

## Candidate commits

- `bcf49dd` — versioned review, publishing, learner blocks and recipes
- `d165c2a` — outline editing, scoped regeneration, previews and AI-off uploads

Record the final pushed SHA below before starting:

```text
PHASE_2_SHA=
```

## 1. Publish the candidate

From a clean `main` worktree:

```powershell
git status --short --branch
git push origin main
git rev-parse HEAD
```

The pushed SHA must equal `PHASE_2_SHA`. Do not rewrite migration 4 after this
point; any later schema change must be a new migration.

## 2. Require green CI

Open the GitHub Actions run for `PHASE_2_SHA` and verify all of the following ran
on scratch PostgreSQL 16 and passed:

- full Vitest suite;
- migration-upgrade suite;
- TypeScript checking;
- production Next.js build.

Record the run URL, start/completion timestamps and result in the tracker. A run
for a different SHA is not evidence for this release.

## 3. Require a successful Vercel production deployment

Verify the production deployment is built from `PHASE_2_SHA`. Record the Vercel
deployment URL and successful status. Do not infer deployment from CI alone.

## 4. Apply migration 4 safely

After the deployment is ready, make one ordinary request that reaches the
database, for example:

```powershell
Invoke-WebRequest https://book-quest-silk.vercel.app/api/spaces/discover -UseBasicParsing
```

The application migration lock applies pending migration 4 exactly once. Then
verify the production database read-only:

```sql
SELECT id, name, applied_at
FROM schema_migrations
WHERE id = 4;
```

Expected name: `course_studio_foundation`. Record `applied_at`.

## 5. Run the production readiness gate

Use a newly rotated, short-lived production connection string in the process
environment. Never paste it into a command history, document or tracked file.

```powershell
npm run phase2:readiness
```

Store the exact JSON output as:

```text
docs/evidence/phase2-readiness-YYYY-MM-DDTHHMMSSZ.json
```

Required result: `healthy: true`, no missing tables/triggers, and every failure
counter equal to zero. Non-zero production counts are expected and must not be
replaced with empty scratch-database evidence.

## 6. Production HTTP smoke checks

Run these without authentication first:

| Route | Expected |
|---|---|
| `/create` | `200` application shell |
| `/api/studio/sources` | `401` |
| `/api/studio/recipes` | `401` |
| `/api/studio/courses` | `401` |
| `/api/studio/courses/1/regenerate` | `401` |

Then use a real creator account in a private/personal Space to prove this journey
without manual database writes:

1. upload a small document with AI disabled and confirm no credit is charged;
2. open the extracted Studio draft;
3. add or select a starter recipe;
4. edit the outline, add/edit/reorder blocks and inspect mobile/offline previews;
5. submit, review, approve and publish;
6. branch the published version, edit one block and inspect the version diff;
7. confirm the original published version remains immutable.

Do not use customer content for the smoke course. Delete/archive the synthetic
course through normal product controls afterward if available.

## 7. Close Phase 2 only after all proof exists

Update `docs/PLATFORM_PHASE_TRACKER.md` with:

- `Status: COMPLETE` and the UTC closure date;
- exact implementation SHA;
- GitHub Actions run URL and result;
- Vercel deployment URL/result;
- migration 4 `applied_at` timestamp;
- dated readiness evidence path;
- smoke journey result and any explicitly accepted limitation.

Only then begin Phase 3 implementation. If any gate fails, leave Phase 2 open,
fix forward in a new commit/migration, and repeat every gate against the new SHA.
