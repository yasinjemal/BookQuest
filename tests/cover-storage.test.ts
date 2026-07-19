import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let assertCoverStorageCapacity: typeof import("../lib/cover-images").assertCoverStorageCapacity;
let pool: typeof import("../lib/pg").pool;
let portability: typeof import("../lib/portability");
let deleteControlledCourseVersionChildren: typeof import("../lib/course-history-deletion").deleteControlledCourseVersionChildren;

describe("cover storage quotas", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = "postgres://bookquest:bookquest@127.0.0.1:1/bookquest-test";
    ({ assertCoverStorageCapacity } = await import("../lib/cover-images"));
    ({ pool } = await import("../lib/pg"));
    portability = await import("../lib/portability");
    ({ deleteControlledCourseVersionChildren } = await import("../lib/course-history-deletion"));
  });

  afterAll(async () => {
    await pool.end();
    delete process.env.DATABASE_URL;
  });

  it("serializes quota checks and rejects retained owner history beyond 50 MB", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ bytes: String(50 * 1024 * 1024 + 1) }] })
      .mockResolvedValueOnce({ rows: [{ bytes: "0" }] });
    await expect(assertCoverStorageCapacity(
      { query } as never,
      { ownerId: 7, spaceId: "space-7" }
    )).rejects.toMatchObject({ status: 422 });
    expect(query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[2][0]).toContain("course_versions");
  });

  it("accepts a post-replacement retained total inside both limits", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ bytes: String(49 * 1024 * 1024) }] })
      .mockResolvedValueOnce({ rows: [{ bytes: String(49 * 1024 * 1024) }] });
    await expect(assertCoverStorageCapacity(
      { query } as never,
      { ownerId: 8, spaceId: "space-8" }
    )).resolves.toBeUndefined();
  });

  it("exports schema v2 while continuing to parse integrity-sealed v1 archives", () => {
    expect(portability.COURSE_ARCHIVE_SCHEMA_VERSION).toBe(2);
    const core = {
      format: "bookquest.course" as const,
      schemaVersion: 1 as const,
      archiveId: "urn:bookquest:course:legacy:v1",
      exportedAt: "2026-07-19T00:00:00.000Z",
      payload: {
        course: {
          title: "Legacy course",
          description: "",
          category: "General",
          appearance: {
            template: "storybook" as const,
            worldTheme: "forest" as const,
            typography: "editorial" as const,
            surface: "parchment" as const,
            accent: "lime" as const,
            atmosphere: "full" as const,
            readingWidth: "balanced" as const,
          },
          sourceVersionNumber: 1,
          sourceLifecycle: "draft" as const,
        },
        sources: [],
        recipe: null,
        blocks: [],
      },
    };
    const archive = {
      ...core,
      integrity: { algorithm: "sha256" as const, sha256: portability.portableSha256(core) },
    };
    expect(portability.parseCourseArchive(archive).schemaVersion).toBe(1);
  });

  it("clears only unpublished child history while parents remain verifiable", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await deleteControlledCourseVersionChildren({ query } as never, 17, "unpublished");
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0][0]).toContain("FOR UPDATE OF version");
    expect(query.mock.calls[1][0]).toContain("FOR UPDATE OF block");
    expect(query.mock.calls[2][0]).toContain("USING course_blocks block, course_versions version");
    expect(query.mock.calls[3][0]).toContain("USING course_versions version");
    for (const call of query.mock.calls) expect(call[1]).toEqual([17, true]);
  });
});
