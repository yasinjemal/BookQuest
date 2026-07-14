"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
type Document = { title: string; sourceVersionId: string; chapters: Array<{ title: string; text: string }> };
export default function DocumentReader({ courseId }: { courseId: number }) {
  const [data, setData] = useState<{ course: { title: string }; documents: Document[] } | null>(null); const [docIndex, setDocIndex] = useState(0); const [query, setQuery] = useState(""); const [size, setSize] = useState(18);
  useEffect(() => { void fetch(`/api/courses/${courseId}/reader`).then(async (r) => { if (r.status === 401) { location.href = `/login?next=/course/${courseId}/read`; return; } if (r.ok) setData(await r.json()); }); }, [courseId]);
  const document = data?.documents[docIndex]; const chapters = useMemo(() => document?.chapters.filter((chapter) => !query || `${chapter.title} ${chapter.text}`.toLowerCase().includes(query.toLowerCase())) ?? [], [document, query]);
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
  if (!data) return <div className="mx-auto mt-20 h-64 max-w-4xl rounded-[1.5rem] skeleton" />;
  return <div className="min-h-dvh bg-[#f5f1e8]"><header className="sticky top-0 z-30 border-b border-black/10 bg-[#f5f1e8]/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center gap-3"><Link href={`/course/${courseId}`} className="grid h-11 w-11 place-items-center rounded-full border border-black/15" aria-label="Return to course">←</Link><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{data.course.title}</p><p className="text-xs text-ink-soft">Source reader</p></div><button onClick={() => setSize((s) => Math.max(15, s - 1))} className="grid h-10 w-10 place-items-center rounded-full border border-black/15" aria-label="Decrease text size">A−</button><button onClick={() => setSize((s) => Math.min(24, s + 1))} className="grid h-10 w-10 place-items-center rounded-full border border-black/15" aria-label="Increase text size">A+</button></div></header>
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[17rem_1fr] lg:px-8"><aside className="lg:sticky lg:top-24 lg:self-start"><label className="text-xs font-bold">Document<select className="field mt-2" value={docIndex} onChange={(e) => setDocIndex(Number(e.target.value))}>{data.documents.map((doc, index) => <option key={doc.sourceVersionId} value={index}>{doc.title}</option>)}</select></label><label className="mt-4 block text-xs font-bold">Find in document<input className="field mt-2" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search text" /></label>{document && <nav className="mt-6 hidden max-h-[55dvh] space-y-1 overflow-y-auto lg:block" aria-label="Table of contents">{document.chapters.map((chapter, index) => <a key={index} href={`#chapter-${index}`} className="block rounded-lg px-3 py-2 text-xs font-semibold text-ink-soft hover:bg-white">{chapter.title}</a>)}</nav>}</aside>
    <main className="mx-auto w-full max-w-3xl rounded-[1.4rem] bg-[#fffdf8] px-6 py-10 shadow-card sm:px-12 sm:py-14">{data.documents.length === 0 ? <div className="py-20 text-center"><h1 className="display text-4xl">No readable source is attached.</h1><p className="mt-3 text-sm text-ink-soft">The creator can attach or regenerate the source in Studio.</p></div> : chapters.length ? chapters.map((chapter, index) => <section key={index} id={`chapter-${index}`} className="mb-14 scroll-mt-28"><p className="mb-3 text-[10px] font-bold uppercase tracking-[.18em] text-teal">Section {index + 1}</p><h1 className="display text-4xl sm:text-5xl">{chapter.title}</h1><div className="mt-6 whitespace-pre-wrap font-[var(--font-editorial)] leading-[1.8] text-[#26241f]" style={{ fontSize: size }}>{chapter.text}</div></section>) : <p className="py-20 text-center text-ink-soft">No text matches your search.</p>}</main></div></div>;
}
