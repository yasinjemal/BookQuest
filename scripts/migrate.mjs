// Applies any pending schema migrations and reports the ledger. Runs the exact
// same `ready()` the app uses, so it is a connectivity check too.
// Usage: node scripts/migrate.mjs
import { readFileSync } from "fs";
import { createJiti } from "jiti";

// Standalone scripts don't get Next's automatic .env.local loading.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.local — rely on the real environment */
}

import { pathToFileURL } from "url";
import { resolve } from "path";

const jiti = createJiti(import.meta.url);
const { ready, pool } = await jiti.import(
  pathToFileURL(resolve(process.cwd(), "lib/pg.ts")).href
);

await ready();

const migrations = await pool.query(
  "SELECT id, name, applied_at FROM schema_migrations ORDER BY id"
);
const { rows: tableRows } = await pool.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
);

console.log(`Schema ready. ${tableRows[0].n} tables in public.`);
console.log(`Applied migrations (${migrations.rowCount}):`);
for (const m of migrations.rows) {
  console.log(`  ${String(m.id).padStart(4, "0")}  ${m.name}  (${m.applied_at})`);
}
await pool.end();
