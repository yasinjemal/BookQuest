import { after, NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import type { Chapter } from "@/lib/extract";
import { resolveBaseUrl } from "@/lib/generation";
import {
  claimStalledSummary,
  deleteSummary,
  getOwnedSummary,
  getSummarySections,
} from "@/lib/summary-db";
import {
  kickSummaryGeneration,
  SUMMARY_GENERATION_STALE_MS,
} from "@/lib/summary-generation";
import { SummarySectionContent } from "@/lib/summary-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function chaptersFrom(sourceJson: string | null): Chapter[] {
  if (!sourceJson) return [];
  try {
    const parsed = JSON.parse(sourceJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (chapter): chapter is Chapter =>
        typeof chapter === "object" && chapter !== null &&
        typeof (chapter as Chapter).title === "string" &&
        typeof (chapter as Chapter).text === "string"
    );
  } catch {
    return [];
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const summaryId = Number((await params).id);
  if (!Number.isInteger(summaryId) || summaryId <= 0) {
    return NextResponse.json({ error: "Invalid summary id" }, { status: 400 });
  }
  const summary = await getOwnedSummary(summaryId, user.id);
  if (!summary) {
    return NextResponse.json({ error: "Summary not found" }, { status: 404 });
  }
  const claimedAt = new Date();
  const stalled = await claimStalledSummary(
    summaryId,
    user.id,
    new Date(claimedAt.getTime() - SUMMARY_GENERATION_STALE_MS).toISOString(),
    claimedAt.toISOString()
  );
  if (stalled) {
    const baseUrl = resolveBaseUrl(req);
    after(() => kickSummaryGeneration(stalled.id, stalled.generation_run_id, baseUrl));
  }
  const sectionRows = await getSummarySections(summaryId);
  const source = chaptersFrom(summary.source_json);
  const sections = sectionRows.map((section) => {
    let content = null;
    if (section.content_json) {
      try {
        const parsed = SummarySectionContent.safeParse(JSON.parse(section.content_json));
        if (parsed.success) content = parsed.data;
      } catch {
        content = null;
      }
    }
    const chapterIndexes = JSON.parse(section.chapter_indexes || "[]") as number[];
    return {
      id: Number(section.id),
      title: section.title,
      hook: section.hook,
      position: Number(section.position),
      chapter_indexes: chapterIndexes,
      source_chapters: chapterIndexes
        .map((index) => source[index]?.title)
        .filter((title): title is string => Boolean(title)),
      status: section.status,
      content,
    };
  });

  return NextResponse.json({
    id: summary.id,
    title: summary.title,
    description: summary.description,
    thesis: summary.thesis,
    source_filename: summary.source_filename,
    status: summary.status,
    error: summary.error,
    document_kind: summary.document_kind,
    estimated_minutes: summary.estimated_minutes,
    section_count: sections.length,
    ready_section_count: sections.filter((section) => section.status === "ready").length,
    source_chapter_count: summary.source_chapter_count,
    course_id: summary.course_id,
    created_at: summary.created_at,
    sections,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const summaryId = Number((await params).id);
  if (!Number.isInteger(summaryId) || summaryId <= 0) {
    return NextResponse.json({ error: "Invalid summary id" }, { status: 400 });
  }
  const summary = await getOwnedSummary(summaryId, user.id);
  if (!summary) {
    return NextResponse.json({ error: "Summary not found" }, { status: 404 });
  }
  await deleteSummary(summaryId, user.id);
  return NextResponse.json({ deleted: true });
}
