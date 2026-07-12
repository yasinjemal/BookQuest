import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // The database integration tests (skipped unless TEST_DATABASE_URL is set)
    // share one scratch database and reset it in `beforeAll` — the upgrade test
    // even drops and recreates `public`. So test *files* must not run
    // concurrently against it. Pure-logic files are unaffected and stay fast.
    fileParallelism: false,
  },
});
