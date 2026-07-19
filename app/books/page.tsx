"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppIcon from "@/components/AppIcon";
import ArtifactCoverImage from "@/components/ArtifactCoverImage";
import CourseWorld from "@/components/CourseWorld";
import ReadingEditionCard from "@/components/ReadingEditionCard";
import type { ReadingEditionListItem } from "@/lib/reading-types";

type ShelfFilter = "all" | "reading" | "unread" | "finished";

const filters: Array<{ id: ShelfFilter; label: string }> = [
  { id: "all", label: "All books" },
  { id: "reading", label: "In progress" },
  { id: "unread", label: "Unread" },
  { id: "finished", label: "Finished" },
];

export default function BooksPage() {
  const router = useRouter();
  const [books, setBooks] = useState<ReadingEditionListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShelfFilter>("all");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/books", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/login?next=/books");
        return;
      }
      if (!response.ok) throw new Error("reading room request failed");
      const body = await response.json() as { books?: ReadingEditionListItem[] };
      setBooks(Array.isArray(body.books) ? body.books : []);
    } catch {
      setError("Your Reading Room could not be opened. Check your connection and try again.");
      setBooks((current) => current ?? []);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const visible = useMemo(() => {
    if (!books) return [];
    const needle = query.trim().toLowerCase();
    return books.filter((book) => {
      const progress = book.progress?.overallProgress ?? 0;
      if (needle && !`${book.title}\n${book.sourceFilename}`.toLowerCase().includes(needle)) return false;
      if (filter === "reading") return progress > 0 && progress < 99;
      if (filter === "unread") return progress < 1;
      if (filter === "finished") return progress >= 99;
      return true;
    });
  }, [books, filter, query]);

  const continueBook = books
    ?.filter((book) => (book.progress?.overallProgress ?? 0) > 0 && (book.progress?.overallProgress ?? 0) < 99)
    .sort((first, second) => Date.parse(second.progress?.updatedAt ?? "") - Date.parse(first.progress?.updatedAt ?? ""))[0];

  return <div className="page-wrap">
    <div className="content-measure">
      <header className="grid overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:grid-cols-[1.08fr_.92fr]">
        <div className="relative z-10 flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-signal">Full books · beautifully readable</p>
          <h1 className="display mt-4 max-w-[10ch] text-[clamp(3.4rem,11vw,6.6rem)] leading-[.86]">Your Reading Room.</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-white/75 sm:text-base">Keep every original word. BookQuest automatically matches a calm atmosphere, then remembers your place across signed-in devices.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/create" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-signal px-6 py-3 text-sm font-bold text-ink">Add a full book <AppIcon name="arrow" className="h-4 w-4" /></Link>
            <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-xs font-semibold text-white/80"><AppIcon name="spark" className="h-4 w-4" />No AI generation · no creation credit</span>
          </div>
        </div>
        <div className="relative min-h-72 border-t border-white/10 lg:min-h-[28rem] lg:border-l lg:border-t-0"><CourseWorld seed="bookquest-reading-room" theme="archive" progress={continueBook?.progress?.overallProgress ?? 22} title="Reading Room" className="absolute inset-0 min-h-full rounded-none" /></div>
      </header>

      {continueBook && <section className="relative z-10 mx-auto -mt-5 grid max-w-4xl gap-5 rounded-[1.45rem] border border-line bg-card p-5 shadow-pop sm:-mt-7 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6" aria-labelledby="continue-book-heading">
        <div className="flex min-w-0 items-start gap-4"><span className="relative grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-sky text-dusk shadow-card"><AppIcon name="bookmark" className="h-5 w-5" /><ArtifactCoverImage kind="book" artifactId={continueBook.id} contentHash={continueBook.coverHash} variant="book" rendition="thumbnail" /></span><div className="min-w-0"><p className="section-label">Continue where you left off</p><h2 id="continue-book-heading" className="mt-1 truncate text-lg font-bold">{continueBook.title}</h2><p className="mt-1 text-xs text-ink-soft">{Math.round(continueBook.progress?.overallProgress ?? 0)}% read · saved {new Date(continueBook.progress!.updatedAt).toLocaleDateString()}</p></div></div>
        <Link href={`/book/${continueBook.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">Continue reading <AppIcon name="arrow" className="h-4 w-4" /></Link>
      </section>}

      <section className="mt-10" aria-labelledby="book-shelf-heading">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="section-label">Full text · separate from courses and summaries</p><h2 id="book-shelf-heading" className="display mt-2 text-[clamp(2.7rem,7vw,4.5rem)] leading-[.92]">Your book shelf.</h2></div>{books && <p className="text-xs font-semibold text-ink-soft" aria-live="polite">{visible.length} of {books.length} book{books.length === 1 ? "" : "s"}</p>}</div>
        <div className="mt-6 rounded-[1.35rem] border border-line bg-card p-3 shadow-card sm:p-4">
          <label htmlFor="book-search" className="screen-reader-text">Search full books</label>
          <div className="flex min-h-12 items-center gap-3 rounded-xl border border-line-deep bg-ivory px-4 focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10"><AppIcon name="library" className="h-5 w-5 shrink-0 text-ink-soft" /><input id="book-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or filename" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-ink-soft/70 sm:text-sm" />{query && <button type="button" onClick={() => setQuery("")} className="grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-paper" aria-label="Clear book search">×</button>}</div>
          <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1" aria-label="Filter full books">{filters.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={`min-h-10 shrink-0 snap-start rounded-full border px-4 py-2 text-xs font-semibold ${filter === item.id ? "border-ink bg-ink text-white" : "border-line bg-paper/60 text-ink-soft hover:border-line-deep hover:text-ink"}`}>{item.label}</button>)}</div>
        </div>

        {error && <p role="alert" className="mt-5 rounded-xl bg-no-soft px-4 py-3 text-sm font-semibold text-no">{error} <button type="button" onClick={() => void load()} className="ml-2 underline">Try again</button></p>}
        {books === null && <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading full books">{[0, 1, 2].map((item) => <div key={item} className="h-[34rem] rounded-[1.4rem] skeleton" />)}</div>}
        {books?.length === 0 && !error && <div className="mt-6 rounded-[1.5rem] border border-dashed border-line-deep bg-card px-6 py-16 text-center shadow-card"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="library" className="h-5 w-5" /></span><h3 className="display mt-5 text-4xl">A quiet room is waiting.</h3><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-ink-soft">Upload a PDF, DOCX, Markdown, or text book and choose Full book. It opens immediately after extraction with no AI generation and no creation credit.</p><Link href="/create" className="btn-primary mt-7">Add your first full book <AppIcon name="arrow" className="h-4 w-4" /></Link></div>}
        {books && books.length > 0 && visible.length === 0 && <div className="mt-6 rounded-[1.5rem] border border-line bg-card px-6 py-14 text-center"><h3 className="display text-3xl">Nothing on this shelf matches.</h3><p className="mt-3 text-sm text-ink-soft">Try a broader search or another reading filter.</p><button type="button" onClick={() => { setQuery(""); setFilter("all"); }} className="quiet-button mt-6">Clear filters</button></div>}
        {visible.length > 0 && <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((book) => <ReadingEditionCard key={book.id} book={book} />)}</div>}
      </section>
    </div>
  </div>;
}
