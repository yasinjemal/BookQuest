// Prove that a PostgreSQL logical backup can be restored into a disposable
// database without touching the source. The dump uses an exported snapshot, so
// the source row counts used for verification describe the exact backup even if
// the application is receiving writes while the dump runs.
//
// Usage:
//   BACKUP_RESTORE_DATABASE_URL=postgres://.../bookquest_restore_drill \
//     node scripts/backup-restore-drill.mjs \
//       --confirm-reset=bookquest_restore_drill \
//       --artifact=./artifacts/bookquest.dump
import { mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import { spawnSync } from "child_process";
import pg from "pg";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.local - rely on the real environment */
}

const args = process.argv.slice(2);
const option = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const sourceUrl = process.env.BACKUP_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
const restoreUrl = process.env.BACKUP_RESTORE_DATABASE_URL;
const confirmation = option("confirm-reset");
const artifact = resolve(
  option("artifact") ?? `artifacts/bookquest-backup-${Date.now()}.dump`
);

if (!sourceUrl) {
  throw new Error("Set BACKUP_SOURCE_DATABASE_URL or DATABASE_URL for the source.");
}
if (!restoreUrl) {
  throw new Error(
    "Set BACKUP_RESTORE_DATABASE_URL to a separate, disposable restore database."
  );
}

