# Self-hosting, AI providers and isolated operation

**Contract version:** 1

**Last verified:** 15 July 2026

**Scope:** one BookQuest web installation and one PostgreSQL database

This guide covers a conventional Node deployment, forward-only upgrades,
provider selection and what works when outbound internet access is unavailable.
It is an operator guide, not a promise of support for every infrastructure
combination.

## Supported baseline

- Node.js 22 LTS and `npm ci`
- PostgreSQL 16
- a persistent HTTPS origin behind a reverse proxy or platform load balancer
- one application release deployed at a time during a schema upgrade
- durable database backups held outside the application host

The application stores durable state in PostgreSQL. Uploaded documents are
extracted in memory and the extracted source is stored in the database; no
shared application filesystem is required. Run multiple application processes
only when they point at the same database and the same secrets.

## Required configuration

| Variable | Requirement |
|---|---|
| `DATABASE_URL` | Required PostgreSQL connection string. Use TLS in production. |
| `APP_URL` | Required canonical HTTPS origin in production. |
| `GENERATION_SECRET` | Required in production to authenticate internal generation calls. |
| `RATE_LIMIT_SALT` | Separate random production secret for hashed limiter identities. |
| `OBSERVABILITY_SALT` | Separate random production secret for operational subject hashes. |
| `MFA_ENCRYPTION_KEY` | Required when MFA secrets are stored. |
| `INTEGRATION_ENCRYPTION_KEY` | Required for encrypted webhook signing secrets. |
| `OPEN_BADGES_KEY_ENCRYPTION_KEY` | Required when Open Badges issuer keys are used. |

Email (`RESEND_API_KEY`, `EMAIL_FROM`) and live billing (`FLW_SECRET_KEY`) are
optional integrations. Without them, production email delivery and live
payment processing are unavailable. Do not use local billing test mode as a
production payment substitute.

## AI modes

`BOOKQUEST_AI_PROVIDER` selects the installation policy:

| Value | Additional variables | Behavior |
|---|---|---|
| `anthropic` (default) | `ANTHROPIC_API_KEY` or `BOOKQUEST_AI_API_KEY`; optional `BOOKQUEST_AI_MODEL` | Uses Anthropic's hosted API. |
| `anthropic-compatible` | `BOOKQUEST_AI_BASE_URL`, `BOOKQUEST_AI_MODEL`, `BOOKQUEST_AI_API_KEY` | Uses an operator-selected endpoint implementing the Anthropic Messages/structured-output contract. |
| `disabled` | none | Disables generation, rewrite and fresh-AI practice. |

Unknown modes, credential-bearing base URLs, missing compatible-provider
models and missing keys fail closed. `/api/capabilities` publishes only the
safe capability state; it never returns a key or private endpoint.

When AI is disabled, creators can still:

- upload a document as a source-only editable draft;
- create blank courses and manually authored blocks;
- reuse saved approved sources and recipes;
- import and export portable course and recipe archives;
- publish, learn, assess, export evidence and issue credentials.

AI-disabled mode does not silently send content to another provider and does
not consume a generation credit or create an AI job.

## Install and start

```powershell
npm ci
npm run typecheck
npm run build
node scripts/migrate.mjs
npm start
```

Put secrets in the service manager or secret store, not in the repository.
Terminate TLS at the reverse proxy and forward the canonical origin. The first
request also applies pending migrations, but running `scripts/migrate.mjs`
before traffic gives operators a clear migration ledger and connectivity check.

After start:

1. request `/api/capabilities` and confirm the intended AI mode;
2. register the intended first administrator on a new database;
3. create a private source-only draft and reopen it in Studio;
4. run `node scripts/reconcile.mjs` and inspect the exit code;
5. exercise backup restoration against a separate disposable database.

## Upgrade procedure

Migrations in `lib/migrations.ts` are ordered, transactional and forward-only.
Concurrent application starts serialize through a PostgreSQL advisory lock.
Never edit or reorder a migration already deployed.

1. Pin the target commit and read its migration notes.
2. Take a snapshot-consistent database backup.
3. Restore that backup into a disposable PostgreSQL 16 database.
4. Set `DATABASE_URL` and `TEST_DATABASE_URL` to the disposable database, then
   run `node scripts/migrate.mjs`, `npm test`, and `node scripts/reconcile.mjs`.
5. Build the exact release artifact before the maintenance window.
6. Stop old application processes, apply migrations once, and start the new
   release with the same stable encryption secrets.
7. Verify `/api/capabilities`, authentication, one Studio read, one learner read
   and reconciliation before restoring normal traffic.

Application rollback is safe only when the earlier application understands the
new schema. Database rollback requires restoring the pre-upgrade backup; there
are no automatic down migrations. Never point tests at production because the
database integration suite intentionally resets tables.

The guarded logical recovery drill is:

```powershell
$env:BACKUP_RESTORE_DATABASE_URL = "postgres://.../bookquest_restore_drill"
npm run backup:drill -- --confirm-reset=bookquest_restore_drill --artifact=./artifacts/bookquest.dump
```

## Isolated and air-gapped evaluation

The runtime can operate without outbound internet when all of the following are
true:

- the application artifact and dependencies were built and transferred through
  an approved supply-chain process;
- PostgreSQL, the application origin and internal generation callback remain
  reachable inside the boundary;
- `BOOKQUEST_AI_PROVIDER=disabled` or the compatible AI endpoint is inside the
  boundary;
- email, live billing, outbound webhooks, external LTI platforms and hosted AI
  are treated as unavailable;
- course media uses locally reachable URLs rather than public web assets.

Known limitation: a clean source build is not fully air-gapped today. `npm ci`
requires a populated package cache or internal registry, and `next/font/google`
downloads build-time font assets unless the Next font cache is pre-seeded.
Build a signed artifact outside the isolated boundary or mirror those inputs.
No claim is made that the repository currently provides a reproducible
zero-network supply chain.

Core authoring, portable imports, local learning, evidence, credentials and
account export do not require outbound services at runtime. This is a static
architecture evaluation; a real isolated deployment and upgrade drill remains
an operator release gate.

## Edition boundary

- **Community/self-hosted:** the same content, accessibility, portability and
  learner-ownership controls, operated by the installer.
- **Hosted creator/team:** managed operations and collaboration conveniences;
  it may meter hosted compute such as AI, but not access to usable exports.
- **Enterprise:** deployment support, organization integrations and validated
  operational commitments defined by contract.

Portable export, accessibility behavior, learner data access and deletion are
not edition lock-in features. Commercial terms and an open-source licence still
require legal review before distribution beyond the current repository.
