import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
let pg: typeof import("../lib/pg");
let db: typeof import("../lib/db");
let spaces: typeof import("../lib/spaces");
let recipes: typeof import("../lib/recipes");
let studio: typeof import("../lib/studio");
let ownerId: number;
let otherId: number;
let sourceSpaceId: string;
let targetSpaceId: string;
let recipeId: string;
let recipeVersionId: string;

describe.skipIf(!TEST_DB)("Phase 2 versioned recipes", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    pg = await import("../lib/pg");
    db = await import("../lib/db");
    spaces = await import("../lib/spaces");
    recipes = await import("../lib/recipes");
    studio = await import("../lib/studio");
    await pg.ready();
    await pg.q("TRUNCATE users RESTART IDENTITY CASCADE");
    ownerId = (await db.createUser("recipe-owner@example.test", "Recipe Owner", "hash")).id;
    otherId = (await db.createUser("recipe-user@example.test", "Recipe User", "hash")).id;
    sourceSpaceId = (await spaces.createSpace(ownerId, { name: "Recipe Source", type: "private" })).space.id;
    targetSpaceId = (await spaces.createSpace(otherId, { name: "Recipe Target", type: "private" })).space.id;
  });

  afterAll(async () => {
    await pg?.pool.end();
    delete process.env.DATABASE_URL;
  });

  it("ships ten accessible starter contracts and saves one independently", async () => {
    expect(recipes.STARTER_RECIPES).toHaveLength(10);
    expect(recipes.STARTER_RECIPES.every((starter) =>
      starter.definition.delivery.offline &&
      starter.definition.accessibility.wcag === "2.2-AA" &&
      starter.definition.safetyBoundaries.length > 0
    )).toBe(true);
    const created = await recipes.createStarterRecipe(ownerId, sourceSpaceId, "safety", "public");
    recipeId = created.recipeId;
    recipeVersionId = created.recipeVersionId;
    expect(await recipes.listRecipes(ownerId, sourceSpaceId)).toHaveLength(1);
    await expect(recipes.listRecipes(otherId, sourceSpaceId)).rejects.toMatchObject({
      reason: "membership_required",
    });
  });

  it("publishes immutable versions and revises by appending", async () => {
    await recipes.publishRecipe(ownerId, recipeId);
    await expect(pg.q(
      "UPDATE recipe_versions SET tone = 'rewritten' WHERE id = $1",
      [recipeVersionId]
    )).rejects.toThrow(/immutable/i);
    const starter = recipes.STARTER_RECIPES.find((item) => item.id === "safety")!;
    const revision = await recipes.reviseRecipe(ownerId, recipeId, {
      definition: { ...starter.definition, durationMinutes: 45 },
    });
    expect(revision.version).toBe(2);
    const versions = await pg.many<{ version: number; status: string }>(
      "SELECT version, status FROM recipe_versions WHERE recipe_id = $1 ORDER BY version",
      [recipeId]
    );
    expect(versions).toEqual([{ version: 1, status: "published" }, { version: 2, status: "draft" }]);
  });

  it("forks public recipes with lineage and attaches an exact recipe version to a course", async () => {
    const fork = await recipes.forkRecipe(otherId, targetSpaceId, recipeId);
    expect(fork).toMatchObject({ version: 1, forkedFromRecipeId: recipeId });
    const lineage = await pg.one<{ forked_from_recipe_id: string; forked_from_version: number }>(
      "SELECT forked_from_recipe_id, forked_from_version FROM recipes WHERE id = $1",
      [fork.recipeId]
    );
    expect(lineage).toEqual({ forked_from_recipe_id: recipeId, forked_from_version: 2 });
    const course = await studio.createBlankCourseDraft(otherId, targetSpaceId, "Recipe Course", fork.recipeVersionId);
    expect(await pg.one<{ recipe_version_id: string }>(
      "SELECT recipe_version_id FROM course_versions WHERE id = $1",
      [course.courseVersionId]
    )).toEqual({ recipe_version_id: fork.recipeVersionId });
  });
});
