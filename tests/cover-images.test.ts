import crypto from "crypto";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  CoverImageError,
  processCoverImage,
  validateStoredCoverImage,
} from "../lib/cover-processing";
import { coverImageResponse, coverUploadFromRequest, requestedCoverRendition } from "../lib/cover-http";
import {
  coverFileProblem,
  coverImageUrl,
  MAX_COVER_UPLOAD_BYTES,
} from "../lib/cover-contract";

describe("cover image normalization", () => {
  it("turns a real PNG into a bounded metadata-free WebP", async () => {
    const input = await sharp({
      create: { width: 900, height: 1350, channels: 4, background: "#245c4f" },
    }).png().withMetadata({ orientation: 1 }).toBuffer();

    const cover = await processCoverImage(input);
    const metadata = await sharp(cover.data).metadata();

    expect(cover.mimeType).toBe("image/webp");
    expect(cover.width).toBe(900);
    expect(cover.height).toBe(1350);
    expect(cover.byteSize).toBe(cover.data.length);
    expect(cover.thumbnailWidth).toBeLessThanOrEqual(360);
    expect(cover.thumbnailHeight).toBeLessThanOrEqual(540);
    expect(cover.thumbnailByteSize).toBe(cover.thumbnailData.length);
    expect(cover.thumbnailByteSize).toBeLessThanOrEqual(150_000);
    expect((await sharp(cover.thumbnailData).metadata()).format).toBe("webp");
    expect(cover.contentHash).toBe(crypto.createHash("sha256").update(cover.data).digest("hex"));
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it("resizes large inputs inside the production envelope", async () => {
    const input = await sharp({
      create: { width: 3000, height: 4500, channels: 3, background: "#c8914b" },
    }).jpeg({ quality: 90 }).toBuffer();
    const cover = await processCoverImage(input);
    expect(cover.width).toBeLessThanOrEqual(1600);
    expect(cover.height).toBeLessThanOrEqual(2400);
    expect(cover.byteSize).toBeLessThanOrEqual(1_500_000);
  });

  it("validates portable covers without changing a single stored byte", async () => {
    const input = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: "#7d4d92" },
    }).png().toBuffer();
    const normalized = await processCoverImage(input);
    const restored = await validateStoredCoverImage(normalized.data);
    expect(restored.data.equals(normalized.data)).toBe(true);
    expect(restored.contentHash).toBe(normalized.contentHash);
    await expect(validateStoredCoverImage(input)).rejects.toThrow(/single-frame WebP/);
  });

  it("rejects active/vector, tiny, extreme and oversized payloads", async () => {
    await expect(processCoverImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')))
      .rejects.toMatchObject({ status: 422 });

    const tiny = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "white" },
    }).png().toBuffer();
    await expect(processCoverImage(tiny)).rejects.toThrow(/320 by 320/);

    const extreme = await sharp({
      create: { width: 1200, height: 320, channels: 3, background: "white" },
    }).png().toBuffer();
    await expect(processCoverImage(extreme)).rejects.toThrow(/less extreme/);

    const oversized = Buffer.alloc(MAX_COVER_UPLOAD_BYTES + 1);
    await expect(processCoverImage(oversized)).rejects.toMatchObject({ status: 413 });
  });

  it("keeps client guidance and versioned URLs aligned with the server contract", () => {
    expect(coverFileProblem({ name: "cover.svg", size: 20, type: "image/svg+xml" })).toMatch(/JPG/);
    expect(coverFileProblem({ name: "cover.webp", size: 500_000, type: "image/webp" })).toBeNull();
    const hash = "a".repeat(64);
    expect(coverImageUrl("course", 42, hash)).toBe(`/api/courses/42/cover?v=${hash}`);
    expect(coverImageUrl("course", 42, hash, "thumbnail")).toBe(`/api/courses/42/cover?v=${hash}&s=thumb`);
    expect(coverImageUrl("book", 7, null)).toBeNull();
    expect(new CoverImageError("bad", 422).status).toBe(422);
  });

  it("requires bounded multipart requests and serves revocable public cache headers", async () => {
    const unbounded = {
      headers: new Headers(),
    } as NextRequest;
    await expect(coverUploadFromRequest(unbounded)).rejects.toMatchObject({ status: 411 });

    const tooLarge = {
      headers: new Headers({ "content-length": String(MAX_COVER_UPLOAD_BYTES + 200_000) }),
    } as NextRequest;
    await expect(coverUploadFromRequest(tooLarge)).rejects.toMatchObject({ status: 413 });

    const data = Buffer.from("safe-webp-placeholder");
    const request = new NextRequest("https://bookquest.test/api/courses/1/cover?v=x");
    const response = coverImageResponse(request, {
      data,
      mimeType: "image/webp",
      width: 320,
      height: 480,
      byteSize: data.length,
      contentHash: "a".repeat(64),
      updatedAt: "2026-07-19T00:00:00.000Z",
      rendition: "full",
    }, "public");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const thumbnailData = Buffer.from("small-thumbnail");
    const thumbnailRequest = new NextRequest("https://bookquest.test/api/courses/1/cover?v=x&s=thumb");
    expect(requestedCoverRendition(thumbnailRequest)).toBe("thumbnail");
    const thumbnailResponse = coverImageResponse(thumbnailRequest, {
      data: thumbnailData,
      mimeType: "image/webp",
      width: 240,
      height: 360,
      byteSize: thumbnailData.length,
      contentHash: "a".repeat(64),
      updatedAt: "2026-07-19T00:00:00.000Z",
      rendition: "thumbnail",
    }, "public");
    expect(thumbnailResponse.headers.get("content-length")).toBe(String(thumbnailData.length));
    expect(thumbnailResponse.headers.get("etag")).not.toBe(response.headers.get("etag"));
  });
});
