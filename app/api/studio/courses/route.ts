import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";
import { createBlankCourseDraft, createCourseDraftFromSources } from "@/lib/studio";

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as {
    mode?: "blank" | "sources";
    spaceId?: string;
    title?: string;
    sourceVersionIds?: string[];
  };
  if (!body.spaceId || !body.title) {
    return NextResponse.json({ error: "Space and title are required" }, { status: 400 });
  }
  try {
    const result = body.mode === "sources"
      ? await createCourseDraftFromSources(user.id, body.spaceId, {
          title: body.title,
          sourceVersionIds: body.sourceVersionIds ?? [],
        })
      : await createBlankCourseDraft(user.id, body.spaceId, body.title);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
