// Reconcile (and optionally rebuild) the concept-mastery projection against the
// immutable learning-events ledger.
//
// Usage:
//   node scripts/reconcile.mjs                 # report drift (read-only)
//   node scripts/reconcile.mjs --rebuild       # rebuild from the ledger, then verify
//   node scripts/reconcile.mjs --course=42     # scope to one course
//
// Exit code is non-zero when drift remains, so it can gate a deploy or feed
// monitoring. Reads DATABASE_URL from .env.local when present.
import { readFileSync } from "fs";
import { createJiti } from "jiti";
import { pathToFileURL } from "url";
import { resolve } from "path";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.local — rely on the real environment */
}

const args = process.argv.slice(2);
const rebuild = args.includes("--rebuild");
const courseArg = args.find((a) => a.startsWith("--course="));
const scope = courseArg ? { courseId: Number(courseArg.split("=")[1]) } : {};

const jiti = createJiti(import.meta.url);
const { reconcileConceptMastery, rebuildConceptMastery } = await jiti.import(
  pathToFileURL(resolve(process.cwd(), "lib/projection.ts")).href
);
const { pool } = await jiti.import(
  pathToFileURL(resolve(process.cwd(), "lib/pg.ts")).href
);

const scopeLabel = scope.courseId ? `course ${scope.courseId}` : "all courses";

function printReport(label, report) {
  console.log(`\n${label} (${scopeLabel}):`);
  console.log(`  groups scanned:   ${report.scanned}`);
  console.log(`  projection rows:  ${report.projectionRows}`);
  console.log(`  matched:          ${report.matched}`);
  console.log(`  missing:          ${report.missing}`);
  console.log(`  mismatched:       ${report.mismatched}`);
  console.log(`  orphaned:         ${report.orphaned}`);
  for (const m of report.mismatches.slice(0, 20)) {
    const detail =
      m.kind === "orphan"
        ? `actual=${JSON.stringify(m.actual)}`
        : m.kind === "missing"
          ? `expected=${JSON.stringify(m.expected)}`
          : `expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`;
    console.log(`   - ${m.kind} user=${m.userId} course=${m.courseId} "${m.concept}" ${detail}`);
  }
}

try {
  const before = await reconcileConceptMastery(scope);
  printReport("Reconciliation", before);

  if (rebuild) {
    const result = await rebuildConceptMastery(scope);
    console.log(
      `\nRebuilt ${scopeLabel}: deleted ${result.deletedRows}, wrote ${result.rebuiltRows} rows.`
    );
    const after = await reconcileConceptMastery(scope);
    printReport("Post-rebuild reconciliation", after);
    process.exitCode = after.ok ? 0 : 1;
  } else {
    process.exitCode = before.ok ? 0 : 1;
  }
} finally {
  await pool.end();
}
