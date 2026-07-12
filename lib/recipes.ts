import crypto from "crypto";
import { pool, tx, type Queryable } from "./pg";
import { authorizeStoredMembership } from "./spaces";
import { StudioConflictError } from "./studio";

export type RecipeVisibility = "private" | "space" | "unlisted" | "public";
export interface RecipeDefinition {
  audience: Record<string, unknown>;
  objectives: string[];
  difficulty: string;
  durationMinutes: number;
  lessonSizeMinutes: number;
  teachingStyle: string;
  tone: string;
  language: string;
  readingLevel: string;
  blockMix: Record<string, number>;
  assessment: Record<string, unknown>;
  completionRule: Record<string, unknown>;
  credential: Record<string, unknown>;
  expiry: Record<string, unknown>;
  delivery: Record<string, unknown>;
  accessibility: Record<string, unknown>;
  sourceTracePolicy: "required" | "recommended" | "manual_only";
  safetyBoundaries: string[];
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
};
const stable = (value: unknown) => JSON.stringify(canonical(value));
const contentHash = (value: unknown) => crypto.createHash("sha256").update(stable(value)).digest("hex");

const makeStarter = (
  id: string,
  title: string,
  audience: string,
  style: string,
  blocks: Record<string, number>,
  assessment: Record<string, unknown>,
  boundary: string
) => ({
  id,
  title,
  definition: {
    audience: { description: audience },
    objectives: ["Understand the essential ideas", "Apply them in a realistic activity"],
    difficulty: "adaptive",
    durationMinutes: 30,
    lessonSizeMinutes: 7,
    teachingStyle: style,
    tone: "supportive",
    language: "en",
    readingLevel: "plain-language",
    blockMix: blocks,
    assessment,
    completionRule: { lessonAttemptRequired: true, passPercent: 70 },
    credential: { enabled: false },
    expiry: { enabled: false },
    delivery: { mobile: true, offline: true, lowBandwidth: true },
    accessibility: { wcag: "2.2-AA", captions: true, alternatives: true, noColorOnlyMeaning: true },
    sourceTracePolicy: "required" as const,
    safetyBoundaries: [boundary, "Human review is required before publication"],
  },
});

export const STARTER_RECIPES = [
  makeStarter("onboarding", "Team Onboarding", "New staff or community members", "guided", { explanation: 3, scenario: 2, recap: 1 }, { mix: ["multiple_choice", "attestation"] }, "Replace examples with approved local procedures"),
  makeStarter("compliance", "Policy and Compliance", "People required to understand an approved policy", "direct", { explanation: 3, scenario: 3, attestation: 1 }, { mix: ["scenario", "multiple_choice"], passPercent: 80 }, "This recipe does not itself establish legal compliance"),
  makeStarter("school-subject", "School Subject Unit", "School-age learners with teacher support", "scaffolded", { explanation: 3, worked_example: 2, recap: 1 }, { mix: ["multiple_choice", "fill_in"] }, "Teacher review is required for age and curriculum fit"),
  makeStarter("exam-prep", "Exam Preparation", "Learners preparing for a defined assessment", "practice-led", { explanation: 2, worked_example: 2, flashcard: 2 }, { mix: ["multiple_choice", "true_false", "fill_in"] }, "Do not imply affiliation with an exam owner"),
  makeStarter("certification", "Certification Path", "Learners seeking a reviewed knowledge credential", "mastery", { explanation: 3, scenario: 2, recap: 1 }, { mix: ["multiple_choice", "practical_task"], passPercent: 80 }, "Credential scope must be stated precisely"),
  makeStarter("public-awareness", "Public Awareness", "A broad mobile-first public audience", "story-led", { story: 2, explanation: 2, recap: 1 }, { mix: ["true_false", "survey"] }, "Avoid fear, targeting, or unsupported public claims"),
  makeStarter("safety", "Safety Briefing", "People performing a supervised task", "demonstration", { explanation: 2, image: 2, scenario: 2 }, { mix: ["multiple_choice", "attestation"], passPercent: 100 }, "Training does not replace supervision or required protective controls"),
  makeStarter("product-training", "Product Training", "Customers, partners, or support staff", "task-led", { explanation: 2, worked_example: 2, practical_task: 1 }, { mix: ["scenario", "multiple_choice"] }, "Use only approved product claims and current instructions"),
  makeStarter("micro-course", "Focused Micro-course", "Busy learners needing one practical outcome", "concise", { explanation: 2, worked_example: 1, recap: 1 }, { mix: ["multiple_choice"] }, "Keep the scope to one outcome"),
  makeStarter("scenario-simulation", "Scenario Simulation", "Learners practicing decisions in context", "scenario-led", { story: 1, scenario: 4, recap: 1 }, { mix: ["scenario", "discussion"] }, "Do not use simulations for automated high-impact decisions"),
] as const;

