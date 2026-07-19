import { NextRequest, NextResponse } from "next/server";
import { getUser, requireUser } from "@/lib/auth";
import { coverImageUrl } from "@/lib/cover-contract";
import {
  getCourseDisplayCoverHash,
  getStoredCoverImage,
} from "@/lib/cover-images";
import {
  coverImageResponse,
  coverUploadError,
  coverUploadFromRequest,
  requestedCoverHash,
  requestedCoverRendition,
} from "@/lib/cover-http";
import { canReadCourseWithoutEnrollment, getCourse } from "@/lib/db";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { spaceApiError } from "@/lib/space-api";
import { authorizeCourseAction, authorizeStoredMembership } from "@/lib/spaces";
import { clearCourseDraftCover, setCourseDraftCover } from "@/lib/studio";
import { studioApiError } from "@/lib/studio-api";
import { isCoursePubliclyVisible } from "@/lib/public-product";
import { pool } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function courseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function coverMutationLimit(req: NextRequest, userId: number) {
  const userLimit = await consumeRateLimit(
    RATE_LIMITS.coverUploadUser,
    rateLimitSubject("user", userId)
  );
  if (!userLimit.allowed) return tooManyRequests(userLimit);
  const ipLimit = await consumeRateLimit(
    RATE_LIMITS.coverUploadIp,
    rateLimitSubject("ip", requestIp(req))
  );
  return ipLimit.allowed ? null : tooManyRequests(ipLimit);
}

async function authorizeMutation(userId: number, id: number) {
  const course = await getCourse(id);
  if (!course) return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  try {
    await authorizeCourseAction(userId, id, "content.update");
    return { course };
  } catch (error) {
    const response = spaceApiError(error);
    if (response?.status === 404) {
      return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
    }
    if (response) return { response };
    throw error;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = courseId((await params).id);
  const hash = requestedCoverHash(req);
  const rendition = requestedCoverRendition(req);
  if (!id || !hash) return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  const course = await getCourse(id);
  if (!course) return NextResponse.json({ error: "Cover not found" }, { status: 404 });

  let visibility: "public" | "private" | null = null;
  if (course.cover_image_hash === hash && await isCoursePubliclyVisible(id, hash)) {
    visibility = "public";
  } else {
    const user = await getUser(req);
    if (user && course.cover_image_hash === hash && await canReadCourseWithoutEnrollment(user.id, id)) {
      visibility = "private";
    } else if (user) {
      try {
        if (!course.owning_space_id) throw new Error("Course workspace unavailable");
        await authorizeStoredMembership(user.id, course.owning_space_id, "content.review", pool);
        const draftHash = await getCourseDisplayCoverHash(id, true);
        if (draftHash === hash) visibility = "private";
      } catch {
        // A private draft is intentionally indistinguishable from a missing image.
      }
    }
  }
  if (!visibility) return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  const cover = await getStoredCoverImage(hash, rendition);
  return cover
    ? coverImageResponse(req, cover, visibility)
    : NextResponse.json({ error: "Cover not found" }, { status: 404 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const id = courseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid course" }, { status: 400 });
  const authorized = await authorizeMutation(user.id, id);
  if (authorized.response) return authorized.response;
  const limited = await coverMutationLimit(req, user.id);
  if (limited) return limited;

  let cover;
  try {
    cover = await coverUploadFromRequest(req);
  } catch (error) {
    const response = coverUploadError(error);
    if (response) return response;
    throw error;
  }

  try {
    const saved = await setCourseDraftCover(user.id, id, cover);
    return NextResponse.json({
      coverHash: saved.coverHash,
      coverUrl: coverImageUrl("course", id, saved.coverHash),
      width: cover.width,
      height: cover.height,
      versionId: saved.versionId,
      versionNumber: saved.versionNumber,
      branched: saved.branched,
      publishedCoverUnchanged: saved.publishedCoverUnchanged,
    });
  } catch (error) {
    const coverResponse = coverUploadError(error);
    if (coverResponse) return coverResponse;
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const id = courseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid course" }, { status: 400 });
  const authorized = await authorizeMutation(user.id, id);
  if (authorized.response) return authorized.response;
  const limited = await coverMutationLimit(req, user.id);
  if (limited) return limited;

  try {
    const removed = await clearCourseDraftCover(user.id, id);
    return NextResponse.json({ ...removed, coverUrl: null });
  } catch (error) {
    const coverResponse = coverUploadError(error);
    if (coverResponse) return coverResponse;
    const response = studioApiError(error);
    if (response) return response;
    throw error;
  }
}
