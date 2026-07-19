"use client";

import { useEffect, useState } from "react";
import { coverImageUrl, type CoverArtifactKind, type CoverRendition } from "@/lib/cover-contract";

export default function ArtifactCoverImage({
  kind,
  artifactId,
  contentHash,
  variant,
  priority = false,
  rendition = "full",
  className = "",
}: {
  kind: CoverArtifactKind;
  artifactId: number | string;
  contentHash: string | null | undefined;
  variant: "course" | "book";
  priority?: boolean;
  rendition?: CoverRendition;
  className?: string;
}) {
  const src = coverImageUrl(kind, artifactId, contentHash, rendition);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return null;

  return (
    <span className={`pointer-events-none absolute inset-0 z-[1] block overflow-hidden ${className}`} aria-hidden="true">
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
      <img
        src={src}
        alt=""
        className={variant === "book"
          ? "relative h-full w-full object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,.34)]"
          : "relative h-full w-full object-contain p-2 drop-shadow-[0_18px_30px_rgba(0,0,0,.3)] sm:p-3"}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
