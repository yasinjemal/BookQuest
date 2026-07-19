import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { coverImageUrl } from "@/lib/cover-contract";
import {
  getOwnedReadingEditionCoverImage,
  removeOwnedReadingEditionCover,
  saveOwnedReadingEditionCover,
} from "@/lib/cover-images";
import {
  coverImageResponse,
  coverUploadError,
  coverUploadFromRequest,
  requestedCoverHash,
  requestedCoverRendition,
} from "@/lib/cover-http";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitSubject,
  requestIp,
  tooManyRequests,
} from "@/lib/rate-limit";
import { getOwnedReadingEditionMetadata } from "@/lib/reading-editions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function editionId(value: string) {
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const id = editionId((await params).id);
  const hash = requestedCoverHash(req);
  const rendition = requestedCoverRendition(req);
  if (!id || !hash) return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  const cover = await getOwnedReadingEditionCoverImage(id, user.id, hash, rendition);
  return cover
    ? coverImageResponse(req, cover, "private")
    : NextResponse.json({ error: "Cover not found" }, { status: 404 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, unauth] = await requireUser(req);
  if (!user) return unauth;
  const id = editionId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid book" }, { status: 400 });
  if (!await getOwnedReadingEditionMetadata(id, user.id)) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }
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
    const coverHash = await saveOwnedReadingEditionCover(id, user.id, cover);
    if (!coverHash) return NextResponse.json({ error: "Book not found" }, { status: 404 });
    return NextResponse.json({
      coverHash,
      coverUrl: coverImageUrl("book", id, coverHash),
      width: cover.width,
      height: cover.height,
    });
  } catch (error) {
    const response = coverUploadError(error);
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
  const id = editionId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid book" }, { status: 400 });
  const limited = await coverMutationLimit(req, user.id);
  if (limited) return limited;
  const removed = await removeOwnedReadingEditionCover(id, user.id);
  if (removed === undefined) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  return NextResponse.json({ removed, coverHash: null, coverUrl: null });
}
