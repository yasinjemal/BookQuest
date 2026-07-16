import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../lib/pg", () => ({ withCourseGenerationLock: vi.fn() }));
vi.mock("../lib/generator", () => ({ runGenerationUntilBudget: vi.fn() }));
vi.mock("../lib/db", () => ({
  StaleGenerationRunError: class StaleGenerationRunError extends Error {},
}));

import {
  internalGenerationHeaders,
  resolveBaseUrl,
} from "../lib/generation";

afterEach(() => {
  delete process.env.APP_URL;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_TARGET_ENV;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  delete process.env.GENERATION_SECRET;
});

describe("generation recovery routing", () => {
  it("uses the public project domain for production worker handoffs", () => {
    process.env.VERCEL_TARGET_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "book-quest-silk.vercel.app";
    process.env.VERCEL_URL = "protected-deployment.vercel.app";

    const request = new NextRequest(
      "https://book-quest-silk.vercel.app/api/courses"
    );
    expect(resolveBaseUrl(request)).toBe(
      "https://book-quest-silk.vercel.app"
    );
  });

  it("keeps preview workers on the exact deployment", () => {
    process.env.VERCEL_TARGET_ENV = "preview";
    process.env.APP_URL = "https://stale-deployment.example";
    process.env.VERCEL_URL = "preview-deployment.vercel.app";

    const request = new NextRequest(
      "https://book-quest-silk.vercel.app/api/courses"
    );
    expect(resolveBaseUrl(request)).toBe(
      "https://preview-deployment.vercel.app"
    );
  });

  it("authenticates self-invocations through Vercel Deployment Protection", () => {
    process.env.GENERATION_SECRET = "worker-secret";
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "protection-secret";

    expect(internalGenerationHeaders()).toEqual({
      "content-type": "application/json",
      "x-generation-secret": "worker-secret",
      "x-vercel-protection-bypass": "protection-secret",
    });
  });

  it("uses the request origin for local development", () => {
    const request = new NextRequest("http://localhost:3000/api/courses");
    expect(resolveBaseUrl(request)).toBe("http://localhost:3000");
  });
});
