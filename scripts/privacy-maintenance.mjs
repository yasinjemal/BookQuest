// Executes due account erasures and clears expired ephemeral security data.
// Safe to run repeatedly from a scheduler; due accounts are row-locked and an
// erased account cannot be processed twice.
// Usage: node scripts/privacy-maintenance.mjs
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { createJiti } from "jiti";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.local - rely on the real environment */
}

const jiti = createJiti(import.meta.url);
const { processDueAccountErasures, purgeExpiredOperationalData } =
  await jiti.import(
    pathToFileURL(resolve(process.cwd(), "lib/privacy.ts")).href
  );
const { pool } = await jiti.import(
  pathToFileURL(resolve(process.cwd(), "lib/pg.ts")).href
);

try {
  const erased = await processDueAccountErasures();
  const purged = await purgeExpiredOperationalData();
  console.log(`Erased ${erased.length} due account(s).`);
  console.log(
    `Purged ${purged.sessions} sessions, ${purged.tokens} tokens, ` +
      `${purged.rate_limits} rate-limit buckets and ` +
      `${purged.passport_access} expired Passport access events.`
  );
} finally {
  await pool.end();
}
