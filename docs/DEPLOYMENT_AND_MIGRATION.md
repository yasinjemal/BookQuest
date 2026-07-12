# Deployment & Postgres Migration

**Status:** shipped and verified live against Neon
**Last updated:** 12 July 2026

This document records the migration from SQLite to Postgres that made BookQuest
deployable on Vercel, how the data layer works now, and how to run and deploy it.

---

## 1. The problem it solved

BookQuest was deployed to Vercel (`book-quest-silk.vercel.app`) and every request
failed — `/api/me` returned **500**, and the home page hung on "Loading…" forever.

**Root cause:** the data layer used `better-sqlite3`, which opens a database file
and writes its `.db`, `-wal`, and `-shm` files inside the deployment directory at
import time. Vercel's serverless filesystem is **read-only** (only `/tmp` is
writable, and it is neither durable nor shared between instances). So the module
threw the moment any route imported it, and the client silently swallowed the
failed `/api/me` response, leaving the user stuck at "Loading…".

The fix was not a workaround (`/tmp` would only paper over it, splitting data
across instances). It was a real migration to managed Postgres.

---

## 2. What changed

| Area | Before | After |
|---|---|---|
| Database | SQLite (`better-sqlite3`), synchronous | **Neon Postgres** (`pg`), asynchronous |
| Connection/schema | created a local `.db` file | [`lib/pg.ts`](../lib/pg.ts): pooled connection + idempotent schema |
| Queries | [`lib/db.ts`](../lib/db.ts), sync | [`lib/db.ts`](../lib/db.ts), fully `async` (~90 functions) |
| Auth + routes | sync calls | `await` throughout `lib/auth.ts` + all 24 API routes |
| Uploads | wrote file to `data/uploads/` | in-memory buffer → chapters saved in `courses.source_json` |
| Extraction | read file from disk | [`lib/extract.ts`](../lib/extract.ts) takes a `Buffer` |
| Retry | re-read the original file | regenerates from stored `source_json` |
| Course generation | `void generateCourse(...)` (frozen on serverless) | Next.js `after(() => …)` |
| Home page failure | infinite "Loading…" | visible error state with a "Try again" button |

### Key design choices

- **Timestamps are stored as ISO-8601 text**, exactly like SQLite did
  (`Date.toISOString()`). Every JS-side string comparison in the app keeps
  working unchanged; SQL comparisons against "now" cast the column to
  `timestamptz` (`created_at::timestamptz > now()`).
- **Booleans stay as `INTEGER` 0/1** columns (`published`, `fresh`,
  `is_correct`, …) so the existing TypeScript row shapes are untouched.
- **Aggregates are explicitly cast** — Postgres returns `COUNT`/`SUM` as `bigint`
  and `AVG` as `numeric`, both of which `pg` hands back as **strings**. Every
  aggregate uses `::int` or `::float8` so it comes back as a JS number
  (e.g. `COUNT(*)::int AS n`, `AVG(mastery)::float8`).
- **No object storage was added.** The uploaded file is only needed during
  extraction; once the chapters are extracted and stored, the original is never
  read again. This is simpler and cheaper than Vercel Blob / S3. (Add Blob later
  only if you ever want to *re-process the original bytes*.)

---

## 3. How the data layer works now

### Connection ([`lib/pg.ts`](../lib/pg.ts))

- A single `pg.Pool` per worker (`max: 5`), reused across requests via a
  `globalThis` singleton. Neon's PgBouncer pooler (the `-pooler` host in
  `DATABASE_URL`) fans the connections out safely.
