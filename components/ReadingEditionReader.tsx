"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppIcon from "@/components/AppIcon";
import ArtifactCoverImage from "@/components/ArtifactCoverImage";
import CoverImageEditor from "@/components/CoverImageEditor";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import { readingAppearance, READING_VIBES } from "@/lib/reading-vibe";
import type {
  ReadingAtmosphereMode,
  ReadingEditionMetadata,
  ReadingProgress,
  ReadingSearchResult,
  ReadingUnit,
} from "@/lib/reading-types";
import styles from "./ReadingEditionReader.module.css";

type ReadingWidth = "focused" | "balanced" | "wide";
type ReadingEditionPreview = {
  book: ReadingEditionMetadata;
  units: ReadingUnit[];
  backHref?: string;
  backLabel?: string;
};
type StoredSettings = {
  fontSize?: number;
  lineHeight?: number;
  width?: ReadingWidth;
  atmosphere?: ReadingAtmosphereMode;
};

function progressKey(bookId: number) {
  return `bookquest.book.${bookId}.progress`;
}

function settingsKey() {
  return "bookquest.reading-room.settings";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function localProgress(bookId: number): ReadingProgress | null {
  try {
    const value = JSON.parse(localStorage.getItem(progressKey(bookId)) ?? "null") as ReadingProgress | null;
    if (!value || !Number.isInteger(value.unitIndex)) return null;
    return {
      unitIndex: Math.max(0, value.unitIndex),
      unitProgress: clamp(Number(value.unitProgress) || 0, 0, 100),
      overallProgress: clamp(Number(value.overallProgress) || 0, 0, 100),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    };
  } catch {
    return null;
  }
}

function newestProgress(server: ReadingProgress | null, local: ReadingProgress | null) {
  if (!server) return local;
  if (!local) return server;
  return Date.parse(local.updatedAt) > Date.parse(server.updatedAt) ? local : server;
}

function unitLabel(book: ReadingEditionMetadata, index: number) {
  const noun = book.unitKind === "page" ? "Page" : book.unitKind === "chapter" ? "Chapter" : "Section";
  return `${noun} ${index + 1} of ${book.sourceChapterCount}`;
}

function sourceBlocks(text: string) {
  return text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
}

function ReadingBlock({ block, index }: { block: string; index: number }) {
  const heading = block.match(/^(#{1,4})\s+([^\n]+)$/);
  if (heading) return <h2 className={styles.sourceHeading}>{heading[2]}</h2>;
  const lines = block.split("\n");
  if (lines.length > 1 && lines.every((line) => /^\s*[-*]\s+/.test(line))) {
    return <ul className={styles.sourceList}>{lines.map((line, item) => <li key={`${index}-${item}`}>{line.replace(/^\s*[-*]\s+/, "")}</li>)}</ul>;
  }
  return <p className={styles.sourceParagraph}>{block}</p>;
}

export default function ReadingEditionReader({
  bookId,
  preview,
}: {
  bookId: number;
  preview?: ReadingEditionPreview;
}) {
  const [book, setBook] = useState<ReadingEditionMetadata | null>(null);
  const [unit, setUnit] = useState<ReadingUnit | null>(null);
  const [unitIndex, setUnitIndex] = useState(0);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [unitLoading, setUnitLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCover, setShowCover] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [atmosphere, setAtmosphere] = useState<ReadingAtmosphereMode>("auto");
  const [fontSize, setFontSize] = useState(19);
  const [lineHeight, setLineHeight] = useState(1.82);
  const [width, setWidth] = useState<ReadingWidth>("balanced");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReadingSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const unitCache = useRef(new Map<number, ReadingUnit>());
  const unitRequest = useRef(0);
  const pendingRestore = useRef(0);
  const articleRef = useRef<HTMLElement>(null);
  const tocDialog = useRef<HTMLDialogElement>(null);
  const appearanceDialog = useRef<HTMLDialogElement>(null);
  const progressRef = useRef<ReadingProgress | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem(settingsKey()) ?? "{}") as StoredSettings;
      if (Number.isFinite(settings.fontSize)) setFontSize(clamp(Number(settings.fontSize), 16, 25));
      if (Number.isFinite(settings.lineHeight)) setLineHeight(clamp(Number(settings.lineHeight), 1.55, 2.05));
      if (settings.width === "focused" || settings.width === "balanced" || settings.width === "wide") setWidth(settings.width);
      if (settings.atmosphere === "auto" || settings.atmosphere === "paper" || settings.atmosphere === "night" || settings.atmosphere === "focus") setAtmosphere(settings.atmosphere);
    } catch {
      // Reader settings are optional and can safely fall back to defaults.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(settingsKey(), JSON.stringify({ fontSize, lineHeight, width, atmosphere } satisfies StoredSettings));
  }, [atmosphere, fontSize, lineHeight, width]);

  const fetchUnit = useCallback(async (index: number) => {
    const cached = unitCache.current.get(index);
    if (cached) return cached;
    if (preview) {
      const fixture = preview.units.find((item) => item.index === index);
      if (!fixture) throw new Error("This part of the demo could not be opened.");
      unitCache.current.set(index, fixture);
      return fixture;
    }
    const response = await fetch(`/api/books/${bookId}/units/${index}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { unit?: ReadingUnit; error?: string };
    if (!response.ok || !body.unit) throw new Error(body.error ?? "This part of the book could not be opened.");
    unitCache.current.set(index, body.unit);
    return body.unit;
  }, [bookId, preview]);

  const openUnit = useCallback(async (index: number, restoreAt = 0) => {
    if (!book || index < 0 || index >= book.sourceChapterCount) return;
    const request = ++unitRequest.current;
    setUnitLoading(true);
    setError("");
    try {
      const next = await fetchUnit(index);
      if (request !== unitRequest.current) return;
      pendingRestore.current = clamp(restoreAt, 0, 100);
      setUnit(next);
      setUnitIndex(index);
      setShowCover(false);
      tocDialog.current?.close();
      for (const neighbor of [index - 1, index + 1]) {
        if (neighbor >= 0 && neighbor < book.sourceChapterCount) void fetchUnit(neighbor).catch(() => undefined);
      }
    } catch (cause) {
      if (request === unitRequest.current) setError(cause instanceof Error ? cause.message : "This part of the book could not be opened.");
    } finally {
      if (request === unitRequest.current) setUnitLoading(false);
    }
  }, [book, fetchUnit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (preview) {
        const restored = newestProgress(preview.book.progress, localProgress(bookId));
        const safeIndex = clamp(restored?.unitIndex ?? 0, 0, Math.max(0, preview.book.sourceChapterCount - 1));
        const first = await fetchUnit(safeIndex);
        setBook(preview.book);
        setProgress(restored);
        progressRef.current = restored;
        setShowCover(!restored || restored.overallProgress < 0.5);
        pendingRestore.current = restored?.unitProgress ?? 0;
        setUnit(first);
        setUnitIndex(safeIndex);
        return;
      }
      const response = await fetch(`/api/books/${bookId}`, { cache: "no-store" });
      if (response.status === 401) {
        location.href = `/login?next=/book/${bookId}`;
        return;
      }
      const body = await response.json().catch(() => ({})) as { book?: ReadingEditionMetadata; error?: string };
      if (!response.ok || !body.book) throw new Error(body.error ?? "This book could not be opened.");
      setBook(body.book);
      const restored = newestProgress(body.book.progress, localProgress(bookId));
      const safeIndex = clamp(restored?.unitIndex ?? 0, 0, Math.max(0, body.book.sourceChapterCount - 1));
      setProgress(restored);
      progressRef.current = restored;
      setShowCover(!restored || restored.overallProgress < 0.5);
      const first = await fetchUnit(safeIndex);
      unitCache.current.set(safeIndex, first);
      pendingRestore.current = restored?.unitProgress ?? 0;
      setUnit(first);
      setUnitIndex(safeIndex);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This book could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [bookId, fetchUnit, preview]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!unit || showCover) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const article = articleRef.current;
      if (!article) return;
      const top = article.offsetTop - 88;
      const available = Math.max(0, article.offsetHeight - window.innerHeight + 180);
      window.scrollTo({ top: top + available * (pendingRestore.current / 100), behavior: "auto" });
      pendingRestore.current = 0;
    }));
    return () => cancelAnimationFrame(frame);
  }, [showCover, unit]);

  const syncProgress = useCallback((value: ReadingProgress, keepalive = false) => {
    localStorage.setItem(progressKey(bookId), JSON.stringify(value));
    if (preview) return;
    void fetch(`/api/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
      keepalive,
    }).catch(() => undefined);
  }, [bookId, preview]);

  useEffect(() => {
    if (!book || !unit || showCover) return;
    const measure = () => {
      const article = articleRef.current;
      if (!article) return;
      const top = article.offsetTop - 88;
      const available = Math.max(1, article.offsetHeight - window.innerHeight + 180);
      const unitProgress = clamp(((window.scrollY - top) / available) * 100, 0, 100);
      const overallProgress = clamp(((unitIndex + unitProgress / 100) / book.sourceChapterCount) * 100, 0, 100);
      const next = { unitIndex, unitProgress, overallProgress, updatedAt: new Date().toISOString() };
      progressRef.current = next;
      setProgress(next);
      localStorage.setItem(progressKey(bookId), JSON.stringify(next));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => syncProgress(next), 2500);
    };
    const onScroll = () => {
      if (scrollTimer.current) return;
      scrollTimer.current = setTimeout(() => {
        scrollTimer.current = null;
        measure();
      }, 120);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, [book, bookId, showCover, syncProgress, unit, unitIndex]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && progressRef.current) syncProgress(progressRef.current, true);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [syncProgress]);

  useEffect(() => {
    if (!book || query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    if (preview) {
      const needle = query.trim().toLowerCase();
      setSearchResults(preview.units.filter((item) => `${item.title}\n${item.text}`.toLowerCase().includes(needle)).slice(0, 24).map((item) => ({ index: item.index, title: item.title, snippet: item.text.replace(/\s+/g, " ").slice(0, 180) })));
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/books/${bookId}?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => response.json())
        .then((body: { results?: ReadingSearchResult[] }) => setSearchResults(body.results ?? []))
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [book, bookId, preview, query]);

  const moveTo = useCallback((nextIndex: number, completingCurrent = false) => {
    if (!book) return;
    if (progressRef.current) {
      const current = completingCurrent
        ? { ...progressRef.current, unitProgress: 100, overallProgress: ((unitIndex + 1) / book.sourceChapterCount) * 100, updatedAt: new Date().toISOString() }
        : progressRef.current;
      syncProgress(current);
    }
    void openUnit(nextIndex, 0);
  }, [book, openUnit, syncProgress, unitIndex]);

  async function removeBook() {
    if (preview) return;
    if (!book || !confirm(`Remove “${book.title}” and its saved reading progress? This cannot be undone.`)) return;
    setDeleteError("");
    const response = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      setDeleteError(body.error ?? "The book could not be removed.");
      return;
    }
    location.href = "/books";
  }

  const blocks = useMemo(() => sourceBlocks(unit?.text ?? ""), [unit]);

  if (loading) return <main className={styles.loadingPage} aria-label="Opening Reading Edition"><p role="status" className="screen-reader-text">Opening Reading Edition…</p><div className="skeleton" /><div className="skeleton" /></main>;
  if (!book || !unit) return <main className={styles.messagePage}><AppIcon name="library" /><h1 className="display">We could not open this book.</h1><p role="alert">{error || "The Reading Edition returned no content."}</p><div><button type="button" onClick={() => void load()} className="btn-primary">Try again</button><Link href={preview?.backHref ?? "/books"} className="quiet-button">Return to {preview?.backLabel ?? "Reading Room"}</Link></div></main>;

  const appearance = readingAppearance(book.vibeId, atmosphere);
  const vibe = READING_VIBES[atmosphere === "auto" ? book.vibeId : atmosphere === "night" ? "night-ink" : atmosphere === "focus" ? "clear-day" : "archive-glow"];
  const visibleProgress = progress?.overallProgress ?? 0;

  return <CourseAppearanceFrame appearance={appearance} className={`${styles.themeFrame} ${focusMode ? styles.focusMode : ""}`}>
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href={preview?.backHref ?? "/books"} className={styles.backLink} aria-label={`Return to ${preview?.backLabel ?? "Reading Room"}`}><span aria-hidden="true">←</span><span>{preview?.backLabel ?? "Reading Room"}</span></Link>
          <div className={styles.titleLockup}><strong>{book.title}</strong><span>{showCover ? "Reading Edition" : `${Math.round(visibleProgress)}% · ${unitLabel(book, unitIndex)}`}</span></div>
          <div className={styles.topActions}>
            <button type="button" onClick={() => tocDialog.current?.showModal()} aria-label="Open contents and search"><AppIcon name="library" /><span>Contents</span></button>
            <button type="button" onClick={() => appearanceDialog.current?.showModal()} aria-label="Open reading appearance"><span aria-hidden="true">Aa</span><span>Vibe</span></button>
            <button type="button" onClick={() => setFocusMode((current) => !current)} aria-pressed={focusMode} aria-label={focusMode ? "Leave focus mode" : "Enter focus mode"}><AppIcon name="bookmark" /><span>{focusMode ? "Leave focus" : "Focus"}</span></button>
          </div>
        </div>
        <div className={styles.headerProgress} role="progressbar" aria-label={`Reading progress through ${book.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(visibleProgress)}><span style={{ width: `${visibleProgress}%` }} /></div>
      </header>

      {showCover ? <main className={styles.coverLayout}>
        <section className={styles.cover}>
          <div className={styles.coverCopy}>
            <p>BookQuest Reading Edition</p>
            <h1 className="display">{book.title}</h1>
            <p className={styles.vibeNote}>{vibe.name} · automatically matched from the book’s structure and language without AI</p>
            <dl className={styles.coverStats}>
              <div><dt>Full text</dt><dd>{book.wordCount.toLocaleString()} words</dd></div>
              <div><dt>Reading time</dt><dd>About {book.estimatedMinutes} min</dd></div>
              <div><dt>{book.unitKind === "page" ? "Pages" : book.unitKind === "chapter" ? "Chapters" : "Sections"}</dt><dd>{book.sourceChapterCount}</dd></div>
            </dl>
            <button type="button" onClick={() => void openUnit(unitIndex, progress?.unitProgress ?? 0)} className={styles.beginButton}>{visibleProgress > 0 ? "Continue reading" : "Begin the book"}<AppIcon name="arrow" /></button>
            <small>{preview ? "Original words preserved · demo progress stays in this browser · no AI reading charge" : "Original words preserved · private to your account · no AI reading charge"}</small>
          </div>
          <div className={styles.coverWorld}><CourseWorld seed={`${book.id}:${book.title}`} theme={appearance.worldTheme} title={book.title} progress={visibleProgress} className={styles.world} /><ArtifactCoverImage kind="book" artifactId={book.id} contentHash={book.coverHash} variant="book" priority /></div>
        </section>
      </main> : <div className={styles.readerLayout}>
        {!focusMode && <aside className={styles.contentsRail} aria-label="Book contents">
          <p>Contents</p>
          <nav>{book.outline.map((item) => <button key={item.index} type="button" onClick={() => void openUnit(item.index)} aria-current={item.index === unitIndex ? "page" : undefined} className={item.index === unitIndex ? styles.currentUnit : ""}><span>{String(item.index + 1).padStart(2, "0")}</span><strong>{item.title}</strong></button>)}</nav>
        </aside>}

        <main className={styles.readingColumn}>
          {error && <p role="alert" className={styles.inlineError}>{error} <button type="button" onClick={() => void openUnit(unitIndex, progress?.unitProgress ?? 0)}>Try again</button></p>}
          <article ref={articleRef} className={`${styles.readingPaper} ${unitLoading ? styles.unitLoading : ""}`} style={{ "--reader-font-size": `${fontSize}px`, "--reader-line-height": lineHeight, "--reader-measure": width === "focused" ? "36rem" : width === "wide" ? "50rem" : "43rem" } as React.CSSProperties} aria-busy={unitLoading}>
            <header className={styles.unitHeader}><p>{unitLabel(book, unitIndex)}</p><h1 className="display">{unit.title}</h1><span>{unit.wordCount.toLocaleString()} words · about {Math.max(1, Math.ceil(unit.wordCount / 230))} min</span></header>
            <div className={styles.prose}>{blocks.map((block, index) => <ReadingBlock key={index} block={block} index={index} />)}</div>
            <footer className={styles.unitFooter}>
              {unitIndex > 0 ? <button type="button" onClick={() => moveTo(unitIndex - 1)}><span>Previous</span><strong>{unit.previousTitle}</strong></button> : <span />}
              {unitIndex < book.sourceChapterCount - 1 ? <button type="button" onClick={() => moveTo(unitIndex + 1, true)}><span>Next</span><strong>{unit.nextTitle}</strong></button> : <Link href={preview?.backHref ?? "/books"}><span>Finished</span><strong>{preview ? "Return to demo gallery" : "Return to your shelf"}</strong></Link>}
            </footer>
          </article>
        </main>
      </div>}

      <dialog ref={tocDialog} className={styles.dialog} onClose={() => setQuery("")}>
        <header><div><p>Navigate the full text</p><h2 className="display">Contents</h2></div><button type="button" onClick={() => tocDialog.current?.close()} aria-label="Close contents">×</button></header>
        <label className={styles.searchLabel}>Find in this book<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the full text" autoFocus /></label>
        <div className={styles.dialogBody}>
          {query.trim().length >= 2 ? <div className={styles.searchResults} aria-live="polite"><p>{searching ? "Searching…" : `${searchResults.length} matching ${searchResults.length === 1 ? "section" : "sections"}`}</p>{searchResults.map((result) => <button key={result.index} type="button" onClick={() => void openUnit(result.index)}><strong>{result.title}</strong><span>{result.snippet}</span></button>)}</div> : <nav className={styles.dialogContents} aria-label="Full table of contents"><button type="button" onClick={() => { setShowCover(true); tocDialog.current?.close(); }} aria-current={showCover ? "page" : undefined}><span>00</span><strong>Book cover</strong><small>About this edition</small></button>{book.outline.map((item) => <button key={item.index} type="button" onClick={() => void openUnit(item.index)} aria-current={!showCover && item.index === unitIndex ? "page" : undefined}><span>{String(item.index + 1).padStart(2, "0")}</span><strong>{item.title}</strong><small>{item.wordCount.toLocaleString()} words</small></button>)}</nav>}
        </div>
      </dialog>

      <dialog ref={appearanceDialog} className={styles.dialog}>
        <header><div><p>Make the room yours</p><h2 className="display">Reading vibe</h2></div><button type="button" onClick={() => appearanceDialog.current?.close()} aria-label="Close reading appearance">×</button></header>
        <div className={styles.settingsBody}>
          {!preview && <fieldset><legend>Book cover</legend><div className={styles.coverSettingPreview} aria-label="Current book cover preview"><CourseWorld seed={`${book.id}:${book.title}:settings`} theme={appearance.worldTheme} title={book.title} progress={visibleProgress} className={styles.world} /><ArtifactCoverImage kind="book" artifactId={book.id} contentHash={book.coverHash} variant="book" /></div><CoverImageEditor kind="book" artifactId={book.id} title={book.title} coverHash={book.coverHash} compact onChanged={(coverHash) => setBook((current) => current ? { ...current, coverHash } : current)} /></fieldset>}
          <fieldset><legend>Atmosphere</legend><div className={styles.modeGrid}>{(["auto", "paper", "night", "focus"] as const).map((mode) => <label key={mode}><input type="radio" name="reading-atmosphere" value={mode} checked={atmosphere === mode} onChange={() => setAtmosphere(mode)} /><span>{mode === "auto" ? `Auto · ${READING_VIBES[book.vibeId].name}` : mode === "paper" ? "Paper" : mode === "night" ? "Night" : "Clear focus"}</span></label>)}</div><small>Auto uses deterministic source signals. It never calls an AI model.</small></fieldset>
          <fieldset><legend>Text size</legend><div className={styles.stepper}><button type="button" onClick={() => setFontSize((value) => clamp(value - 1, 16, 25))} aria-label="Decrease text size">A−</button><span>{fontSize}px</span><button type="button" onClick={() => setFontSize((value) => clamp(value + 1, 16, 25))} aria-label="Increase text size">A+</button></div></fieldset>
          <fieldset><legend>Line spacing</legend><div className={styles.stepper}><button type="button" onClick={() => setLineHeight((value) => clamp(Number((value - 0.08).toFixed(2)), 1.55, 2.05))} aria-label="Decrease line spacing">−</button><span>{lineHeight.toFixed(2)}</span><button type="button" onClick={() => setLineHeight((value) => clamp(Number((value + 0.08).toFixed(2)), 1.55, 2.05))} aria-label="Increase line spacing">+</button></div></fieldset>
          <fieldset><legend>Reading width</legend><div className={styles.modeGrid}>{(["focused", "balanced", "wide"] as const).map((option) => <label key={option}><input type="radio" name="reading-width" value={option} checked={width === option} onChange={() => setWidth(option)} /><span>{option[0].toUpperCase() + option.slice(1)}</span></label>)}</div></fieldset>
          <button type="button" className={styles.focusButton} onClick={() => { setFocusMode((current) => !current); appearanceDialog.current?.close(); }}>{focusMode ? "Leave distraction-free mode" : "Enter distraction-free mode"}</button>
          {!preview && <div className={styles.dangerZone}><strong>Remove from Reading Room</strong><p>This deletes the private full text and synced reading position.</p><button type="button" onClick={() => void removeBook()}>Remove this book</button>{deleteError && <p role="alert">{deleteError}</p>}</div>}
        </div>
      </dialog>
    </div>
  </CourseAppearanceFrame>;
}
