import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";
import { createTextSource, listSourcesForSpace } from "@/lib/studio";
import { fetchWebSource } from "@/lib/web-source";

const TEXT_KINDS = new Set(["text", "markdown", "webpage", "transcript", "manual"]);

export async function GET(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const spaceId = req.nextUrl.searchParams.get("spaceId");
  if (!spaceId) return NextResponse.json({ error: "Space required" }, { status: 400 });
  try {
    return NextResponse.json({ sources: await listSourcesForSpace(user.id, spaceId) });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const body = (await req.json()) as {
    spaceId?: string;
    title?: string;
    kind?: "text" | "markdown" | "webpage" | "transcript" | "manual";
    content?: unknown;
    sourceUrl?: string;
    accessPolicy?: "owner" | "editors" | "members";
  };
  if (!body.spaceId || !body.title || !body.kind || !TEXT_KINDS.has(body.kind)) {
    return NextResponse.json({ error: "Space, title and supported kind are required" }, { status: 400 });
  }
  try {
    const webpage = body.kind === "webpage" && body.sourceUrl && body.content === undefined
      ? await fetchWebSource(body.sourceUrl)
      : null;
    const content = webpage
      ? [{ title: webpage.title, text: webpage.text }]
      : body.content;
    if (content === undefined) {
      return NextResponse.json({ error: "Source content is required" }, { status: 400 });
    }
    return NextResponse.json(
      await createTextSource(user.id, body.spaceId, {
        title: body.title,
        kind: body.kind,
        content,
        accessPolicy: body.accessPolicy,
        provenance: webpage
          ? { sourceUrl: body.sourceUrl, finalUrl: webpage.finalUrl, contentType: webpage.contentType }
          : body.sourceUrl ? { sourceUrl: body.sourceUrl } : { origin: "manual" },
      }),
      { status: 201 }
    );
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
