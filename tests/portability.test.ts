import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let studio: typeof import("../lib/studio");
let recipes: typeof import("../lib/recipes");
let portability: typeof import("../lib/portability");
let ownerId: number;
let outsiderId: number;
let sourceSpaceId: string;
let targetSpaceId: string;
let courseId: number;
let sourceRecipeId: string;
let archive: import("../lib/portability").CourseArchive;
let importedCourseId: number;

describe.skipIf(!TEST_DB)("Phase 5 portable course archive", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg"); db = await import("../lib/db");
    spaces = await import("../lib/spaces"); studio = await import("../lib/studio");
    recipes = await import("../lib/recipes"); portability = await import("../lib/portability");
    await pg.ready(); await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("portable-owner@example.test", "Portable Owner", "hash")).id;
    outsiderId = (await db.createUser("portable-outsider@example.test", "Portable Outsider", "hash")).id;
    sourceSpaceId = (await spaces.createSpace(ownerId, { name: "Source Space", type: "private" })).space.id;
    targetSpaceId = (await spaces.createSpace(ownerId, { name: "Clean Target Space", type: "private" })).space.id;
    const source = await studio.createTextSource(ownerId, sourceSpaceId, {
      title: "Opening Procedures",
      kind: "manual",
      content: [{ title: "Opening", text: "Check the alarm, till, and fitting rooms." }],
      provenance: { approvedBy: "Owner", generationRunId: "must-not-export", apiKey: "must-not-export" },
    });
    const recipe = await recipes.createStarterRecipe(ownerId, sourceSpaceId, "onboarding", "space");
    sourceRecipeId = recipe.recipeId;
    const course = await studio.createCourseDraftFromSources(ownerId, sourceSpaceId, {
      title: "Blacksteel Shop Playbook",
      sourceVersionIds: [source.sourceVersionId],
      recipeVersionId: recipe.recipeVersionId,
    });
    courseId = course.courseId;
    await studio.addCourseBlock(ownerId, courseId, {
      moduleKey: "module:opening", moduleTitle: "Open the shop", moduleSummary: "Start safely.",
      lessonKey: "lesson:checklist", lessonTitle: "Opening checklist", modulePosition: 0,
      lessonPosition: 0, blockType: "explanation",
      content: { type: "explanation", heading: "Begin with a check", body: "Follow the approved opening sequence.", intent: "idea", importance: "core", density: "balanced" },
      sourceRefs: [{ sourceVersionId: source.sourceVersionId, locator: { section: "Opening" } }],
    });
    await studio.createBlankCourseDraft(ownerId, targetSpaceId, "Blacksteel Shop Playbook");
    await recipes.createStarterRecipe(ownerId, targetSpaceId, "onboarding", "private");
  });

  afterAll(async () => { await pg?.pool.end(); delete process.env.DATABASE_URL; });

  it("exports a versioned, integrity-protected archive without tenant identity or secret metadata", async () => {
    archive = await portability.exportCourseArchive(ownerId, courseId);
    expect(archive).toMatchObject({
      format: "bookquest.course", schemaVersion: 1,
      payload: { course: { title: "Blacksteel Shop Playbook" }, sources: [{ portableId: "source-1" }], recipe: { portableId: "recipe-1" } },
      integrity: { algorithm: "sha256", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
    expect(archive.payload.blocks).toHaveLength(1);
    expect(archive.payload.blocks[0].sourceRefs[0]).toMatchObject({ sourcePortableId: "source-1" });
    const serialized = JSON.stringify(archive);
    expect(serialized).not.toContain("portable-owner@example.test");
    expect(serialized).not.toContain("must-not-export");
    expect(serialized).not.toContain("sourceVersionId");
    expect(serialized).not.toContain("raw_storage_key");
    await expect(portability.exportCourseArchive(outsiderId, courseId)).rejects.toMatchObject({ reason: "membership_required" });
  });

  it("rejects document tampering and reports source-level tampering before any write", async () => {
    const titleTamper = structuredClone(archive);
    titleTamper.payload.course.title = "Tampered title";
    expect(() => portability.parseCourseArchive(titleTamper)).toThrow(/integrity/i);

    const sourceTamper = structuredClone(archive);
    sourceTamper.payload.sources[0].content = [{ title: "Opening", text: "Changed after export" }];
    const { integrity: _old, ...core } = sourceTamper;
    sourceTamper.integrity.sha256 = portability.portableSha256(core);
    const before = Number((await pg.one<{ count: number }>("SELECT COUNT(*)::int AS count FROM courses WHERE owning_space_id=$1", [targetSpaceId]))!.count);
    const report = await portability.analyzeCourseArchive(ownerId, targetSpaceId, sourceTamper);
    expect(report.canImport).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "source_hash_mismatch", severity: "error" }));
    await expect(portability.importCourseArchive(ownerId, targetSpaceId, sourceTamper)).rejects.toMatchObject({ status: 409 });
    const after = Number((await pg.one<{ count: number }>("SELECT COUNT(*)::int AS count FROM courses WHERE owning_space_id=$1", [targetSpaceId]))!.count);
    expect(after).toBe(before);
  });

  it("rejects installation-specific and missing source references before any write", async () => {
    for (const sourceRefs of [
      [{ sourceVersionId: "target-installation-id" }],
      [{ sourcePortableId: "source-missing" }],
    ]) {
      const citationTamper = structuredClone(archive);
      citationTamper.payload.blocks[0].sourceRefs = sourceRefs;
      const { integrity: _old, ...core } = citationTamper;
      citationTamper.integrity.sha256 = portability.portableSha256(core);
      const before = Number((await pg.one<{ count: number }>("SELECT COUNT(*)::int AS count FROM courses WHERE owning_space_id=$1", [targetSpaceId]))!.count);
      const report = await portability.analyzeCourseArchive(ownerId, targetSpaceId, citationTamper);
      expect(report.canImport).toBe(false);
      expect(report.issues).toContainEqual(expect.objectContaining({ severity: "error" }));
      await expect(portability.importCourseArchive(ownerId, targetSpaceId, citationTamper)).rejects.toMatchObject({ status: 409 });
      expect(Number((await pg.one<{ count: number }>("SELECT COUNT(*)::int AS count FROM courses WHERE owning_space_id=$1", [targetSpaceId]))!.count)).toBe(before);
    }
  });

  it("round-trips a standalone recipe as a private draft and blocks replay", async () => {
    const recipeArchive = await portability.exportRecipeArchive(ownerId, sourceRecipeId);
    expect(recipeArchive).toMatchObject({
      format: "bookquest.recipe",
      schemaVersion: 1,
      payload: { recipe: { title: "Team Onboarding", visibility: "space" } },
      integrity: { algorithm: "sha256", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
    expect(JSON.stringify(recipeArchive)).not.toContain(sourceSpaceId);
    await expect(portability.exportRecipeArchive(outsiderId, sourceRecipeId))
      .rejects.toMatchObject({ reason: "membership_required" });

    const tampered = structuredClone(recipeArchive);
    tampered.payload.recipe.definition.objectives[0] = "Changed after export";
    expect(() => portability.parseRecipeArchive(tampered)).toThrow(/integrity/i);

    const innerTamper = structuredClone(recipeArchive);
    innerTamper.payload.recipe.definition.objectives[0] = "Changed and resealed";
    const { integrity: _oldIntegrity, ...tamperedCore } = innerTamper;
    innerTamper.integrity.sha256 = portability.portableSha256(tamperedCore);
    const tamperReport = await portability.analyzeRecipeArchive(ownerId, targetSpaceId, innerTamper);
    expect(tamperReport.canImport).toBe(false);
    expect(tamperReport.issues).toContainEqual(expect.objectContaining({ code: "recipe_hash_mismatch", severity: "error" }));

    const report = await portability.analyzeRecipeArchive(ownerId, targetSpaceId, recipeArchive);
    expect(report).toMatchObject({ canImport: true, proposedTitle: "Team Onboarding (imported)" });
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "title_conflict", severity: "warning" }));
    const imported = await portability.importRecipeArchive(ownerId, targetSpaceId, recipeArchive);
    const restored = await pg.one<{ title: string; visibility: string; status: string; objectives_json: string }>(
      `SELECT recipe.title,recipe.visibility,version.status,version.objectives_json
       FROM recipes recipe JOIN recipe_versions version ON version.recipe_id=recipe.id
       WHERE version.id=$1`,
      [imported.recipeVersionId]
    );
    expect(restored).toMatchObject({ title: "Team Onboarding (imported)", visibility: "private", status: "draft" });
    expect(JSON.parse(restored!.objectives_json)).toEqual(recipeArchive.payload.recipe.definition.objectives);

    const roundTrip = await portability.exportRecipeArchive(ownerId, imported.recipeId);
    expect(roundTrip.payload.recipe.definition).toEqual(recipeArchive.payload.recipe.definition);
    const replay = await portability.analyzeRecipeArchive(ownerId, targetSpaceId, recipeArchive);
    expect(replay.canImport).toBe(false);
    expect(replay.issues).toContainEqual(expect.objectContaining({ code: "archive_already_imported" }));
    await expect(portability.importRecipeArchive(ownerId, targetSpaceId, recipeArchive))
      .rejects.toMatchObject({ status: 409 });
  });

  it("dry-runs tenant authorization, counts and deterministic conflict reporting without writes", async () => {
    const before = Number((await pg.one<{ count: number }>("SELECT COUNT(*)::int AS count FROM courses WHERE owning_space_id=$1", [targetSpaceId]))!.count);
    const report = await portability.analyzeCourseArchive(ownerId, targetSpaceId, archive);
    expect(report).toMatchObject({ canImport: true, proposedTitle: "Blacksteel Shop Playbook (imported)", counts: { sources: 1, blocks: 1, modules: 1, lessons: 1, recipe: 1 } });
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "title_conflict", severity: "warning" }));
    expect(Number((await pg.one<{ count: number }>("SELECT COUNT(*)::int AS count FROM courses WHERE owning_space_id=$1", [targetSpaceId]))!.count)).toBe(before);
    await expect(portability.analyzeCourseArchive(outsiderId, targetSpaceId, archive)).rejects.toMatchObject({ reason: "membership_required" });
  });

  it("restores sources, recipe and blocks as a private draft with remapped references and no learner records", async () => {
    const imported = await portability.importCourseArchive(ownerId, targetSpaceId, archive);
    importedCourseId = imported.courseId;
    expect(imported.report.canImport).toBe(true);
    const course = await db.getCourse(importedCourseId);
    expect(course).toMatchObject({ title: "Blacksteel Shop Playbook (imported)", owning_space_id: targetSpaceId, published: 0, authoring_status: "draft" });
    const importedStudio = await studio.getCourseStudio(ownerId, importedCourseId);
    expect(importedStudio.sources).toHaveLength(1);
    expect(importedStudio.blocks).toHaveLength(1);
    expect(importedStudio.blocks[0]).toMatchObject({ blockType: "explanation", editOrigin: "imported", content: { heading: "Begin with a check" } });
    expect(importedStudio.blocks[0].sourceRefs[0]).toMatchObject({ sourceVersionId: importedStudio.sources[0].source_version_id });
    expect(importedStudio.version.recipe_version_id).toEqual(expect.any(String));
    const recipe = await pg.one<{ visibility: string }>(
      `SELECT recipe.visibility FROM recipes recipe JOIN recipe_versions version ON version.recipe_id=recipe.id WHERE version.id=$1`,
      [importedStudio.version.recipe_version_id]);
    expect(recipe?.visibility).toBe("private");
    for (const table of ["enrollments", "progress", "certificates"]) {
      const row = await pg.one<{ count: number }>(
        table === "progress" ? `SELECT COUNT(*)::int AS count FROM progress p JOIN lessons l ON l.id=p.lesson_id JOIN modules m ON m.id=l.module_id WHERE m.course_id=$1`
          : `SELECT COUNT(*)::int AS count FROM ${table} WHERE course_id=$1`, [importedCourseId]);
      expect(Number(row?.count)).toBe(0);
    }
    const roundTrip = await portability.exportCourseArchive(ownerId, importedCourseId);
    expect(roundTrip.payload.sources[0].contentSha256).toBe(archive.payload.sources[0].contentSha256);
    expect(roundTrip.payload.blocks[0].content).toEqual(archive.payload.blocks[0].content);
  });

  it("blocks duplicate archive replay inside the target Space", async () => {
    const report = await portability.analyzeCourseArchive(ownerId, targetSpaceId, archive);
    expect(report.canImport).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "archive_already_imported" }));
    await expect(portability.importCourseArchive(ownerId, targetSpaceId, archive)).rejects.toMatchObject({ status: 409 });
    expect(Number((await pg.one<{ count: number }>("SELECT COUNT(*)::int AS count FROM portable_course_imports WHERE target_space_id=$1", [targetSpaceId]))!.count)).toBe(1);
  });
});
