import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { createSpace, listSpacesForUser } from "@/lib/spaces";
import type { SpaceType } from "@/lib/space-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set<SpaceType>(["private", "unlisted", "organization", "public"]);

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  return NextResponse.json({ spaces: await listSpacesForUser(user.id) });
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(
    RATE_LIMITS.spaceMutationUser,
    rateLimitSubject("user", user.id)
  );
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as { name?: string; type?: SpaceType };
  if (!body.name?.trim() || !body.type || !TYPES.has(body.type)) {
    return NextResponse.json({ error: "Choose a valid name and Space type" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createSpace(user.id, { name: body.name, type: body.type as Exclude<SpaceType, "personal"> }),
      { status: 201 }
    );
  } catch (error) {
    const response = spaceApiError(error);
    if (response) return response;
    throw error;
  }
}
