import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

interface StatementLike {
  source: string;
  database: { inTransaction: boolean };
}

async function main() {
  const barrierDir = process.env.BOOKQUEST_DB_BARRIER_DIR;
  const workerId = process.env.BOOKQUEST_DB_WORKER_ID;
  if (!barrierDir || !workerId) throw new Error("Missing concurrency test settings");

  fs.writeFileSync(path.join(barrierDir, `ready-${workerId}`), "ready");
  const startFile = path.join(barrierDir, "start");
  const deadline = Date.now() + 15_000;
  while (!fs.existsSync(startFile)) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for test barrier");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }

  // Pause immediately after the process observes owner_id as missing. Without
  // BEGIN IMMEDIATE, every process reaches this point and then races the ALTER.
  // With the fix, the first process owns the write lock and later processes do
  // not inspect the schema until the first migration commits.
  const probe = new Database(":memory:");
  const statementPrototype = Object.getPrototypeOf(
    probe.prepare("PRAGMA table_info(courses)")
  ) as {
    all: (this: StatementLike, ...args: unknown[]) => unknown[];
  };
  probe.close();
  const originalAll = statementPrototype.all;
  statementPrototype.all = function (this: StatementLike, ...args: unknown[]) {
    const rows = originalAll.apply(this, args) as { name?: string }[];
    if (
      this.source === "PRAGMA table_info(courses)" &&
      !rows.some((row) => row.name === "owner_id")
    ) {
      fs.writeFileSync(
        path.join(barrierDir, `owner-read-${workerId}.json`),
        JSON.stringify({ inTransaction: this.database.inTransaction })
      );
      const ownerGo = path.join(barrierDir, "owner-go");
      const ownerDeadline = Date.now() + 15_000;
      while (!fs.existsSync(ownerGo)) {
        if (Date.now() > ownerDeadline) {
          throw new Error("Timed out at owner_id migration barrier");
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    return rows;
  };

  const { db } = await import("../../lib/db");
  db.prepare("SELECT 1").get();
  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
