import { spawn, type ChildProcess } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function collect(child: ChildProcess): Promise<ChildResult> {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
  child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("database initialization", () => {
  it(
    "serializes concurrent schema migrations from separate processes",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "bookquest-db-race-"));
      const dataDir = path.join(root, "data");
      const barrierDir = path.join(root, "barrier");
      await mkdir(barrierDir, { recursive: true });
      const workerCount = 4;
      const jitiCli = path.join(
        process.cwd(),
        "node_modules",
        "jiti",
        "lib",
        "jiti-cli.mjs"
      );
      const helper = path.join(
        process.cwd(),
        "tests",
        "helpers",
        "concurrent-db-init.ts"
      );
      const children: ChildProcess[] = [];

      try {
        const results: Promise<ChildResult>[] = [];
        for (let index = 0; index < workerCount; index++) {
          const child = spawn(process.execPath, [jitiCli, helper], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              BOOKQUEST_DATA_DIR: dataDir,
              BOOKQUEST_DB_BARRIER_DIR: barrierDir,
              BOOKQUEST_DB_WORKER_ID: String(index),
            },
            stdio: ["ignore", "pipe", "pipe"],
          });
          children.push(child);
          results.push(collect(child));
        }

        const readyDeadline = Date.now() + 15_000;
        while (true) {
          const ready = (await readdir(barrierDir)).filter((name) =>
            name.startsWith("ready-")
          );
          if (ready.length === workerCount) break;
          if (Date.now() > readyDeadline) {
            throw new Error(`Only ${ready.length}/${workerCount} workers became ready`);
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await writeFile(path.join(barrierDir, "start"), "start");

        const ownerDeadline = Date.now() + 15_000;
        let ownerMarkers: string[] = [];
        while (ownerMarkers.length === 0) {
          ownerMarkers = (await readdir(barrierDir)).filter((name) =>
            name.startsWith("owner-read-")
          );
          if (Date.now() > ownerDeadline) {
            throw new Error("No worker reached the owner_id schema check");
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const firstMarker = JSON.parse(
          await readFile(path.join(barrierDir, ownerMarkers[0]), "utf8")
        ) as { inTransaction: boolean };
        if (!firstMarker.inTransaction) {
          while (ownerMarkers.length !== workerCount) {
            ownerMarkers = (await readdir(barrierDir)).filter((name) =>
              name.startsWith("owner-read-")
            );
            if (Date.now() > ownerDeadline) {
              throw new Error(
                `Only ${ownerMarkers.length}/${workerCount} workers reached the owner_id check`
              );
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        await writeFile(path.join(barrierDir, "owner-go"), "go");

        const settled = await Promise.all(results);
        const failures = settled.filter((result) => result.code !== 0);
        expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
        expect(firstMarker.inTransaction).toBe(true);

        const database = new Database(path.join(dataDir, "app.db"), {
          readonly: true,
        });
        try {
          const columns = database.pragma("table_info(courses)") as {
            name: string;
          }[];
          expect(columns.filter((column) => column.name === "owner_id")).toHaveLength(1);
          expect(database.pragma("integrity_check")).toEqual([
            { integrity_check: "ok" },
          ]);
          expect(database.pragma("foreign_key_check")).toEqual([]);
        } finally {
          database.close();
        }
      } finally {
        for (const child of children) {
          if (child.exitCode === null) child.kill();
        }
        await rm(root, { recursive: true, force: true });
      }
    },
    30_000
  );
});
