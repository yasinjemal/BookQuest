# Phase 0 Closure Guide

**Status:** COMPLETE — all implementation, CI, recovery and production
reliability gates passed on 12 July 2026 UTC. Phase 1 production work is
unblocked.

## Current evidence

- Commit: `a4f0ba9` on `main`
- CI: [GitHub Actions CI #6](https://github.com/yasinjemal/BookQuest/actions/runs/29210905776)
  passed on 12 July 2026
- Logical restore: PostgreSQL 16 restored 28 tables, 2 rows and 203 schema
  objects, with both migrations present

## Gate 1: Neon point-in-time recovery

**Owner:** deployment operator with Neon console or API access

Prepared reference (12 July 2026): project `purple-shadow-87152203`, production
branch `br-raspy-tree-asm5dia2`, 24-hour history retention, selected recovery
timestamp `2026-07-12T21:30:00Z`. The privacy-safe current-state reference is in
`docs/evidence/phase0-pitr-reference-2026-07-12T220239Z.json`.

Provider drill verification (12 July 2026): Neon created isolated branch
`br-falling-wave-as7zt4ln` from provider-recorded timestamp
`2026-07-12T22:11:50Z`. Provisioning took about 1 second; full migration,
row-count and ledger-reconciliation verification completed in 301 seconds, for
a recovery-point lag of 508 seconds. The scripts found 28 tables, both applied
migrations and 30/30 matching mastery projections with zero drift. Evidence is
in `docs/evidence/phase0-pitr-drill-2026-07-12T222519Z.json`. The temporary
branch was deleted after verification; production was never modified.

1. Confirm the production project's PITR entitlement and retention window.
2. Choose a recoverable timestamp far enough in the past to prove time travel.
3. Record the drill start time and the chosen recovery timestamp.
4. Restore that timestamp to a temporary Neon branch. Never overwrite or reset
   the production branch.
5. Point `DATABASE_URL` at the temporary branch and run:

   ```powershell
   node scripts/migrate.mjs
   node scripts/reconcile.mjs
   ```

6. Verify that migrations are current, reconciliation reports no drift, and a
   known record that existed at the recovery point is present.
7. Record:
   - recovery point objective (RPO): drill start time minus restored timestamp;
   - recovery time objective result (RTO): branch request time to completed
     verification;
   - project, source branch, temporary branch, timestamp, operator and result.
8. Delete the temporary branch after capturing the evidence.

Do not include database credentials, learner identities or private row contents
in the evidence record.

## Gate 2: Production reliability baseline

**Owner:** deployment operator with production database access

After the `a4f0ba9` deployment and migrations are confirmed, point
`DATABASE_URL` at production and run:

```powershell
$env:RELIABILITY_HEALTH_WINDOW_START = "<deployment UTC timestamp>"
npm run reliability:baseline
```

Store the JSON in the approved operational evidence location with the UTC date,
deployed commit and operator. The report is aggregate-only, but it should still
be handled as operational evidence. A non-zero exit or `"healthy": false` means
the baseline found projection drift, malformed evidence, answer-delivery
failures, stalled generation or production errors. Investigate the reported
groups and rerun the baseline before closing the gate. The closing run at
`2026-07-12T22:30:30Z` passed with two ready courses, no stalled generation,
zero projection drift and zero errors/failures in the bounded post-deployment
window. It retained the earlier 24-hour incident totals for auditability. See
`docs/evidence/phase0-reliability-closing-2026-07-12T223030Z.json`.

## Final tracker update

Both gates passed and `docs/PLATFORM_PHASE_TRACKER.md` was updated:

1. Mark **Test backups and point-in-time recovery** complete and add the dated
   Neon drill evidence, measured RPO and measured RTO.
2. Mark immediate action **Establish baseline values for Phase 0 reliability
   metrics** complete and reference the stored baseline record.
3. Change Phase 0 status from **IN PROGRESS** to **COMPLETE**.
4. Change the current phase to Phase 1 and begin only the first gated vertical
   slice documented in the tracker.

Phase 1 production implementation is now active, beginning with the first
vertical slice documented in the tracker.
