export type CoverArtifactKind = "course" | "book";
export type CoverRendition = "full" | "thumbnail";

export const MAX_COVER_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_STORED_COVER_BYTES = 1_500_000;
export const MAX_STORED_COVER_THUMBNAIL_BYTES = 150_000;
export const COVER_THUMBNAIL_WIDTH = 360;
export const COVER_THUMBNAIL_HEIGHT = 540;
export const MAX_COVER_STORAGE_BYTES_PER_OWNER = 50 * 1024 * 1024;
export const MAX_COVER_STORAGE_BYTES_PER_SPACE = 50 * 1024 * 1024;
export const MIN_COVER_EDGE = 320;
export const MAX_COVER_WIDTH = 1600;
export const MAX_COVER_HEIGHT = 2400;
export const COVER_ACCEPT = "image/jpeg,image/png,image/webp";

export function coverImageUrl(
  kind: CoverArtifactKind,
  artifactId: number | string,
  contentHash: string | null | undefined,
  rendition: CoverRendition = "full"
) {
  if (!contentHash) return null;
  const base = kind === "course" ? "/api/courses" : "/api/books";
  const size = rendition === "thumbnail" ? "&s=thumb" : "";
  return `${base}/${encodeURIComponent(String(artifactId))}/cover?v=${encodeURIComponent(contentHash)}${size}`;
}

export function coverFileProblem(file: Pick<File, "name" | "size" | "type">) {
  if (file.size === 0) return "Choose an image that is not empty.";
  if (file.size > MAX_COVER_UPLOAD_BYTES) {
    return "Cover images must be 4 MB or smaller.";
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  const acceptedExtension = extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp";
  const acceptedMime = !file.type || COVER_ACCEPT.split(",").includes(file.type.toLowerCase());
  if (!acceptedExtension || !acceptedMime) {
    return "Use a JPG, PNG, or WebP cover image.";
  }
  return null;
}