function databaseIdentity(value) {
  const url = new URL(value);
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

const source = databaseIdentity(sourceUrl);
const restore = databaseIdentity(restoreUrl);
if (
  source.host === restore.host &&
  source.port === restore.port &&
  source.database === restore.database
) {
  throw new Error("The restore target must not be the source database.");
}
if (!restore.database || confirmation !== restore.database) {
  throw new Error(
    `Refusing to reset the restore target. Pass --confirm-reset=${restore.database}`
  );
}
if (!/(test|scratch|restore|drill)/i.test(restore.database)) {
  throw new Error(
    "The restore database name must contain test, scratch, restore, or drill."
  );
}

function run(command, commandArgs, databaseUrl, extraEnv = {}) {
  const result = spawnSync(command, commandArgs, {
    env: { ...process.env, PGDATABASE: databaseUrl, ...extraEnv },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(
      `${command} is not installed. Install PostgreSQL client tools and retry.`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}).\n${result.stderr || result.stdout}`
    );
  }
}

function commandVersion(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") {
    throw new Error(`${command} is not installed. Install PostgreSQL client tools and retry.`);
  }
  const major = Number((result.stdout || result.stderr).match(/(\d+)(?:\.\d+)?/)?.[1]);
  if (!Number.isInteger(major)) throw new Error(`Could not determine ${command} version.`);
  return major;
}

function commandConnection(databaseUrl) {
  const connection = new URL(databaseUrl);
  const password = decodeURIComponent(connection.password);
  connection.password = "";
  return {
    url: connection.toString(),
    env: password ? { PGPASSWORD: password } : {},
  };
}

async function tableCounts(client) {
  const { rows: tables } = await client.query(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename`
  );
  const counts = {};
  for (const { tablename } of tables) {
    const escaped = tablename.replaceAll('"', '""');
    const { rows } = await client.query(
      `SELECT count(*)::int AS count FROM public."${escaped}"`
    );
    counts[tablename] = rows[0].count;
  }
  return counts;
}

async function schemaInventory(client) {
  const { rows } = await client.query(`
    SELECT object
      FROM (
        SELECT 'relation:' || c.relkind::text || ':' || c.relname AS object
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('S', 'v', 'm')
        UNION ALL
        SELECT 'index:' || tablename || ':' || indexname
          FROM pg_indexes
         WHERE schemaname = 'public'
        UNION ALL
        SELECT 'constraint:' || conrelid::regclass::text || ':' || conname || ':' || contype::text
          FROM pg_constraint
         WHERE connamespace = 'public'::regnamespace
        UNION ALL
        SELECT 'trigger:' || event_object_table || ':' || trigger_name
          FROM information_schema.triggers
         WHERE trigger_schema = 'public'
        UNION ALL
        SELECT 'function:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
      ) inventory
     ORDER BY object
  `);
  return rows.map(({ object }) => object);
}

const sourcePool = new pg.Pool({ connectionString: sourceUrl, max: 1 });
const restorePool = new pg.Pool({ connectionString: restoreUrl, max: 1 });
let sourceClient;

try {
  mkdirSync(dirname(artifact), { recursive: true });
  rmSync(artifact, { force: true });

  sourceClient = await sourcePool.connect();
  const identitySql = `
    SELECT current_database() AS database,
           coalesce(inet_server_addr()::text, 'local') AS address,
           inet_server_port() AS port
  `;
  const { rows: sourceIdentityRows } = await sourceClient.query(identitySql);
  const { rows: restoreIdentityRows } = await restorePool.query(identitySql);
  const sourceIdentity = sourceIdentityRows[0];
  const restoreIdentity = restoreIdentityRows[0];
  if (restoreIdentity.database !== restore.database) {
    throw new Error("Restore connection resolved to an unexpected database.");
  }
  if (
    sourceIdentity.database === restoreIdentity.database &&
    sourceIdentity.address === restoreIdentity.address &&
    sourceIdentity.port === restoreIdentity.port
  ) {
    throw new Error("The restore connection resolves to the source database.");
  }
  const { rows: serverVersionRows } = await sourceClient.query(
    "SHOW server_version_num"
  );
  const serverMajor = Math.trunc(Number(serverVersionRows[0].server_version_num) / 10_000);
  const dumpMajor = commandVersion("pg_dump");
  const restoreMajor = commandVersion("pg_restore");
  if (dumpMajor !== serverMajor || restoreMajor !== serverMajor) {
    throw new Error(
      `PostgreSQL client/server major versions must match for a recovery drill: ` +
        `server=${serverMajor}, pg_dump=${dumpMajor}, pg_restore=${restoreMajor}.`
    );
  }

  await sourceClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const { rows: snapshotRows } = await sourceClient.query(
    "SELECT pg_export_snapshot() AS snapshot"
  );
  const snapshot = snapshotRows[0].snapshot;
  const sourceConnection = commandConnection(sourceUrl);

  console.log(`Creating snapshot-consistent backup from ${source.database}...`);
  run(
    "pg_dump",
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--dbname=${sourceConnection.url}`,
      `--snapshot=${snapshot}`,
      `--file=${artifact}`,
    ],
    sourceUrl,
    sourceConnection.env
  );
  const expectedCounts = await tableCounts(sourceClient);
  const expectedObjects = await schemaInventory(sourceClient);
  await sourceClient.query("COMMIT");
  sourceClient.release();
  sourceClient = undefined;

  console.log(`Resetting disposable target ${restore.database}...`);
  await restorePool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  const restoreConnection = commandConnection(restoreUrl);
  run(
    "pg_restore",
    [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      `--dbname=${restoreConnection.url}`,
      artifact,
    ],
    restoreUrl,
    restoreConnection.env
  );

  const actualCounts = await tableCounts(restorePool);
  const actualObjects = await schemaInventory(restorePool);
  const expectedJson = JSON.stringify(expectedCounts);
  const actualJson = JSON.stringify(actualCounts);
  if (actualJson !== expectedJson) {
    const differences = [...new Set([
      ...Object.keys(expectedCounts),
      ...Object.keys(actualCounts),
    ])]
      .filter((table) => expectedCounts[table] !== actualCounts[table])
      .map(
        (table) =>
          `${table}: expected ${expectedCounts[table] ?? "missing"}, ` +
          `restored ${actualCounts[table] ?? "missing"}`
      );
    throw new Error(`Restore verification failed:\n${differences.join("\n")}`);
  }
  if (JSON.stringify(actualObjects) !== JSON.stringify(expectedObjects)) {
    const missing = expectedObjects.filter((object) => !actualObjects.includes(object));
    const extra = actualObjects.filter((object) => !expectedObjects.includes(object));
    throw new Error(
      "Restored schema inventory differs from the backup snapshot." +
        `\nMissing: ${missing.join(", ") || "none"}` +
        `\nExtra: ${extra.join(", ") || "none"}`
    );
  }

  const { rows: migrationRows } = await restorePool.query(
    "SELECT count(*)::int AS count FROM schema_migrations"
  );
  console.log(
    `Restore verified: ${Object.keys(actualCounts).length} tables, ` +
      `${Object.values(actualCounts).reduce((sum, count) => sum + count, 0)} rows, ` +
      `${actualObjects.length} schema objects, ${migrationRows[0].count} migrations.` +
      `\nBackup artifact: ${artifact}`
  );
} catch (error) {
  if (sourceClient) {
    try {
      await sourceClient.query("ROLLBACK");
    } catch {
      /* the connection is being closed below */
    }
    sourceClient.release();
  }
  throw error;
} finally {
  await Promise.all([sourcePool.end(), restorePool.end()]);
}
