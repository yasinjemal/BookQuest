import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../lib/pg", () => ({ withCourseGenerationLock: vi.fn() }));
vi.mock("../lib/generator", () => ({ runGenerationUntilBudget: vi.fn() }));
vi.mock("../lib/db", () => ({
  StaleGenerationRunError: class StaleGenerationRunError extends Error {},
}));

import { resolveBaseUrl } from "../lib/generation";

afterEach(() => {
  delete process.env.APP_URL;
  delete process.env.VERCEL_URL;
});

describe("generation recovery routing", () => {
  it("prefers the trusted exact deployment over stale configuration", () => {
    process.env.APP_URL = "https://stale-deployment.example";
    process.env.VERCEL_URL = "preview-deployment.vercel.app";

    const request = new NextRequest(
      "https://book-quest-silk.vercel.app/api/courses"
    );
    expect(resolveBaseUrl(request)).toBe(
      "https://preview-deployment.vercel.app"
    );
  });

  it("uses the request origin for local development", () => {
    const request = new NextRequest("http://localhost:3000/api/courses");
    expect(resolveBaseUrl(request)).toBe("http://localhost:3000");
  });
});