- **Versioned transactional migrations, applied lazily once per worker.** The
  first query triggers `ensureSchema()` ([`lib/pg.ts`](../lib/pg.ts)), which takes
  a session-scoped `pg_advisory_lock`, then applies every migration in
  [`lib/migrations.ts`](../lib/migrations.ts) that is not yet recorded in the
  `schema_migrations` ledger. Each migration runs in its own transaction and
  records its id in that same transaction, so a migration is either fully applied
  and recorded or not at all. Concurrent cold-starts wait on the lock, then find
  the migrations already recorded and skip them — no re-running DDL or backfills on
  every boot. See [Schema migrations](#8-schema-migrations) below.
- Helpers: `q()` (parameterized query), `one()` (first row), `many()` (all rows),
  and `tx()` (run a function inside one transaction). Each accepts an optional
  `Queryable` so a function can run on either the pool or an open transaction
  client.

### Transactions & atomicity

Functions that must be atomic (`recordAnswerEvidence`, `completeLesson`,
`createPracticeSession`, `prepareCourseRetry`, `createUser`) run inside `tx()`.
Because a Postgres transaction is bound to one checked-out client, any nested
helper that must share the transaction (`getCourse`, `getLearnerKey`,
`ensureQuestionVersion`, `answerReviewItem`, `addStatsXp`) accepts that client as
its last argument. `recordAnswerEvidence` also takes an optional in-transaction
`project` callback so source-specific side effects (practice XP, review
rescheduling) commit together with the learning event.

### Immutability guards

The learning ledger's append-only rules survived the migration: the SQLite
`RAISE(ABORT, …)` triggers were translated to PL/pgSQL `RAISE EXCEPTION`
functions + `BEFORE UPDATE/DELETE` triggers on `learning_events`, and a
`BEFORE UPDATE OF …` trigger enforcing `question_versions` immutability.

---

## Durable course generation

Generating a whole book (an outline call plus one Claude call per module) can
take longer than a serverless function's 300s limit. Generation is therefore a
**resumable chain of short invocations** rather than one long-running task.

**State lives in the database, so any invocation can resume:**

- `courses.source_json` — the extracted chapters (set at upload).
- `modules.chapter_indexes` — which chapters each module covers, so a module can
  be generated independently without re-running the outline.
- `modules.status` (`pending` → `generating` → `ready`/`error`) + `modules.attempts`.
- `courses.generation_heartbeat` — touched at each step; a stale heartbeat means
  the chain died.
- `courses.generation_attempts` — bounds outline retries.
- `courses.generation_run_id` — the active run identity. Every generated module,
  lesson, heartbeat, status and metadata write must match it. Retrying rotates
  the identity atomically, so delayed workers from the previous run terminate
  without changing or chaining into the new run.

**One step = one unit of work** ([`runGenerationStep`](../lib/generator.ts)),
derived purely from DB state: create the outline's modules, generate the next
`pending` module, or finalize the course to `ready`.

**The driver** ([`lib/generation.ts`](../lib/generation.ts), `runAndChain`):

1. Takes a per-course Postgres **advisory lock** (`withCourseGenerationLock`), so
   only one chain works on a course at a time. If a worker dies, the lock
   auto-releases.
2. Runs steps in a loop until the course is done **or** ~240s elapse (60s of
   headroom under the 300s limit).
3. If work remains, POSTs to the internal worker
   [`/api/internal/generate`](../app/api/internal/generate/route.ts) — a **fresh
   invocation with a fresh clock** — which does the same thing again.

**Triggers:** upload and retry start the first chain via `after()`. The internal
endpoint is guarded by `GENERATION_SECRET`.

**Self-healing:** `GET /api/courses` checks the owner's courses; any whose
heartbeat has gone stale (>3 min) get a resume kick in the background. So a
broken chain recovers the next time the user looks at their courses — no cron
required (works on any Vercel plan). A `vercel.json` cron hitting the same
resume path could be added as an extra safety net on Pro.

Because module generation is idempotent, claim-guarded and run-isolated, retries
and overlapping triggers are safe: a module is generated once, stale workers
cannot cross a retry boundary, and a partially generated course is already
usable (finished modules show lessons; a failed module is marked and the rest
still complete).

---

## 4. Deploying to Vercel

1. Create a Neon Postgres database (or reuse the existing one).
2. In the Vercel project → **Settings → Environment Variables**, set:
   - `DATABASE_URL` — the Neon **`-pooler`** connection string
     (`…-pooler.…aws.neon.tech/neondb?sslmode=require`)
   - `ANTHROPIC_API_KEY` — your Claude API key
   - `GENERATION_SECRET` — any random string; guards the internal generation
     worker so only the app can trigger it (see "Durable course generation").
     Recommended in production.
   - `RATE_LIMIT_SALT` — a separate random secret used to hash account and
     network identifiers in distributed rate-limit buckets. Recommended in
     production; rotate only when intentionally resetting all active limits.
   - `OBSERVABILITY_SALT` — a separate random secret for one-way subject keys in
     operational monitoring. Optional if `RATE_LIMIT_SALT` is set, but a
     separate production value is preferred.
   - *(optional)* `AI_REQUEST_ALERT_24H` and `RATE_LIMIT_ALERT_24H` — admin alert
     thresholds, defaulting to 100 AI requests and 50 denials in 24 hours.
   - *(optional)* `OPERATIONAL_EVENT_RETENTION_DAYS` — monitoring retention,
     clamped to 7–3650 days and defaulting to 90.
   - `APP_URL` — the canonical HTTPS origin used in verification and password
     reset links. Required for production account-security email.
   - `RESEND_API_KEY` and `EMAIL_FROM` — transactional email credentials and a
     sender on the exact domain/subdomain verified with Resend. When no key is
     configured outside production, the UI exposes local-only preview links.
   - *(optional)* `FLW_SECRET_KEY` — enables live Flutterwave billing
3. **Redeploy.** Pending migrations apply automatically on the first request (see
   [Schema migrations](#8-schema-migrations)); no manual step is required. You can
   also apply them ahead of traffic with `node scripts/migrate.mjs`.
4. The **first account registered on the live site becomes the admin/owner**
   (the Neon database starts empty).

`DATABASE_URL` lives in `.env.local` for local development. That file is
gitignored and the connection string is not committed anywhere.

---

## 5. Scripts

| Script | Purpose |
|---|---|
| `node scripts/migrate.mjs` | Applies any pending migrations and prints the `schema_migrations` ledger plus table count. Runs the exact same `ready()` the app uses, so it doubles as a connectivity check. |
| `node scripts/reconcile.mjs [--rebuild] [--course=<id>]` | Reconciles the `concept_mastery` projection against the immutable `learning_events` ledger; reports drift (exit non-zero) or, with `--rebuild`, recomputes and replaces it, then re-verifies. |
| `node scripts/seed-demo.mjs` | Seeds a small "Money Basics" demo course (reads `DATABASE_URL` from `.env.local`). |

---

## 6. Tests

- `npm run typecheck` — clean.
- `npm test` (`vitest`) — passes. Pure-logic tests (`learning`, `answer-outbox`,
  `migrations` list invariants) run always.
- `tests/learning-ledger.test.ts`, the `migration runner` block in
  `tests/migrations.test.ts`, and `tests/migration-upgrade.test.ts` are **database
  integration tests**. They touch a real database (the ledger test `TRUNCATE`s
  tables; the upgrade test resets `public`), so they are **skipped unless
  `TEST_DATABASE_URL` is set**, and `vitest.config.ts` runs test files serially so
  they never race on the shared scratch database. Point at a scratch database (Neon
  branching is ideal for this):
  ```
  TEST_DATABASE_URL=postgres://…scratch-branch… npm test
  ```
- `tests/migration-upgrade.test.ts` is the **upgrade test**: it applies the
  earliest Postgres schema (`tests/fixtures/pre-ledger-schema.sql`), seeds rows,
  runs the real `applyPendingMigrations`, and asserts the baseline adds the newer
  columns/tables, backfills provenance, and preserves existing data.

### Verified live

Registration → session cookie → authenticated `/api/me`, `/api/courses`, and
`/api/stats` were all exercised against the real Neon database and returned
correct results; `/api/me` now returns `401 {"user":null}` when signed out
instead of 500. The throwaway verification account was deleted afterward.

---

## 7. Suggested next steps

Roughly in priority order.

### Reliability
1. ✅ **Durable course generation** — done. Generation is now a resumable chain
   of short invocations (see "Durable course generation" above). A possible
   future refinement: a `vercel.json` cron as an extra resume safety net, and/or
   an external queue (QStash / Inngest) if generation volume grows.
2. ✅ **Password reset / email verification — done.** One-time hashed tokens,
   expiring links, Resend delivery, local previews, and reset-time session
   invalidation are implemented.
3. ✅ **Rate limiting — done.** Distributed Postgres limits protect auth,
   uploads, generation, retries, fresh practice, and answer submission.

### Infrastructure hardening
4. ✅ **CI runs the database integration tests — done.**
   [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs typecheck, build
   and `npm test` against a throwaway Postgres 16 service container (set as both
   `DATABASE_URL` and `TEST_DATABASE_URL`), so the ledger, migration-runner and
   upgrade tests execute for real on every push and PR. A managed-Postgres variant
   (ephemeral Neon branch per run) can replace the service container later if you
   want CI to exercise Neon specifically.
5. **Pin the SSL mode.** `pg` warns that `sslmode=require` is treated as
   `verify-full` today; make it explicit (`sslmode=verify-full`) to be
   future-proof, or set it consciously.
6. ✅ **Baseline observability — done.** Privacy-safe operational events, global
   request-error capture, AI/abuse signals, retention, thresholds, and admin
   health summaries are implemented. An external alerting destination remains a
   later enhancement.
7. **Confirm backups / PITR** are enabled on the Neon project.

### Product (from the blueprint)
8. **Marketplace payouts** — schema is ready (`courses.price_cents`,
   `transactions`); the payout flow is not built yet.
9. **More languages** for generated courses (the audience is multilingual,
   low-bandwidth learners).
10. **Rename** — "BookQuest" is a crowded name; pick a distinct brand before a
    wider launch.
11. **Object storage for originals** — only if you decide you need to
    re-process source files (different chunking, re-extraction) rather than the
    stored chapters.

---

## 8. Schema migrations

The schema is defined as an ordered list of **versioned, forward-only
migrations** in [`lib/migrations.ts`](../lib/migrations.ts), applied by the runner
in [`lib/pg.ts`](../lib/pg.ts) (`ensureSchema`). This replaced the earlier "lazy
schema evolution", where one big idempotent DDL block re-ran on every worker cold
start.

### How it works

- Each migration is `{ id, name, sql }`. Ids start at `1` and increase by `1` with
  no gaps; `assertMigrationsWellFormed()` enforces this at import time.
- A `schema_migrations` ledger (`id`, `name`, `applied_at`) records what a database
  has already applied.
- On first use, the runner takes a **session-scoped `pg_advisory_lock`**, creates
  the ledger if needed, reads the applied ids, and applies each pending migration
  **in its own transaction**, inserting the ledger row in that same transaction. So
  a migration commits atomically with its record, and concurrent cold-start workers
  serialize on the lock, then skip already-recorded migrations.
- Migration `1` is the **baseline**: the entire schema at the time migrations were
  introduced, kept idempotent (`CREATE TABLE IF NOT EXISTS …`, `ADD COLUMN IF NOT
  EXISTS …`, one-time backfills). On a fresh database it builds everything; on the
  pre-migrations production database every statement is a no-op and it is simply
  recorded as applied — so both converge without re-running anything twice.

### Adding a schema change

1. **Append** a new migration with the next id (never edit or reorder a shipped
   one — the ledger means an edit would never run on databases past that id).
2. It is forward-only, so it may assume all earlier migrations ran; no `IF NOT
   EXISTS` guards are needed (only the baseline is idempotent).
3. Keep it transactional — avoid statements Postgres refuses inside a transaction
   (e.g. `CREATE INDEX CONCURRENTLY`).
4. Apply and verify with `node scripts/migrate.mjs`, and run the
   `migration runner` integration test against a scratch database.
