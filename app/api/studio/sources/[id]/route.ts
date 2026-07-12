import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";
import { replaceSourceContent, updateSourceGovernance } from "@/lib/studio";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as {
    action?: "replace" | "governance";
    content?: unknown;
    originalFilename?: string;
    mimeType?: string;
    lifecycleStatus?: "active" | "archived" | "deletion_scheduled";
    accessPolicy?: "owner" | "editors" | "members";
    retentionPolicy?: Record<string, unknown>;
  };
  const sourceId = (await params).id;
  try {
    if (body.action === "replace" && body.content !== undefined) {
      return NextResponse.json(await replaceSourceContent(user.id, sourceId, {
        content: body.content,
        originalFilename: body.originalFilename,
        mimeType: body.mimeType,
        extractorVersion: "studio-replacement-v1",
        provenance: { origin: "replacement" },
      }));
    }
    if (body.action === "governance") {
      return NextResponse.json({ source: await updateSourceGovernance(user.id, sourceId, body) });
    }
    return NextResponse.json({ error: "Invalid source update" }, { status: 400 });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
