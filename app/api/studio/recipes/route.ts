import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { studioApiError } from "@/lib/studio-api";
import { createStarterRecipe, forkRecipe, listRecipes, publishRecipe, reviseRecipe, STARTER_RECIPES, type RecipeDefinition } from "@/lib/recipes";

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const spaceId = req.nextUrl.searchParams.get("spaceId");
  if (!spaceId) return NextResponse.json({ starters: STARTER_RECIPES, recipes: [] });
  try {
    return NextResponse.json({ starters: STARTER_RECIPES, recipes: await listRecipes(user.id, spaceId) });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const body = (await req.json()) as {
    action?: "starter" | "fork" | "publish" | "revise";
    spaceId?: string;
    starterId?: string;
    recipeId?: string;
    visibility?: "private" | "space" | "unlisted" | "public";
    title?: string;
    definition?: RecipeDefinition;
  };
  try {
    if (body.action === "starter" && body.spaceId && body.starterId) {
      return NextResponse.json(await createStarterRecipe(user.id, body.spaceId, body.starterId, body.visibility), { status: 201 });
    }
    if (body.action === "fork" && body.spaceId && body.recipeId) {
      return NextResponse.json(await forkRecipe(user.id, body.spaceId, body.recipeId), { status: 201 });
    }
    if (body.action === "publish" && body.recipeId) {
      return NextResponse.json(await publishRecipe(user.id, body.recipeId));
    }
    if (body.action === "revise" && body.recipeId && body.definition) {
      return NextResponse.json(await reviseRecipe(user.id, body.recipeId, {
        title: body.title,
        visibility: body.visibility,
        definition: body.definition,
      }), { status: 201 });
    }
    return NextResponse.json({ error: "Invalid recipe action" }, { status: 400 });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
