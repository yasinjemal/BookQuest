import { NextRequest, NextResponse } from "next/server";
import { MAX_COVER_UPLOAD_BYTES } from "./cover-contract";
import type { CoverRendition } from "./cover-contract";
import { CoverImageError, processCoverFile } from "./cover-processing";
import type { StoredCoverImage } from "./cover-images";

const HASH = /^[0-9a-f]{64}$/;
const MULTIPART_OVERHEAD_ALLOWANCE = 128 * 1024;

export function requestedCoverHash(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("v");
  return hash && HASH.test(hash) ? hash : null;
}

export function requestedCoverRendition(req: NextRequest): CoverRendition {
  return req.nextUrl.searchParams.get("s") === "thumb" ? "thumbnail" : "full";
}

export async function coverUploadFromRequest(req: NextRequest) {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) {
    throw new CoverImageError("A bounded upload size is required. Try choosing the cover again.", 411);
  }
  const length = Number(contentLength);
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new CoverImageError("The cover upload size is invalid.", 400);
  }
  if (length > MAX_COVER_UPLOAD_BYTES + MULTIPART_OVERHEAD_ALLOWANCE) {
    throw new CoverImageError("Cover images must be 4 MB or smaller.", 413);
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new CoverImageError("The cover upload could not be read.", 400);
  }
  const file = form.get("cover");
  if (!(file instanceof File)) {
    throw new CoverImageError("Choose a cover image to upload.", 400);
  }
  return processCoverFile(file);
}

export function coverUploadError(error: unknown) {
  if (error instanceof CoverImageError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export function coverImageResponse(
  req: NextRequest,
  cover: StoredCoverImage,
  visibility: "public" | "private"
) {
  const etag = `"sha256-${cover.contentHash}-${cover.rendition}"`;
  const headers = {
    "Cache-Control": visibility === "public"
      ? "public, max-age=300, must-revalidate"
      : "private, no-store",
    "Content-Disposition": "inline",
    "Content-Length": String(cover.byteSize),
    "Content-Type": cover.mimeType,
    "Cross-Origin-Resource-Policy": "same-origin",
    ETag: etag,
    "Last-Modified": new Date(cover.updatedAt).toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(new Uint8Array(cover.data), { status: 200, headers });
}