function validateDefinition(input: RecipeDefinition) {
  if (!Array.isArray(input.objectives) || input.objectives.length === 0) throw new StudioConflictError("Recipe needs at least one objective");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1) throw new StudioConflictError("Recipe duration must be a positive number of minutes");
  if (!Number.isInteger(input.lessonSizeMinutes) || input.lessonSizeMinutes < 1) throw new StudioConflictError("Lesson size must be a positive number of minutes");
  if (!input.language.trim() || !input.readingLevel.trim()) throw new StudioConflictError("Recipe language and reading level are required");
  return input;
}

async function insertRecipeVersion(exec: Queryable, recipeId: string, version: number, userId: number, definition: RecipeDefinition) {
  validateDefinition(definition);
  return (
    await exec.query<{ id: string }>(
      `INSERT INTO recipe_versions
        (recipe_id, version, audience_json, objectives_json, difficulty,
         duration_minutes, lesson_size_minutes, teaching_style, tone, language,
         reading_level, block_mix_json, assessment_json, completion_rule_json,
         credential_json, expiry_json, delivery_json, accessibility_json,
         source_trace_policy, safety_boundaries_json, content_hash, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING id`,
      [
        recipeId, version, JSON.stringify(definition.audience), JSON.stringify(definition.objectives),
        definition.difficulty, definition.durationMinutes, definition.lessonSizeMinutes,
        definition.teachingStyle, definition.tone, definition.language, definition.readingLevel,
        JSON.stringify(definition.blockMix), JSON.stringify(definition.assessment),
        JSON.stringify(definition.completionRule), JSON.stringify(definition.credential),
        JSON.stringify(definition.expiry), JSON.stringify(definition.delivery),
        JSON.stringify(definition.accessibility), definition.sourceTracePolicy,
        JSON.stringify(definition.safetyBoundaries), contentHash(definition), userId,
      ]
    )
  ).rows[0];
}

