import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMITS, rateLimitSubject, tooManyRequests } from "@/lib/rate-limit";
import { studioApiError } from "@/lib/studio-api";
import { addCourseBlock, reorderLessonBlocks, updateCourseOutline } from "@/lib/studio";
import type { BlockType } from "@/lib/block-registry";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const limit = await consumeRateLimit(RATE_LIMITS.studioMutationUser, rateLimitSubject("user", user.id));
  if (!limit.allowed) return tooManyRequests(limit);
  const courseId = Number((await params).id);
  const body = (await req.json()) as {
    action?: "add" | "reorder" | "outline";
    lessonKey?: string;
    orderedBlockIds?: string[];
    moduleKey?: string;
    moduleTitle?: string;
    moduleSummary?: string;
    lessonTitle?: string;
    modulePosition?: number;
    lessonPosition?: number;
    blockType?: BlockType;
    content?: unknown;
    sourceRefs?: unknown[];
  };
  try {
    if (body.action === "reorder" && body.lessonKey && body.orderedBlockIds) {
      await reorderLessonBlocks(user.id, courseId, body.lessonKey, body.orderedBlockIds);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "outline" && body.moduleKey && body.moduleTitle && body.lessonKey && body.lessonTitle) {
      return NextResponse.json(await updateCourseOutline(user.id, courseId, {
        moduleKey: body.moduleKey,
        moduleTitle: body.moduleTitle,
        moduleSummary: body.moduleSummary,
        modulePosition: body.modulePosition,
        lessonKey: body.lessonKey,
        lessonTitle: body.lessonTitle,
        lessonPosition: body.lessonPosition,
      }));
    }
    if (
      body.action === "add" && body.moduleKey && body.moduleTitle && body.lessonKey &&
      body.lessonTitle && body.blockType && body.content !== undefined
    ) {
      return NextResponse.json({ block: await addCourseBlock(user.id, courseId, {
        moduleKey: body.moduleKey,
        moduleTitle: body.moduleTitle,
        moduleSummary: body.moduleSummary,
        lessonKey: body.lessonKey,
        lessonTitle: body.lessonTitle,
        modulePosition: Number(body.modulePosition ?? 0),
        lessonPosition: Number(body.lessonPosition ?? 0),
        blockType: body.blockType,
        content: body.content,
        sourceRefs: body.sourceRefs,
      }) }, { status: 201 });
    }
    return NextResponse.json({ error: "Invalid block action" }, { status: 400 });
  } catch (error) {
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
