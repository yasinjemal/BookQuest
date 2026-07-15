import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Phase 5 sovereign deployment surface", () => {
  it("advertises a safe public capability state without configuration secrets", () => {
    const route = source("app/api/capabilities/route.ts");
    expect(route).toContain("getAiAvailability");
    expect(route).toContain("manualAuthoring: true");
    expect(route).toContain("sourceOnlyUpload: true");
    expect(route).toContain("portableImport: true");
    expect(route).not.toContain("BOOKQUEST_AI_API_KEY");
    expect(route).not.toContain("ANTHROPIC_API_KEY");
    expect(route).not.toContain("baseUrl:");
  });

  it("blocks AI jobs before credits or retry state while preserving manual upload", () => {
    const upload = source("app/api/upload/route.ts");
    const retry = source("app/api/courses/[id]/retry/route.ts");
    const regenerate = source("app/api/studio/courses/[id]/regenerate/route.ts");
    const practice = source("app/api/practice/session/route.ts");
    expect(upload.indexOf("const ai = getAiAvailability()")).toBeLessThan(
      upload.indexOf("if (!isAdmin) await adjustCredits")
    );
    expect(upload).toContain('form.get("generate") !== "false"');
    expect(upload).toContain('mode: "manual"');
    expect(retry.indexOf("const ai = getAiAvailability()")).toBeLessThan(
      retry.indexOf("const generationRunId = await prepareCourseRetry")
    );
    expect(regenerate).toContain("aiUnavailablePayload(ai)");
    expect(practice).toContain("aiUnavailablePayload(ai)");
  });

  it("turns off the Create toggle when the installation disables AI", () => {
    const create = source("app/create/page.tsx");
    const home = source("app/page.tsx");
    expect(create).toContain('fetch("/api/capabilities")');
    expect(create).toContain("if (!data.ai.enabled) setGenerateWithAi(false)");
    expect(create).toContain("disabled={aiCapability?.enabled === false}");
    expect(create).toContain("Source-only upload remains available");
    expect(home).toContain('fetch("/api/capabilities")');
    expect(home).toContain("Quick uploads open as editable source-only drafts");
    expect(home).toContain("Edit manually");
  });

  it("documents install, upgrade, no-AI, isolation and least-privilege boundaries", () => {
    const hosting = source("docs/SELF_HOSTING_AND_AI.md");
    const integrations = source("docs/PHASE_4_PLATFORM_INTEGRATIONS.md");
    expect(hosting).toContain("## Upgrade procedure");
    expect(hosting).toContain("## Isolated and air-gapped evaluation");
    expect(hosting).toContain("BOOKQUEST_AI_PROVIDER=disabled");
    expect(hosting).toContain("Never point tests at production");
    expect(integrations).toContain("deny-by-default");
    expect(integrations).toContain("Executable extensions are prohibited");
    expect(integrations).toContain("timingSafeEqual");
  });
});
