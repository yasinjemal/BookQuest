"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type SourceDocument = {
  title: string;
  sourceVersionId: string;
  chapters: Array<{ title: string; text: string }>;
};

type ReaderData = {
  course: { title: string };
  documents: SourceDocument[];
};

export default function DocumentReader({ courseId }: { courseId: number }) {
  const [data, setData] = useState<ReaderData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [docIndex, setDocIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [size, setSize] = useState(18);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/reader`);
      if (response.status === 401) {
        location.href = `/login?next=/course/${courseId}/read`;
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "This source reader could not be opened.");
      setData(body as ReaderData);
      setDocIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This source reader could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);

  const document = data?.documents[docIndex];
  const chapters = useMemo(() => document?.chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => !query || `${chapter.title} ${chapter.text}`.toLowerCase().includes(query.toLowerCase())) ?? [], [document, query]);

  useEffect(() => {
    if (!document) return;
    const key = `bookquest.reader.${courseId}.${document.sourceVersionId}`;
    const saved = Number(localStorage.getItem(key) ?? 0);
    if (saved > 0) requestAnimationFrame(() => window.scrollTo({ top: saved }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const remember = () => {
      clearTimeout(timer);
      timer = setTimeout(() => localStorage.setItem(key, String(window.scrollY)), 150);
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { clearTimeout(timer); window.removeEventListener("scroll", remember); };
  }, [courseId, document]);

  if (loading) return <main className="page-wrap" aria-label="Opening source reader"><p role="status" className="screen-reader-text">Opening source reader…</p><div className="mx-auto mt-16 max-w-4xl"><div className="h-12 w-2/3 rounded-xl skeleton" /><div className="mt-6 h-72 rounded-[1.5rem] skeleton" /></div></main>;

  if (error || !data) return <main className="page-wrap"><section className="panel mx-auto mt-12 max-w-xl text-center"><p className="section-label">Source reader</p><h1 className="display mt-3 text-4xl">We could not open this source.</h1><p role="alert" className="mt-4 text-sm leading-6 text-ink-soft">{error || "The reader returned no content."}</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => void load()} className="btn-primary">Try again</button><Link href={`/course/${courseId}`} className="quiet-button">Return to course</Link></div></section></main>;

  const chapterLinks = chapters.map(({ chapter, index }) => <a key={`${chapter.title}-${index}`} href={`#chapter-${index}`} className="block min-h-11 rounded-lg px-3 py-2.5 text-xs font-semibold text-ink-soft hover:bg-white hover:text-ink">{chapter.title}</a>);

  return <div className="min-h-dvh bg-[#f5f1e8]">
    <header className="sticky top-0 z-30 border-b border-black/10 bg-[#f5f1e8]/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <Link href={`/course/${courseId}`} className="icon-button border-black/15 bg-transparent" aria-label="Return to course">←</Link>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{data.course.title}</p><p className="text-xs text-ink-soft">Source reader</p></div>
        <button type="button" onClick={() => setSize((current) => Math.max(15, current - 1))} className="icon-button border-black/15 bg-transparent" aria-label="Decrease text size">A−</button>
        <button type="button" onClick={() => setSize((current) => Math.min(24, current + 1))} className="icon-button border-black/15 bg-transparent" aria-label="Increase text size">A+</button>
      </div>
    </header>

    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[17rem_1fr] lg:px-8">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <label htmlFor="reader-document" className="field-label">Document
          <select id="reader-document" className="field mt-2" value={docIndex} disabled={data.documents.length === 0} onChange={(event) => { setDocIndex(Number(event.target.value)); setQuery(""); }}>{data.documents.map((item, index) => <option key={item.sourceVersionId} value={index}>{item.title}</option>)}</select>
        </label>
        <label htmlFor="reader-search" className="field-label mt-4">Find in document
          <input id="reader-search" className="field mt-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search text" />
        </label>
        {document && <details className="nav-popover mt-4 rounded-xl border border-line bg-card p-2 lg:hidden"><summary className="flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold">Browse chapters <span aria-hidden="true">＋</span></summary><nav className="mt-2 border-t border-line pt-2" aria-label="Mobile table of contents">{chapterLinks}</nav></details>}
        {document && <nav className="mt-6 hidden max-h-[55dvh] space-y-1 overflow-y-auto lg:block" aria-label="Table of contents">{chapterLinks}</nav>}
      </aside>

      <main className="mx-auto w-full max-w-3xl rounded-[1.4rem] bg-[#fffdf8] px-6 py-10 shadow-card sm:px-12 sm:py-14">
        <h1 className="screen-reader-text">Source reader for {data.course.title}</h1>
        {data.documents.length === 0 ? <div className="py-20 text-center"><h2 className="display text-4xl">No readable source is attached.</h2><p className="mt-3 text-sm text-ink-soft">The creator can attach or regenerate the source in Studio.</p></div> : chapters.length ? chapters.map(({ chapter, index }) => <section key={`${chapter.title}-${index}`} id={`chapter-${index}`} className="mb-14 scroll-mt-28"><p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-teal-deep">Section {index + 1}</p><h2 className="display text-4xl sm:text-5xl">{chapter.title}</h2><div className="mt-6 whitespace-pre-wrap font-[var(--font-editorial)] leading-[1.8] text-[#26241f]" style={{ fontSize: size }}>{chapter.text}</div></section>) : <div className="py-20 text-center"><h2 className="display text-3xl">No text matches that search.</h2><button type="button" onClick={() => setQuery("")} className="quiet-button mt-5">Clear search</button></div>}
      </main>
    </div>
  </div>;
}
