# Phase 1 closure guide

Phase 1 is locally implemented in the current `main` commit chain. It closes only
after that exact pushed head passes CI, deploys, and the production migration/data
journey is verified. Do not run mutation tests against real customer accounts.

## 1. Publish and CI

Push `main`, then require the GitHub Actions workflow to pass type checking,
production build and all Postgres integration tests. Record the workflow URL and
tested commit SHA.

## 2. Deployment and read-only migration proof

Wait for the production deployment to become ready. The first application
request applies migration 3 under the existing advisory migration lock. Then run:

```powershell
$env:DATABASE_URL = "<production pooled connection string>"
npm run phase1:readiness > docs/evidence/phase1-readiness-<UTC timestamp>.json
```

The command uses a read-only transaction, emits aggregate counts only, and exits
non-zero if tables, personal Spaces, course owners, classroom mappings,
assignment audiences or post-migration evidence context are missing.

## 3. Production smoke journey

Use two dedicated non-customer test accounts:

1. Confirm each account sees exactly one automatic personal Space.
2. Create a private Space and confirm it is absent from public discovery.
3. Invite the second account as learner; accept the link once and prove replay is
   rejected.
4. Attach an owned ready course, create an assignment and open one lesson as the
   learner.
5. Submit one answer and complete the lesson. Re-run readiness and confirm both
   post-migration context failure counters remain zero.
6. Remove the learner. Confirm the old lesson/practice session and a queued answer
   are denied immediately.
7. Create a legacy Class, join with its code, assign/unassign an owned course, and
   verify both the Class and Space screens agree.
8. Archive and restore the private Space; confirm mutation is denied while
   archived. Export it and confirm no password/session/token data appears.
9. Remove the dedicated test records through the documented privacy/lifecycle
   workflows rather than direct production deletion.

## 4. Close the tracker

Store the CI URL, deployment URL/SHA, dated readiness JSON and smoke observations
under `docs/evidence/`. Only then change Phase 1 to `COMPLETE`, move the master
map to Phase 2 `IN PROGRESS`, and begin Course Studio production work.