export async function createRecipe(userId: number, spaceId: string, input: { title: string; visibility?: RecipeVisibility; definition: RecipeDefinition }) {
  return tx(async (client) => {
    await authorizeStoredMembership(userId, spaceId, "content.create", client);
    const recipe = (
      await client.query<{ id: string }>(
        `INSERT INTO recipes (owning_space_id, title, visibility, created_by_user_id)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [spaceId, input.title.trim(), input.visibility ?? "private", userId]
      )
    ).rows[0];
    const version = await insertRecipeVersion(client, recipe.id, 1, userId, input.definition);
    return { recipeId: recipe.id, recipeVersionId: version.id, version: 1 };
  });
}

export async function createStarterRecipe(userId: number, spaceId: string, starterId: string, visibility: RecipeVisibility = "private") {
  const starter = STARTER_RECIPES.find((item) => item.id === starterId);
  if (!starter) throw new StudioConflictError("Starter recipe not found");
  return createRecipe(userId, spaceId, { title: starter.title, visibility, definition: starter.definition });
}

export async function listRecipes(userId: number, spaceId: string) {
  await authorizeStoredMembership(userId, spaceId, "content.read", pool);
  return (
    await pool.query(
      `SELECT recipe.*, version.id AS recipe_version_id, version.status,
              version.duration_minutes, version.lesson_size_minutes,
              version.teaching_style, version.language
       FROM recipes recipe JOIN recipe_versions version
         ON version.recipe_id = recipe.id AND version.version = recipe.current_version
       WHERE recipe.owning_space_id = $1 ORDER BY recipe.updated_at DESC`,
      [spaceId]
    )
  ).rows;
}

export async function publishRecipe(userId: number, recipeId: string) {
  return tx(async (client) => {
    const recipe = (
      await client.query<{ owning_space_id: string; current_version: number }>("SELECT owning_space_id, current_version FROM recipes WHERE id = $1 FOR UPDATE", [recipeId])
    ).rows[0];
    if (!recipe) throw new StudioConflictError("Recipe not found");
    await authorizeStoredMembership(userId, recipe.owning_space_id, "content.publish", client);
    const row = (
      await client.query(
        `UPDATE recipe_versions SET status = 'published', published_at = $3
         WHERE recipe_id = $1 AND version = $2 AND status = 'draft' RETURNING *`,
        [recipeId, recipe.current_version, new Date().toISOString()]
      )
    ).rows[0];
    if (!row) throw new StudioConflictError("Current recipe version is not a draft");
    return row;
  });
}

export async function reviseRecipe(
  userId: number,
  recipeId: string,
  input: { title?: string; visibility?: RecipeVisibility; definition: RecipeDefinition }
) {
  return tx(async (client) => {
    const recipe = (
      await client.query<{ owning_space_id: string; current_version: number }>(
        "SELECT owning_space_id, current_version FROM recipes WHERE id = $1 FOR UPDATE",
        [recipeId]
      )
    ).rows[0];
    if (!recipe) throw new StudioConflictError("Recipe not found");
    await authorizeStoredMembership(userId, recipe.owning_space_id, "content.update", client);
    const nextVersion = recipe.current_version + 1;
    const version = await insertRecipeVersion(client, recipeId, nextVersion, userId, input.definition);
    await client.query(
      `UPDATE recipes SET current_version = $2,
         title = COALESCE($3, title), visibility = COALESCE($4, visibility),
         updated_at = $5 WHERE id = $1`,
      [recipeId, nextVersion, input.title?.trim() || null, input.visibility ?? null, new Date().toISOString()]
    );
    return { recipeId, recipeVersionId: version.id, version: nextVersion };
  });
}

export async function forkRecipe(userId: number, targetSpaceId: string, recipeId: string) {
  return tx(async (client) => {
    await authorizeStoredMembership(userId, targetSpaceId, "content.create", client);
    const source = (
      await client.query<Record<string, unknown>>(
        `SELECT recipe.*, version.* FROM recipes recipe JOIN recipe_versions version
           ON version.recipe_id = recipe.id AND version.version = recipe.current_version
         WHERE recipe.id = $1 AND (recipe.visibility IN ('public','unlisted') OR recipe.owning_space_id = $2)`,
        [recipeId, targetSpaceId]
      )
    ).rows[0];
    if (!source) throw new StudioConflictError("Recipe is not available to fork");
    const fork = (
      await client.query<{ id: string }>(
        `INSERT INTO recipes
          (owning_space_id, title, visibility, created_by_user_id, forked_from_recipe_id, forked_from_version)
         VALUES ($1,$2,'private',$3,$4,$5) RETURNING id`,
        [targetSpaceId, `${source.title} copy`, userId, recipeId, source.version]
      )
    ).rows[0];
    const definition: RecipeDefinition = {
      audience: JSON.parse(String(source.audience_json)), objectives: JSON.parse(String(source.objectives_json)),
      difficulty: String(source.difficulty), durationMinutes: Number(source.duration_minutes),
      lessonSizeMinutes: Number(source.lesson_size_minutes), teachingStyle: String(source.teaching_style),
      tone: String(source.tone), language: String(source.language), readingLevel: String(source.reading_level),
      blockMix: JSON.parse(String(source.block_mix_json)), assessment: JSON.parse(String(source.assessment_json)),
      completionRule: JSON.parse(String(source.completion_rule_json)), credential: JSON.parse(String(source.credential_json)),
      expiry: JSON.parse(String(source.expiry_json)), delivery: JSON.parse(String(source.delivery_json)),
      accessibility: JSON.parse(String(source.accessibility_json)),
      sourceTracePolicy: source.source_trace_policy as RecipeDefinition["sourceTracePolicy"],
      safetyBoundaries: JSON.parse(String(source.safety_boundaries_json)),
    };
    const version = await insertRecipeVersion(client, fork.id, 1, userId, definition);
    return { recipeId: fork.id, recipeVersionId: version.id, version: 1, forkedFromRecipeId: recipeId };
  });
}
