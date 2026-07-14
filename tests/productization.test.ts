import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("public-launch productization contract", () => {
  it("states the document-to-course promise and sends verified creators to first-course onboarding", () => {
    const home = source("app/page.tsx");
    const verification = source("components/VerifyEmailClient.tsx");

    expect(home).toContain(
      "Upload a book, PDF, notes, or training document. Turn it into an interactive course you can edit, study, and share.",
    );
    expect(home).toContain("Create your first course");
    expect(verification).toContain('href="/create?welcome=1"');
    expect(verification).toContain("Create my first course");
  });

  it("keeps document upload primary while preserving optional creation paths", () => {
    const create = source("app/create/page.tsx");

    expect(create).toContain("Turn your document into a course.");
    expect(create).toContain("The fastest way to begin");
    expect(create).toContain("More ways to create");
    expect(create).toContain('creationMethods.filter((method) => method.id !== "ai")');
    expect(create).toContain("Private by default");
    expect(create).toContain("You choose when to share");
  });

  it("places interoperability controls behind advanced disclosure", () => {
    const studio = source("app/studio/[id]/page.tsx");
    const space = source("app/spaces/[id]/page.tsx");

    expect(studio).toContain("Advanced assessment exchange");
    expect(space).toContain("Advanced &amp; developer settings");
    expect(space).toContain("Normal course creation, teaching, and sharing do not need them.");
  });
});
