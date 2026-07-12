// One-shot schema migration / connectivity check against Neon Postgres.
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
const { rows } = await pool.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
);
console.log(`Schema ready. ${rows[0].n} tables in public.`);
await pool.end();
