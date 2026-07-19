"use client";

import { useId, useRef, useState } from "react";
import AppIcon from "@/components/AppIcon";
import ArtifactCoverImage from "@/components/ArtifactCoverImage";
import {
  COVER_ACCEPT,
  coverFileProblem,
  type CoverArtifactKind,
} from "@/lib/cover-contract";

interface CoverMutationResponse {
  error?: string;
  coverHash?: string | null;
  branched?: boolean;
  publishedCoverUnchanged?: boolean;
}

export default function CoverImageEditor({
  kind,
  artifactId,
  title,
  coverHash,
  onChanged,
  compact = false,
}: {
  kind: CoverArtifactKind;
  artifactId: number;
  title: string;
  coverHash: string | null;
  onChanged: (coverHash: string | null) => void;
  compact?: boolean;
}) {
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = kind === "course"
    ? `/api/courses/${artifactId}/cover`
    : `/api/books/${artifactId}/cover`;

  async function upload(file: File) {
    const problem = coverFileProblem(file);
    if (problem) {
      setMessage("");
      setError(problem);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("cover", file);
      const response = await fetch(endpoint, { method: "PUT", body: form });
      const result = await response.json().catch(() => ({})) as CoverMutationResponse;
      if (!response.ok || !result.coverHash) {
        throw new Error(result.error || "The cover could not be uploaded.");
      }
      onChanged(result.coverHash);
      setMessage(result.branched || result.publishedCoverUnchanged
        ? "Cover saved to the course draft. Learners keep the published cover until this version is released."
        : "Cover ready. It now appears anywhere this title is shown.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The cover could not be uploaded.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!confirm(`Remove the custom cover from ${title}?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as CoverMutationResponse;
      if (!response.ok) throw new Error(result.error || "The cover could not be removed.");
      onChanged(null);
      setMessage(result.branched || result.publishedCoverUnchanged
        ? "Custom cover removed from the draft. The published cover stays visible until this version is released."
        : "Custom cover removed. BookQuest restored the generated artwork.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The cover could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-busy={busy} className={compact ? "mt-4" : "rounded-2xl border border-line bg-paper/55 p-4 sm:p-5"}>
      {!compact && <div className="mb-4"><p className="section-label">Custom cover</p><h3 className="mt-1 text-base font-semibold">Give this {kind === "course" ? "course" : "book"} a recognizable face.</h3><p className="mt-2 text-xs leading-5 text-ink-soft">JPG, PNG, or WebP · up to 4 MB · at least 320 × 320. BookQuest removes embedded metadata and prepares a safe WebP automatically.</p></div>}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={COVER_ACCEPT}
        disabled={busy}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
        className="screen-reader-text"
      />
      {coverHash && <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-card p-2.5"><div className={`relative shrink-0 overflow-hidden rounded-lg bg-pine ${kind === "book" ? "h-20 w-14" : "h-16 w-24"}`}><ArtifactCoverImage kind={kind} artifactId={artifactId} contentHash={coverHash} variant={kind} /></div><p className="text-xs font-semibold leading-5 text-ink-soft">Current custom cover. Replacing it updates this preview immediately.</p></div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} aria-describedby={statusId} onClick={() => inputRef.current?.click()} className={compact ? "quiet-button" : "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"}>
          <AppIcon name="source" className="h-4 w-4" />
          {busy ? "Preparing cover…" : coverHash ? "Replace cover" : "Upload cover"}
        </button>
        {coverHash && <button type="button" disabled={busy} aria-label={`Remove custom cover from ${title}`} onClick={() => void remove()} className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-deep px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Remove</button>}
      </div>
      {compact && <p className="mt-2 text-[10px] leading-4 text-ink-soft">JPG, PNG, or WebP · 4 MB max · metadata removed</p>}
      <p id={statusId} role="status" aria-live="polite" className={message ? "mt-3 rounded-xl bg-go-soft px-3 py-2 text-xs font-semibold leading-5 text-go-deep" : "screen-reader-text"}>{busy ? "Preparing and uploading the cover." : message}</p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-no-soft px-3 py-2 text-xs font-semibold leading-5 text-no">{error}</p>}
    </div>
  );
}
