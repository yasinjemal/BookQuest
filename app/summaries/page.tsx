"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppIcon from "@/components/AppIcon";
import SummaryGalleryCard, { isSummaryFailed, isSummaryReady } from "@/components/SummaryGalleryCard";
import type { SummaryListItem } from "@/lib/summary-types";

type LibraryFilter = "all" | "reading" | "unread" | "finished";
type StoredReadingProgress = { progress?: number; scrollY?: number; sectionId?: string; updatedAt?: string };

const filters: Array<{ id: LibraryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "reading", label: "In progress" },
  { id: "unread", label: "Unread" },
  { id: "finished", label: "Finished" },
];

function progressKey(id: SummaryListItem["id"]) {
  return `bookquest.summary.${id}.reading`;
}

function readProgress(id: SummaryListItem["id"]) {
  try {
    const stored = JSON.parse(localStorage.getItem(progressKey(id)) ?? "{}") as StoredReadingProgress;
    return Math.min(100, Math.max(0, Number(stored.progress) || 0));
  } catch {
    return 0;
  }
}

export default function SummariesPage() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<SummaryListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const refreshProgress = useCallback((items: SummaryListItem[]) => {
    setProgress(Object.fromEntries(items.map((summary) => [String(summary.id), readProgress(summary.id)])));
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/summaries", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/login?next=/summaries");
        return;
      }
      if (!response.ok) throw new Error("summary library request failed");
      const data = (await response.json()) as { summaries: SummaryListItem[] };
      const next = Array.isArray(data.summaries) ? data.summaries : [];
      setSummaries(next);
      refreshProgress(next);
    } catch {
      setError("Your Deep Reads could not be opened. Check your connection and try again.");
      setSummaries((current) => current ?? []);
    }
  }, [refreshProgress, router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!summaries?.some((summary) => !isSummaryReady(summary.status) && !isSummaryFailed(summary.status))) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load, summaries]);

  useEffect(() => {
    if (!summaries) return;
    const refresh = () => refreshProgress(summaries);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refreshProgress, summaries]);

  const visible = useMemo(() => {
    if (!summaries) return [];
    const needle = query.trim().toLowerCase();
    return summaries.filter((summary) => {
      const readingProgress = progress[String(summary.id)] ?? 0;
      const matchesQuery = !needle || `${summary.title}\n${summary.description ?? ""}\n${summary.source_filename}`.toLowerCase().includes(needle);
      if (!matchesQuery) return false;
      if (filter === "finished") return isSummaryReady(summary.status) && readingProgress >= 99;
      if (filter === "unread") return isSummaryReady(summary.status) && readingProgress < 1;
      if (filter === "reading") return (!isSummaryReady(summary.status) && !isSummaryFailed(summary.status)) || (readingProgress >= 1 && readingProgress < 99);
      return true;
    });
  }, [filter, progress, query, summaries]);

  const continueSummary = summaries
    ?.filter((summary) => isSummaryReady(summary.status) && (progress[String(summary.id)] ?? 0) > 0 && (progress[String(summary.id)] ?? 0) < 99)
    .sort((first, second) => (progress[String(second.id)] ?? 0) - (progress[String(first.id)] ?? 0))[0];
  const buildingCount = summaries?.filter((summary) => !isSummaryReady(summary.status) && !isSummaryFailed(summary.status)).length ?? 0;

  return (
    <div className="page-wrap">
      <div className="content-measure">
        <header className="grid overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:grid-cols-[1.08fr_.92fr]">
          <div className="relative z-10 flex flex-col justify-center p-7 sm:p-10 lg:p-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-signal">Your summary library</p>
            <h1 className="display mt-4 max-w-[10ch] text-[clamp(3.3rem,11vw,6.3rem)] leading-[0.87]">Deep Reads.</h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/72 sm:text-base">Read the argument, examples, nuance, and conclusion of a long document in one calm, source-linked edition. Your courses stay in their own learning space.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/create" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-signal px-6 py-3 text-sm font-bold text-ink">Create a Deep Read <AppIcon name="arrow" className="h-4 w-4" /></Link>
              <Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10">Open your courses</Link>
            </div>
          </div>

          <div className="relative min-h-72 overflow-hidden border-t border-white/10 bg-white/[.035] lg:min-h-[28rem] lg:border-l lg:border-t-0" aria-hidden="true">
            <div className="absolute inset-0 opacity-45" style={{ backgroundImage: "radial-gradient(circle at 72% 24%, rgba(216,255,99,.28), transparent 15rem), repeating-linear-gradient(120deg, transparent 0 35px, rgba(255,255,255,.04) 36px 37px)" }} />
            <div className="absolute left-[17%] top-[18%] h-[64%] w-[58%] rotate-[-7deg] rounded-[1.4rem] border border-white/15 bg-[#f4f0e6] shadow-[0_34px_80px_rgba(0,0,0,.32)]" />
            <div className="absolute left-[25%] top-[15%] h-[64%] w-[58%] rotate-[4deg] rounded-[1.4rem] border border-white/15 bg-[#dbe3ed] shadow-[0_28px_70px_rgba(0,0,0,.26)]" />
            <div className="absolute left-[21%] top-[12%] flex h-[64%] w-[58%] -rotate-1 flex-col rounded-[1.4rem] border border-white/15 bg-[#fbf8f1] p-7 text-ink shadow-[0_30px_80px_rgba(0,0,0,.32)]">
              <span className="h-1.5 w-14 rounded-full bg-teal" />
              <span className="display mt-6 text-4xl leading-[.9]">The whole thread, carried forward.</span>
              <span className="mt-auto text-[10px] font-bold uppercase tracking-[.18em] text-ink-soft">A BookQuest Deep Read</span>
            </div>
          </div>
        </header>

        {continueSummary && <section className="relative z-10 mx-auto -mt-5 grid max-w-4xl gap-5 overflow-hidden rounded-[1.45rem] border border-line bg-card p-5 shadow-pop sm:-mt-7 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6" aria-labelledby="continue-summary-heading">
          <div className="flex min-w-0 items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="bookmark" className="h-5 w-5" /></span><div className="min-w-0"><p className="section-label">Continue reading</p><h2 id="continue-summary-heading" className="mt-1 truncate text-lg font-bold">{continueSummary.title}</h2><p className="mt-1 text-xs text-ink-soft">{Math.round(progress[String(continueSummary.id)] ?? 0)}% read · about {Number(continueSummary.estimated_minutes) || 0} minutes total</p></div></div>
          <Link href={`/summary/${continueSummary.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">Continue <AppIcon name="arrow" className="h-4 w-4" /></Link>
        </section>}

        {buildingCount > 0 && <div role="status" className="mt-8 flex items-start gap-3 rounded-[1.2rem] border border-dusk/20 bg-sky/55 p-4 text-sm"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-dusk text-white"><AppIcon name="spark" className="h-4 w-4" /></span><div><strong>{buildingCount} Deep Read{buildingCount === 1 ? " is" : "s are"} being prepared.</strong><p className="mt-1 text-xs leading-5 text-ink-soft">You can leave this page. Ready sections appear here as the source is mapped and checked.</p></div></div>}

        <section className="mt-10" aria-labelledby="deep-read-shelf-heading">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="section-label">Separate from courses</p><h2 id="deep-read-shelf-heading" className="display mt-2 text-[clamp(2.7rem,7vw,4.5rem)] leading-[.92]">Your reading shelf.</h2></div>
            {summaries && <p className="text-xs font-semibold text-ink-soft" aria-live="polite">{visible.length} of {summaries.length} Deep Read{summaries.length === 1 ? "" : "s"}</p>}
          </div>

          <div className="mt-6 rounded-[1.35rem] border border-line bg-card p-3 shadow-card sm:p-4">
            <label htmlFor="summary-search" className="screen-reader-text">Search Deep Reads</label>
            <div className="flex min-h-12 items-center gap-3 rounded-xl border border-line-deep bg-ivory px-4 focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/10">
              <AppIcon name="library" className="h-5 w-5 shrink-0 text-ink-soft" />
              <input id="summary-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or source" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-ink-soft/70 sm:text-sm" />
              {query && <button type="button" onClick={() => setQuery("")} className="grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-paper" aria-label="Clear summary search">×</button>}
            </div>
            <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1" aria-label="Filter Deep Reads">
              {filters.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={`min-h-10 shrink-0 snap-start rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${filter === item.id ? "border-ink bg-ink text-white" : "border-line bg-paper/60 text-ink-soft hover:border-line-deep hover:text-ink"}`}>{item.label}</button>)}
            </div>
          </div>

          {error && <p role="alert" className="mt-5 rounded-xl bg-no-soft px-4 py-3 text-sm font-semibold text-no">{error} <button type="button" onClick={() => void load()} className="ml-2 underline">Try again</button></p>}

          {summaries === null && <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading Deep Reads">{[0, 1, 2].map((item) => <div key={item} className="h-[34rem] rounded-[1.4rem] skeleton" />)}</div>}

          {summaries?.length === 0 && !error && <div className="mt-6 rounded-[1.5rem] border border-dashed border-line-deep bg-card px-6 py-16 text-center shadow-card"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky text-dusk"><AppIcon name="library" className="h-5 w-5" /></span><h3 className="display mt-5 text-4xl">Your shelf is ready for its first book.</h3><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-ink-soft">Upload a long PDF, book, report, or set of notes and choose Deep summary. It will remain private until you decide otherwise.</p><Link href="/create" className="btn-primary mt-7">Create a Deep Read <AppIcon name="arrow" className="h-4 w-4" /></Link></div>}

          {summaries && summaries.length > 0 && visible.length === 0 && <div className="mt-6 rounded-[1.5rem] border border-line bg-card px-6 py-14 text-center"><h3 className="display text-3xl">Nothing on this shelf matches.</h3><p className="mt-3 text-sm text-ink-soft">Try a broader search or a different reading filter.</p><button type="button" onClick={() => { setQuery(""); setFilter("all"); }} className="quiet-button mt-6">Clear filters</button></div>}

          {visible.length > 0 && <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((summary) => <SummaryGalleryCard key={summary.id} summary={summary} readingProgress={progress[String(summary.id)] ?? 0} />)}</div>}
        </section>
      </div>
    </div>
  );
}
