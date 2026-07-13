"use client";

import { useEffect, useMemo, useState } from "react";
import AppIcon from "@/components/AppIcon";

export interface StudioSourceSummary { source_version_id: string; title: string; kind: string }
export interface StudioSourceDocument { sourceVersionId: string; title: string; kind: string; version: number; originalFilename: string | null; contentHash: string; chapters: Array<{ title: string; text: string }> }

export default function StudioSourceReader({ courseId, sources, selectedBlockLabel, onCite }: { courseId: string; sources: StudioSourceSummary[]; selectedBlockLabel?: string; onCite: (sourceVersionId: string, chapterTitle: string) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(sources[0]?.source_version_id ?? "");
  const [document, setDocument] = useState<StudioSourceDocument | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (!sources.some((source) => source.source_version_id === selectedId)) setSelectedId(sources[0]?.source_version_id ?? ""); }, [sources, selectedId]);
  useEffect(() => {
    if (!selectedId) return setDocument(null);
    let cancelled = false;
    setLoading(true); setMessage("");
    fetch(`/api/studio/courses/${courseId}/sources/${encodeURIComponent(selectedId)}`)
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => { if (!cancelled) response.ok ? setDocument(body.source) : setMessage(body.error ?? "Could not open source"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, selectedId]);
  const chapters = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return document?.chapters ?? [];
    return (document?.chapters ?? []).filter((chapter) => `${chapter.title}\n${chapter.text}`.toLowerCase().includes(needle));
  }, [document, query]);
  if (sources.length === 0) return <div className="rounded-xl border border-dashed border-line-deep p-5 text-sm leading-6 text-ink-soft">No source is attached. Add a source before publishing so every lesson can be verified.</div>;
  return <div className="space-y-3">
    <label className="block text-xs font-semibold">Document<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="field mt-2">{sources.map((source) => <option key={source.source_version_id} value={source.source_version_id}>{source.title}</option>)}</select></label>
    <label className="relative block"><span className="screen-reader-text">Search document</span><AppIcon name="source" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-ink-soft" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this document…" className="field pl-10" /></label>
    {document && <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft"><span>Version {document.version}</span><span>·</span><span>{document.originalFilename ?? document.kind}</span><span>·</span><span>{document.chapters.length} sections</span></div>}
    {loading && <div className="skeleton h-56 rounded-xl" aria-label="Opening document" />}
    {message && <p role="alert" className="rounded-xl bg-no-soft p-3 text-xs font-semibold text-no-deep">{message}</p>}
    {!loading && document && <div className="max-h-[60dvh] space-y-3 overflow-y-auto rounded-xl border border-line bg-ivory p-2" aria-label="Document reader">
      {chapters.map((chapter, index) => <article key={`${chapter.title}-${index}`} className="rounded-xl bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-teal">Section {index + 1}</p><h3 className="mt-1 text-sm font-bold">{chapter.title}</h3></div><button type="button" disabled={!selectedBlockLabel} onClick={async () => { await onCite(document.sourceVersionId, chapter.title); setMessage(`Linked “${chapter.title}” to ${selectedBlockLabel}.`); }} className="shrink-0 rounded-full border border-line px-3 py-2 text-[10px] font-bold disabled:opacity-35">{selectedBlockLabel ? "Link" : "Select a block"}</button></div>
        <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-ink-soft">{chapter.text}</p>
      </article>)}
      {chapters.length === 0 && <p className="p-5 text-center text-sm text-ink-soft">No sections match “{query}”.</p>}
    </div>}
  </div>;
}
