import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  exportRecipeArchive,
  portabilityApiError,
  RECIPE_ARCHIVE_FORMAT,
  RECIPE_ARCHIVE_SCHEMA_VERSION,
} from "@/lib/portability";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  const limit = await consumeRateLimit(RATE_LIMITS.privacyExportUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  try {
    const archive = await exportRecipeArchive(user.id, (await params).id);
    return new NextResponse(JSON.stringify(archive, null, 2), {
      headers: {
        ...privateHeaders,
        "Content-Type": `application/vnd.bookquest.recipe+json; version=${RECIPE_ARCHIVE_SCHEMA_VERSION}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="bookquest-recipe-${archive.integrity.sha256.slice(0, 12)}.json"`,
        "X-BookQuest-Portable-Profile": `${RECIPE_ARCHIVE_FORMAT}-${RECIPE_ARCHIVE_SCHEMA_VERSION}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const portability = portabilityApiError(error);
    if (portability) return NextResponse.json({ error: portability.error }, { status: portability.status, headers: privateHeaders });
    const response = spaceApiError(error);
    if (response) { response.headers.set("Cache-Control", "private, no-store"); return response; }
    throw error;
  }
}
