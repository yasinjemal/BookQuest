import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  const url = new URL(`../${path}`, import.meta.url);
  expect(existsSync(url), `Expected ${path} to exist`).toBe(true);
  return readFileSync(url, "utf8");
}

describe("Reading Room product contract", () => {
  it("keeps the book collection, metadata, search, progress, and unit APIs authenticated", () => {
    const collection = source("app/api/books/route.ts");
    const detail = source("app/api/books/[id]/route.ts");
    const unit = source("app/api/books/[id]/units/[index]/route.ts");

    for (const route of [collection, detail, unit]) {
      expect(route).toContain("requireUser");
      expect(route).toContain("private, no-store");
    }
    expect(collection).toContain("listOwnedReadingEditions");
    expect(detail).toContain("getOwnedReadingEditionMetadata");
    expect(detail).toContain("searchOwnedReadingEdition");
    expect(detail).toContain("saveReadingProgress");
    expect(unit).toContain("getOwnedReadingUnit");
  });

  it("does not introduce paid generation into Reading Room endpoints", () => {
    const routes = [
      source("app/api/books/route.ts"),
      source("app/api/books/[id]/route.ts"),
      source("app/api/books/[id]/units/[index]/route.ts"),
    ].join("\n");

    for (const paidPath of [
      "ai-provider",
      "ai-budget",
      "createBudgetedMessage",
      "runAndChain",
      "runSummaryAndChain",
    ]) {
      expect(routes).not.toContain(paidPath);
    }
  });

  it("ships a separate Books library and immersive book reader", () => {
    const library = source("app/books/page.tsx");
    const bookPage = source("app/book/[id]/page.tsx");
    const reader = source("components/ReadingEditionReader.tsx");
    const shell = source("components/AppShell.tsx");

    expect(library).toContain("/api/books");
    expect(library).toContain("/book/");
    expect(bookPage).toContain("ReadingEditionReader");
    expect(reader).toContain("/api/books/");
    expect(reader).toContain("/units/");
    expect(reader).toContain('method: "PATCH"');
    expect(reader).toContain("CourseAppearanceFrame");
    expect(reader).toContain('role="progressbar"');
    expect(reader).toMatch(/Contents|Table of contents/i);
    expect(shell).toContain('href: "/books"');
    expect(shell).toContain('"/book/"');
  });

  it("offers full-book creation with explicit zero-AI copy and a book destination", () => {
    const create = source("app/create/page.tsx");
    const upload = source("app/api/upload/route.ts");

    expect(create).toContain('id: "book"');
    expect(create).toMatch(/title:\s*"(?:Full book[^"]*|Reading [Ee]dition)"/);
    expect(create).toMatch(/no ai/i);
    expect(create).toMatch(/no credit|0 credits?/i);
    expect(upload).toContain("resolveCreationOutput");
    expect(upload).toContain("createReadingEdition");
    expect(upload).toContain("`/book/${createdReadingEdition.id}`");
  });
});
