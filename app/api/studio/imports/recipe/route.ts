import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  analyzeRecipeArchive,
  importRecipeArchive,
  MAX_RECIPE_ARCHIVE_BYTES,
  portabilityApiError,
  type RecipeImportReport,
} from "@/lib/portability";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

function creatorReport(report: RecipeImportReport) {
  return {
    ...report,
    conflicts: report.issues.filter((issue) => issue.severity !== "error").map((issue) => ({
      code: issue.code,
      message: issue.message,
    })),
  };
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) {
    unauth.headers.set("Cache-Control", "private, no-store");
    return unauth;
  }
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) {
    const response = tooManyRequests(limit);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_RECIPE_ARCHIVE_BYTES) {
    return NextResponse.json({ error: "Recipe archive exceeds the 2 MB limit" }, { status: 413, headers: privateHeaders });
  }
  let body: { mode?: "dry_run" | "import"; targetSpaceId?: string; title?: string; package?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Upload a valid BookQuest recipe archive" }, { status: 400, headers: privateHeaders }); }
  if (!body.targetSpaceId || !body.package || !(body.mode === "dry_run" || body.mode === "import")) {
    return NextResponse.json({ error: "Mode, destination workspace, and package are required" }, { status: 400, headers: privateHeaders });
  }
  try {
    if (body.mode === "dry_run") {
      return NextResponse.json(
        { report: creatorReport(await analyzeRecipeArchive(user.id, body.targetSpaceId, body.package, body.title)) },
        { headers: privateHeaders }
      );
    }
    const imported = await importRecipeArchive(user.id, body.targetSpaceId, body.package, body.title);
    return NextResponse.json({ import: imported }, { status: 201, headers: privateHeaders });
  } catch (error) {
    const portability = portabilityApiError(error);
    if (portability) return NextResponse.json({ error: portability.error }, { status: portability.status, headers: privateHeaders });
    const response = spaceApiError(error);
    if (response) { response.headers.set("Cache-Control", "private, no-store"); return response; }
    throw error;
  }
}
