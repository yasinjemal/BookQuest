import crypto from "crypto";
import sharp from "sharp";
import {
  COVER_THUMBNAIL_HEIGHT,
  COVER_THUMBNAIL_WIDTH,
  MAX_COVER_HEIGHT,
  MAX_COVER_UPLOAD_BYTES,
  MAX_COVER_WIDTH,
  MAX_STORED_COVER_BYTES,
  MAX_STORED_COVER_THUMBNAIL_BYTES,
  MIN_COVER_EDGE,
} from "./cover-contract";

const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_INPUT_PIXELS = 16_000_000;
const MAX_CONCURRENT_COVER_TRANSFORMS = 2;
let activeCoverTransforms = 0;
const coverTransformWaiters: Array<() => void> = [];

async function acquireCoverTransformSlot() {
  if (activeCoverTransforms < MAX_CONCURRENT_COVER_TRANSFORMS) {
    activeCoverTransforms += 1;
    return;
  }
  await new Promise<void>((resolve) => coverTransformWaiters.push(resolve));
}

function releaseCoverTransformSlot() {
  const next = coverTransformWaiters.shift();
  if (next) next();
  else activeCoverTransforms -= 1;
}

async function withCoverTransformSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquireCoverTransformSlot();
  try {
    return await work();
  } finally {
    releaseCoverTransformSlot();
  }
}

export interface ProcessedCoverImage {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  byteSize: number;
  contentHash: string;
  thumbnailData: Buffer;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailByteSize: number;
}

export class CoverImageError extends Error {
  constructor(message: string, readonly status: 400 | 411 | 413 | 422 = 400) {
    super(message);
    this.name = "CoverImageError";
  }
}

function imagePipeline(data: Buffer) {
  return sharp(data, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
    sequentialRead: true,
  });
}

async function createCoverThumbnail(data: Buffer) {
  async function encode(quality: number) {
    return sharp(data, { failOn: "error", sequentialRead: true })
      .resize({
        width: COVER_THUMBNAIL_WIDTH,
        height: COVER_THUMBNAIL_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ effort: 4, quality, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
  }
  let thumbnail = await encode(72);
  if (thumbnail.data.length > MAX_STORED_COVER_THUMBNAIL_BYTES) {
    thumbnail = await encode(50);
  }
  if (thumbnail.data.length > MAX_STORED_COVER_THUMBNAIL_BYTES) {
    throw new CoverImageError("This image is too detailed to create a lightweight cover thumbnail.", 422);
  }
  return thumbnail;
}

/** Validate, orient, resize and re-encode a cover. Re-encoding removes EXIF,
 * embedded profiles and active/vector formats before any bytes are persisted. */
async function processCoverImageUnlocked(data: Buffer): Promise<ProcessedCoverImage> {
  if (data.length === 0) throw new CoverImageError("Choose an image that is not empty.");
  if (data.length > MAX_COVER_UPLOAD_BYTES) {
    throw new CoverImageError("Cover images must be 4 MB or smaller.", 413);
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await imagePipeline(data).metadata();
  } catch {
    throw new CoverImageError("This cover image could not be read.", 422);
  }
  if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
    throw new CoverImageError("Use a JPG, PNG, or WebP cover image.", 422);
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new CoverImageError("Animated cover images are not supported.", 422);
  }
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (sourceWidth < MIN_COVER_EDGE || sourceHeight < MIN_COVER_EDGE) {
    throw new CoverImageError("Choose a cover at least 320 by 320 pixels.", 422);
  }
  const aspectRatio = sourceWidth / sourceHeight;
  if (aspectRatio < 0.4 || aspectRatio > 2.5) {
    throw new CoverImageError("Choose a less extreme cover shape so it crops well on every screen.", 422);
  }

  async function encode(width: number, height: number, quality: number) {
    return imagePipeline(data)
      .rotate()
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .webp({ effort: 4, quality, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
  }

  let output;
  try {
    output = await encode(MAX_COVER_WIDTH, MAX_COVER_HEIGHT, 82);
    if (output.data.length > MAX_STORED_COVER_BYTES) {
      output = await encode(1200, 1800, 68);
    }
  } catch {
    throw new CoverImageError("This cover image could not be prepared.", 422);
  }
  if (output.data.length > MAX_STORED_COVER_BYTES) {
    throw new CoverImageError("This image is too detailed to use as a cover. Try a simpler or smaller image.", 422);
  }

  const contentHash = crypto.createHash("sha256").update(output.data).digest("hex");
  const thumbnail = await createCoverThumbnail(output.data);
  return {
    data: output.data,
    mimeType: "image/webp",
    width: output.info.width,
    height: output.info.height,
    byteSize: output.data.length,
    contentHash,
    thumbnailData: thumbnail.data,
    thumbnailWidth: thumbnail.info.width,
    thumbnailHeight: thumbnail.info.height,
    thumbnailByteSize: thumbnail.data.length,
  };
}

export async function processCoverImage(data: Buffer): Promise<ProcessedCoverImage> {
  return withCoverTransformSlot(() => processCoverImageUnlocked(data));
}

export async function processCoverFile(file: File) {
  if (file.size > MAX_COVER_UPLOAD_BYTES) {
    throw new CoverImageError("Cover images must be 4 MB or smaller.", 413);
  }
  return processCoverImage(Buffer.from(await file.arrayBuffer()));
}

/** Validate a BookQuest-normalized WebP without re-encoding it. Portable
 * restore uses this path so repeated backup/restore cycles remain lossless. */
async function validateStoredCoverImageUnlocked(data: Buffer): Promise<ProcessedCoverImage> {
  if (data.length === 0 || data.length > MAX_STORED_COVER_BYTES) {
    throw new CoverImageError("The stored cover exceeds BookQuest's safe image limit.", 422);
  }
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await imagePipeline(data).metadata();
  } catch {
    throw new CoverImageError("The stored cover is not a readable image.", 422);
  }
  if (metadata.format !== "webp" || (metadata.pages ?? 1) !== 1) {
    throw new CoverImageError("The stored cover must be a single-frame WebP image.", 422);
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    width < MIN_COVER_EDGE ||
    height < MIN_COVER_EDGE ||
    width > MAX_COVER_WIDTH ||
    height > MAX_COVER_HEIGHT
  ) {
    throw new CoverImageError("The stored cover dimensions are outside BookQuest's safe limits.", 422);
  }
  const aspectRatio = width / height;
  if (aspectRatio < 0.4 || aspectRatio > 2.5) {
    throw new CoverImageError("The stored cover shape is outside BookQuest's safe limits.", 422);
  }
  if (metadata.exif || metadata.icc || metadata.xmp || metadata.iptc) {
    throw new CoverImageError("The stored cover contains metadata that BookQuest cannot restore safely.", 422);
  }
  const thumbnail = await createCoverThumbnail(data);
  return {
    data,
    mimeType: "image/webp",
    width,
    height,
    byteSize: data.length,
    contentHash: crypto.createHash("sha256").update(data).digest("hex"),
    thumbnailData: thumbnail.data,
    thumbnailWidth: thumbnail.info.width,
    thumbnailHeight: thumbnail.info.height,
    thumbnailByteSize: thumbnail.data.length,
  };
}

export async function validateStoredCoverImage(data: Buffer): Promise<ProcessedCoverImage> {
  return withCoverTransformSlot(() => validateStoredCoverImageUnlocked(data));
}
