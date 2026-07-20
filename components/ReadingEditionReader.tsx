"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppIcon from "@/components/AppIcon";
import ArtifactCoverImage from "@/components/ArtifactCoverImage";
import CoverImageEditor from "@/components/CoverImageEditor";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import LongReadingDock from "@/components/LongReadingDock";
import LumenField from "@/components/LumenField";
import ReadingSpine from "@/components/ReadingSpine";
import {
  isSightlineMode,
  sanitizeQuestMarks,
  VOYAGE_GOALS,
  type QuestMark,
  type SightlineMode,
  type VoyageGoal,
} from "@/lib/long-reading";
import {
  parseReadingDisplayBlocks,
  readingBookProgress,
  readingUnitProgress,
  reconcileReadingProgress,
  remainingReadingMinutes,
  type ReadingDisplayBlock,
} from "@/lib/reading-content";
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
type VoyageSession = { id: number; goal: VoyageGoal };
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
  lumen?: boolean;
  focus?: boolean;
  sightline?: SightlineMode;
};

function progressKey(bookId: number) {
  return `bookquest.book.${bookId}.progress`;
}

function settingsKey() {
  return "bookquest.reading-room.settings";
}

function questMarksKey(bookId: number) {
  return `bookquest.book.${bookId}.quest-marks`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing and storage quotas must never block reading.
  }
}

function localProgress(bookId: number): ReadingProgress | null {
  const value = readStoredJson<ReadingProgress | null>(progressKey(bookId), null);
  if (!value || !Number.isInteger(value.unitIndex)) return null;
  return {
    unitIndex: Math.max(0, value.unitIndex),
    unitProgress: clamp(Number(value.unitProgress) || 0, 0, 100),
    overallProgress: clamp(Number(value.overallProgress) || 0, 0, 100),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    passageId: typeof value.passageId === "string" ? value.passageId : undefined,
  };
}

function unitLabel(book: ReadingEditionMetadata, index: number) {
  const noun = book.unitKind === "page" ? "Page" : book.unitKind === "chapter" ? "Chapter" : "Section";
  return `${noun} ${index + 1} of ${book.sourceChapterCount}`;
}

function timeLeftLabel(minutes: number) {
  if (minutes <= 0) return "Last passage";
  return minutes === 1 ? "About 1 min left" : `About ${minutes} min left`;
}

function voyageGoalName(goal: (typeof VOYAGE_GOALS)[number]) {
  return goal === "open" ? "Open voyage" : `${goal} minutes`;
}

function voyageGoalDescription(goal: (typeof VOYAGE_GOALS)[number]) {
  if (goal === "open") return "No clock. Keep only active reading time.";
  if (goal === 25) return "A focused chapter-sized journey.";
  if (goal === 45) return "Settle into a substantial reading arc.";
  return "A long horizon with a natural stopping point.";
}

function displayUnitTitle(title: string) {
  return title.replace(/\s+([·—])\s+/gu, " $1 ");
}

function ReadingBlock({
  block,
  index,
  active,
  nearby,
}: {
  block: ReadingDisplayBlock;
  index: number;
  active: boolean;
  nearby: boolean;
}) {
  const style = {
    "--passage-signal": block.signal,
    "--passage-phase": block.phase,
  } as CSSProperties;
  let content;
  if (block.kind === "heading") {
    const Heading = `h${block.headingLevel ?? 2}` as "h2" | "h3" | "h4";
    content = <Heading className={styles.sourceHeading}>{block.text}</Heading>;
  } else if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    content = <List className={styles.sourceList}>{block.items.map((item, itemIndex) => <li key={`${block.id}-${itemIndex}`}>{item}</li>)}</List>;
  } else if (block.kind === "quote") {
    content = <blockquote className={styles.sourceQuote}>{block.text}</blockquote>;
  } else {
    content = <p className={styles.sourceParagraph}>{block.text}</p>;
  }

  return (
    <div
      id={block.id}
      data-reading-passage={index}
      data-active={active ? "true" : undefined}
      data-nearby={nearby ? "true" : undefined}
      className={styles.passage}
      style={style}
    >
      <span className={styles.passageMarker} aria-hidden="true">
        <i />
        <small>{String(index + 1).padStart(2, "0")}</small>
      </span>
      {content}
    </div>
  );
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
  const [lumenMode, setLumenMode] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [sightline, setSightline] = useState<SightlineMode>("off");
  const [voyageSession, setVoyageSession] = useState<VoyageSession | null>(null);
  const [restHarborMilliseconds, setRestHarborMilliseconds] = useState<number | null>(null);
  const [questMarks, setQuestMarks] = useState<QuestMark[]>([]);
  const [questMarksReady, setQuestMarksReady] = useState(false);
  const [atmosphere, setAtmosphere] = useState<ReadingAtmosphereMode>("auto");
  const [fontSize, setFontSize] = useState(19);
  const [lineHeight, setLineHeight] = useState(1.82);
  const [width, setWidth] = useState<ReadingWidth>("balanced");
  const [settingsReady, setSettingsReady] = useState(false);
  const [positionReady, setPositionReady] = useState(false);
  const [navigationToken, setNavigationToken] = useState(0);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReadingSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [readerAnnouncement, setReaderAnnouncement] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const unitCache = useRef(new Map<number, ReadingUnit>());
  const unitRequest = useRef(0);
  const searchRequest = useRef(0);
  const pendingRestore = useRef(0);
  const pendingPassageRestore = useRef<string | null>(null);
  const pendingHeadingFocus = useRef(false);
  const activeBlockRef = useRef(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const unitHeadingRef = useRef<HTMLHeadingElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const tocDialog = useRef<HTMLDialogElement>(null);
  const appearanceDialog = useRef<HTMLDialogElement>(null);
  const voyageDialog = useRef<HTMLDialogElement>(null);
  const progressRef = useRef<ReadingProgress | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const scrollFrame = useRef<number | null>(null);

  const blocks = useMemo(() => parseReadingDisplayBlocks(unit?.text ?? ""), [unit]);
  const activeBlock = blocks[activeBlockIndex] ?? blocks[0] ?? null;
  const activeMarkId = activeBlock ? `${unitIndex}:${activeBlock.id}` : null;
  const activePassageMarked = Boolean(activeMarkId && questMarks.some((mark) => mark.id === activeMarkId));

  useEffect(() => {
    const settings = readStoredJson<StoredSettings>(settingsKey(), {});
    if (Number.isFinite(settings.fontSize)) setFontSize(clamp(Number(settings.fontSize), 16, 25));
    if (Number.isFinite(settings.lineHeight)) setLineHeight(clamp(Number(settings.lineHeight), 1.55, 2.05));
    if (settings.width === "focused" || settings.width === "balanced" || settings.width === "wide") setWidth(settings.width);
    if (settings.atmosphere === "auto" || settings.atmosphere === "paper" || settings.atmosphere === "night" || settings.atmosphere === "focus") setAtmosphere(settings.atmosphere);
    if (typeof settings.lumen === "boolean") setLumenMode(settings.lumen);
    if (typeof settings.focus === "boolean") setFocusMode(settings.focus);
    if (isSightlineMode(settings.sightline)) setSightline(settings.sightline);
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    writeStoredJson(settingsKey(), { fontSize, lineHeight, width, atmosphere, lumen: lumenMode, focus: focusMode, sightline } satisfies StoredSettings);
  }, [atmosphere, focusMode, fontSize, lineHeight, lumenMode, settingsReady, sightline, width]);

  useEffect(() => {
    setQuestMarks(sanitizeQuestMarks(readStoredJson<unknown>(questMarksKey(bookId), [])));
    setQuestMarksReady(true);
  }, [bookId]);

  useEffect(() => {
    if (!questMarksReady) return;
    writeStoredJson(questMarksKey(bookId), questMarks);
  }, [bookId, questMarks, questMarksReady]);

  const rememberUnit = useCallback((next: ReadingUnit) => {
    unitCache.current.set(next.index, next);
    if (unitCache.current.size <= 7) return;
    const oldest = unitCache.current.keys().next().value as number | undefined;
    if (oldest !== undefined && oldest !== next.index) unitCache.current.delete(oldest);
  }, []);

  const fetchUnit = useCallback(async (index: number) => {
    const cached = unitCache.current.get(index);
    if (cached) return cached;
    if (preview) {
      const fixture = preview.units.find((item) => item.index === index);
      if (!fixture) throw new Error("This part of the demo could not be opened.");
      rememberUnit(fixture);
      return fixture;
    }
    const response = await fetch(`/api/books/${bookId}/units/${index}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { unit?: ReadingUnit; error?: string };
    if (!response.ok || !body.unit) throw new Error(body.error ?? "This part of the book could not be opened.");
    rememberUnit(body.unit);
    return body.unit;
  }, [bookId, preview, rememberUnit]);

  const syncProgress = useCallback((value: ReadingProgress, keepalive = false) => {
    progressRef.current = value;
    setProgress(value);
    writeStoredJson(progressKey(bookId), value);
    if (preview) return;
    const send = async () => {
      await fetch(`/api/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
        keepalive,
      }).catch(() => undefined);
    };
    saveQueue.current = saveQueue.current.then(send, send);
  }, [bookId, preview]);

  const openUnit = useCallback(async (index: number, restoreAt = 0, passageId?: string) => {
    if (!book || index < 0 || index >= book.sourceChapterCount) return;
    const request = ++unitRequest.current;
    setUnitLoading(true);
    setError("");
    try {
      const next = await fetchUnit(index);
      if (request !== unitRequest.current) return;
      pendingRestore.current = clamp(restoreAt, 0, 100);
      pendingPassageRestore.current = passageId ?? null;
      pendingHeadingFocus.current = true;
      setReaderAnnouncement("");
      setPositionReady(false);
      setNavigationToken((current) => current + 1);
      activeBlockRef.current = 0;
      setActiveBlockIndex(0);
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
    setPositionReady(false);
    setError("");
    try {
      if (preview) {
        const restored = reconcileReadingProgress(preview.book.progress, localProgress(bookId));
        const safeIndex = clamp(restored?.unitIndex ?? 0, 0, Math.max(0, preview.book.sourceChapterCount - 1));
        const first = await fetchUnit(safeIndex);
        setBook(preview.book);
        setProgress(restored);
        progressRef.current = restored;
        setShowCover(!restored || restored.overallProgress < 0.5);
        pendingRestore.current = restored?.unitProgress ?? 0;
        pendingPassageRestore.current = restored?.passageId ?? null;
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
      const restored = reconcileReadingProgress(body.book.progress, localProgress(bookId));
      const safeIndex = clamp(restored?.unitIndex ?? 0, 0, Math.max(0, body.book.sourceChapterCount - 1));
      setProgress(restored);
      progressRef.current = restored;
      setShowCover(!restored || restored.overallProgress < 0.5);
      const first = await fetchUnit(safeIndex);
      rememberUnit(first);
      pendingRestore.current = restored?.unitProgress ?? 0;
      pendingPassageRestore.current = restored?.passageId ?? null;
      setUnit(first);
      setUnitIndex(safeIndex);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This book could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [bookId, fetchUnit, preview, rememberUnit]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!book || !unit || showCover) return;
    let secondFrame: number | null = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const article = articleRef.current;
        if (!article) return;
        const passageId = pendingPassageRestore.current;
        const passage = passageId ? document.getElementById(passageId) : null;
        if (passage && article.contains(passage)) {
          const index = blocks.findIndex((block) => block.id === passageId);
          if (index >= 0) {
            activeBlockRef.current = index;
            setActiveBlockIndex(index);
          }
          const top = window.scrollY + passage.getBoundingClientRect().top - window.innerHeight * .32;
          window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
        } else if (blocks.length > 0) {
          const totalWords = Math.max(1, blocks.reduce((total, block) => total + block.wordCount, 0));
          const targetWords = totalWords * (pendingRestore.current / 100);
          let accumulatedWords = 0;
          let targetIndex = 0;
          for (let index = 0; index < blocks.length; index += 1) {
            accumulatedWords += blocks[index].wordCount;
            targetIndex = index;
            if (accumulatedWords >= targetWords) break;
          }
          const target = article.querySelector<HTMLElement>(`[data-reading-passage="${targetIndex}"]`);
          activeBlockRef.current = targetIndex;
          setActiveBlockIndex(targetIndex);
          if (target) {
            const top = window.scrollY + target.getBoundingClientRect().top - window.innerHeight * .32;
            window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
          }
        } else {
          const headerHeight = topbarRef.current?.offsetHeight ?? 72;
          const articleTop = window.scrollY + article.getBoundingClientRect().top - headerHeight;
          const available = Math.max(0, article.offsetHeight - window.innerHeight + headerHeight + 72);
          window.scrollTo({ top: articleTop + available * (pendingRestore.current / 100), behavior: "auto" });
        }
        pendingRestore.current = 0;
        pendingPassageRestore.current = null;
        if (pendingHeadingFocus.current) {
          unitHeadingRef.current?.focus({ preventScroll: true });
          setReaderAnnouncement(`Opened ${unitLabel(book, unit.index)}: ${unit.title}`);
          pendingHeadingFocus.current = false;
        }
        setPositionReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [blocks, book, navigationToken, showCover, unit]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || showCover || blocks.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;
    const targets = Array.from(article.querySelectorAll<HTMLElement>("[data-reading-passage]"));
    const visible = new Map<Element, IntersectionObserverEntry>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target, entry);
        else visible.delete(entry.target);
      }
      const viewportAnchor = window.innerHeight * .42;
      const next = [...visible.values()].sort((first, second) => {
        const firstDistance = Math.abs(first.boundingClientRect.top + first.boundingClientRect.height / 2 - viewportAnchor);
        const secondDistance = Math.abs(second.boundingClientRect.top + second.boundingClientRect.height / 2 - viewportAnchor);
        return firstDistance - secondDistance;
      })[0];
      const index = Number(next?.target.getAttribute("data-reading-passage"));
      if (!Number.isInteger(index) || index === activeBlockRef.current) return;
      activeBlockRef.current = index;
      setActiveBlockIndex(index);
    }, { rootMargin: "-24% 0px -50%", threshold: [0, .01, .25, .6] });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [blocks, showCover]);

  useEffect(() => {
    if (!book || !unit || showCover || !positionReady) return;
    const measure = () => {
      const article = articleRef.current;
      if (!article) return;
      const headerHeight = topbarRef.current?.offsetHeight ?? 72;
      const readingAnchor = headerHeight + Math.max(0, window.innerHeight - headerHeight) * .42;
      let passageIndex = clamp(activeBlockRef.current, 0, Math.max(0, blocks.length - 1));
      if (typeof IntersectionObserver === "undefined") {
        const passages = Array.from(article.querySelectorAll<HTMLElement>("[data-reading-passage]"));
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const candidate of passages) {
          const rect = candidate.getBoundingClientRect();
          const distance = rect.top <= readingAnchor && rect.bottom >= readingAnchor
            ? 0
            : Math.min(Math.abs(rect.top - readingAnchor), Math.abs(rect.bottom - readingAnchor));
          if (distance < nearestDistance) {
            nearestDistance = distance;
            passageIndex = Number(candidate.dataset.readingPassage) || 0;
          }
        }
        if (passageIndex !== activeBlockRef.current) {
          activeBlockRef.current = passageIndex;
          setActiveBlockIndex(passageIndex);
        }
      }
      const passage = article.querySelector<HTMLElement>(`[data-reading-passage="${passageIndex}"]`);
      const passageRect = passage?.getBoundingClientRect();
      const passageFraction = passageRect
        ? clamp((readingAnchor - passageRect.top) / Math.max(1, passageRect.height), 0, 1)
        : 0;
      const unitProgress = readingUnitProgress(blocks, passageIndex, passageFraction);
      const overallProgress = readingBookProgress(book.outline, unitIndex, unitProgress);
      const next: ReadingProgress = {
        unitIndex,
        unitProgress,
        overallProgress,
        updatedAt: new Date().toISOString(),
        passageId: blocks[passageIndex]?.id,
      };
      progressRef.current = next;
      setProgress((current) => !current || current.unitIndex !== next.unitIndex || Math.abs(current.unitProgress - next.unitProgress) >= .5 ? next : current);
      shellRef.current?.style.setProperty("--reader-progress", String(overallProgress));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => syncProgress(next), 2500);
    };
    const onScroll = () => {
      if (scrollFrame.current !== null) return;
      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = null;
        measure();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    measure();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [blocks, book, focusMode, fontSize, lineHeight, positionReady, showCover, syncProgress, unit, unitIndex, width]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && progressRef.current) syncProgress(progressRef.current, true);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [syncProgress]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (progressRef.current) writeStoredJson(progressKey(bookId), progressRef.current);
  }, [bookId]);

  useEffect(() => {
    const signal = activeBlock?.signal ?? .5;
    const phase = activeBlock?.phase ?? .5;
    shellRef.current?.style.setProperty("--lumen-x", `${52 + phase * 9}%`);
    shellRef.current?.style.setProperty("--lumen-y", `${24 + phase * 18}%`);
    shellRef.current?.style.setProperty("--lumen-scale", String(.82 + signal * .25));
    shellRef.current?.style.setProperty("--lumen-strength", `${4 + signal * 5}%`);
  }, [activeBlock]);

  useEffect(() => {
    const request = ++searchRequest.current;
    if (!book || query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    if (preview) {
      const needle = query.trim().toLowerCase();
      const results = preview.units
        .filter((item) => `${item.title}\n${item.text}`.toLowerCase().includes(needle))
        .slice(0, 24)
        .map((item) => ({ index: item.index, title: item.title, snippet: item.text.replace(/\s+/g, " ").slice(0, 180) }));
      if (request === searchRequest.current) {
        setSearchResults(results);
        setSearching(false);
      }
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/books/${bookId}?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => response.json())
        .then((body: { results?: ReadingSearchResult[] }) => {
          if (request === searchRequest.current) setSearchResults(body.results ?? []);
        })
        .catch(() => undefined)
        .finally(() => {
          if (request === searchRequest.current) setSearching(false);
        });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [book, bookId, preview, query]);

  const moveTo = useCallback((nextIndex: number, completingCurrent = false, restoreAt = 0, passageId?: string) => {
    if (!book) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (progressRef.current) {
      const current = completingCurrent
        ? { ...progressRef.current, unitProgress: 100, overallProgress: readingBookProgress(book.outline, unitIndex, 100), updatedAt: new Date().toISOString() }
        : progressRef.current;
      syncProgress(current);
    }
    void openUnit(nextIndex, restoreAt, passageId);
  }, [book, openUnit, syncProgress, unitIndex]);

  const finishReading = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (progressRef.current) syncProgress({ ...progressRef.current, unitProgress: 100, overallProgress: 100, updatedAt: new Date().toISOString() });
    setVoyageSession(null);
  }, [syncProgress]);

  const toggleQuestMark = useCallback(() => {
    if (!activeBlock || !unit) return;
    const id = `${unitIndex}:${activeBlock.id}`;
    const alreadyMarked = questMarks.some((mark) => mark.id === id);
    setQuestMarks((current) => alreadyMarked
      ? current.filter((mark) => mark.id !== id)
      : [{
          id,
          unitIndex,
          unitTitle: unit.title,
          passageId: activeBlock.id,
          excerpt: activeBlock.text.replace(/\s+/gu, " ").trim().slice(0, 180),
          createdAt: new Date().toISOString(),
        }, ...current].slice(0, 200));
    setReaderAnnouncement(alreadyMarked ? "Quest Mark removed from this passage." : "Passage saved as a private Quest Mark in this browser.");
  }, [activeBlock, questMarks, unit, unitIndex]);

  const startVoyage = useCallback((goal: VoyageGoal) => {
    setRestHarborMilliseconds(null);
    setVoyageSession({ id: Date.now(), goal });
    setReaderAnnouncement(goal === "open" ? "Open Lumen Voyage started." : `${goal}-minute Lumen Voyage started.`);
  }, []);

  const endVoyage = useCallback(() => {
    setVoyageSession(null);
    setRestHarborMilliseconds(null);
    setReaderAnnouncement("Lumen Voyage ended. Your reading position is saved.");
  }, []);

  const reachRestHarbor = useCallback((activeMilliseconds: number) => {
    setVoyageSession(null);
    setRestHarborMilliseconds(activeMilliseconds);
    setReaderAnnouncement("You reached a natural stopping point. Continue when you are ready.");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
      if (event.altKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLumenMode((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  if (loading) return <main className={styles.loadingPage} aria-label="Opening Reading Edition"><p role="status" className="screen-reader-text">Opening Reading Edition…</p><div className="skeleton" /><div className="skeleton" /></main>;
  if (!book || !unit) return <main className={styles.messagePage}><AppIcon name="library" /><h1 className="display">We could not open this book.</h1><p role="alert">{error || "The Reading Edition returned no content."}</p><div><button type="button" onClick={() => void load()} className="btn-primary">Try again</button><Link href={preview?.backHref ?? "/books"} className="quiet-button">Return to {preview?.backLabel ?? "Reading Room"}</Link></div></main>;

  const appearance = readingAppearance(book.vibeId, atmosphere);
  const vibe = READING_VIBES[atmosphere === "auto" ? book.vibeId : atmosphere === "night" ? "night-ink" : atmosphere === "focus" ? "clear-day" : "archive-glow"];
  const visibleProgress = progress?.overallProgress ?? 0;
  const unitProgress = progress?.unitIndex === unitIndex ? progress.unitProgress : 0;
  const chapterMinutesLeft = remainingReadingMinutes(blocks, activeBlockIndex);
  const remainingBookWords = Math.max(0, Math.round(book.wordCount * (1 - visibleProgress / 100)));
  const bookMinutesLeft = remainingBookWords > 0 ? Math.max(1, Math.ceil(remainingBookWords / 230)) : 0;
  const articleStyle = {
    "--reader-font-size": `${fontSize}px`,
    "--reader-line-height": lineHeight,
    "--reader-measure": width === "focused" ? "36rem" : width === "wide" ? "50rem" : "43rem",
  } as CSSProperties;
  const dialStyle = { "--dial-progress": `${unitProgress * 3.6}deg` } as CSSProperties;
  const sightlineStyle = { "--sightline-height": `${Math.round(fontSize * lineHeight * 3 + 18)}px` } as CSSProperties;
  const voyageModeActive = Boolean(voyageSession || sightline !== "off" || focusMode);

  return <CourseAppearanceFrame appearance={appearance} className={`${styles.themeFrame} ${lumenMode ? styles.lumenMode : ""} ${focusMode ? styles.focusMode : ""} ${voyageSession ? styles.voyageMode : ""} ${sightline === "passage" ? styles.passageSightlineMode : ""}`}>
    <div ref={shellRef} className={styles.shell}>
      {lumenMode && <LumenField seed={`${book.id}:${book.title}:${unitIndex}`} progress={visibleProgress} signal={activeBlock?.signal ?? .5} enabled />}
      {sightline === "horizon" && !showCover && <div className={styles.sightlineHorizon} style={sightlineStyle} aria-hidden="true"><span /></div>}
      <header ref={topbarRef} className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href={preview?.backHref ?? "/books"} className={styles.backLink} aria-label={`Return to ${preview?.backLabel ?? "Reading Room"}`}><span aria-hidden="true">←</span><span>{preview?.backLabel ?? "Reading Room"}</span></Link>
          <div className={styles.titleLockup}><strong>{book.title}</strong><span>{showCover ? "Lumen Reading Edition" : `${Math.round(visibleProgress)}% · ${unitLabel(book, unitIndex)}`}</span></div>
          <div className={styles.topActions}>
            <button type="button" onClick={() => { setAtlasOpen(true); tocDialog.current?.showModal(); }} aria-label="Open book path and search"><AppIcon name="library" /><span>Book path</span></button>
            <button type="button" onClick={() => appearanceDialog.current?.showModal()} aria-label="Open reading appearance"><span aria-hidden="true">Aa</span><span>Vibe</span></button>
            <button type="button" onClick={() => setLumenMode((current) => !current)} aria-pressed={lumenMode} aria-label={lumenMode ? "Turn off Lumen reading light" : "Turn on Lumen reading light"}><AppIcon name="spark" /><span>Lumen</span></button>
            <button type="button" onClick={() => voyageDialog.current?.showModal()} aria-pressed={voyageModeActive} aria-label="Open Lumen Voyage long-reading modes"><AppIcon name="compass" /><span>Voyage</span></button>
          </div>
        </div>
        <div className={styles.headerProgress} role="progressbar" aria-label={`Reading progress through ${book.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(visibleProgress)}><span style={{ width: `${visibleProgress}%` }} /></div>
      </header>

      {showCover ? <main className={styles.coverLayout}>
        <section className={styles.cover}>
          <div className={styles.coverCopy}>
            <p>BookQuest · Lumen Edition</p>
            <h1 className="display">{book.title}</h1>
            <p className={styles.vibeNote}>{vibe.name} · Lumen keeps a gentle light on the passage you are reading. It uses no model calls or AI credits.</p>
            <dl className={styles.coverStats}>
              <div><dt>Full text</dt><dd>{book.wordCount.toLocaleString()} words</dd></div>
              <div><dt>Reading time</dt><dd>About {book.estimatedMinutes} min</dd></div>
              <div><dt>{book.unitKind === "page" ? "Pages" : book.unitKind === "chapter" ? "Chapters" : "Sections"}</dt><dd>{book.sourceChapterCount}</dd></div>
            </dl>
            <button type="button" onClick={() => void openUnit(unitIndex, progress?.unitProgress ?? 0, progress?.passageId)} className={styles.beginButton}>{visibleProgress > 0 ? "Continue where you left off" : "Enter the living page"}<AppIcon name="arrow" /></button>
            <small>{preview ? "Original words preserved · demo progress stays in this browser · no AI credits while reading" : "Original words preserved · private to your account · no AI credits while reading"}</small>
          </div>
          <div className={styles.coverWorld}><CourseWorld seed={`${book.id}:${book.title}`} theme={appearance.worldTheme} title={book.title} progress={visibleProgress} className={styles.world} /><ArtifactCoverImage kind="book" artifactId={book.id} contentHash={book.coverHash} variant="book" priority /></div>
        </section>
      </main> : <div className={styles.readerLayout}>
        <aside className={styles.contentsRail}>
          <ReadingSpine outline={book.outline} currentIndex={unitIndex} unitProgress={unitProgress} onSelect={(index) => moveTo(index)} />
        </aside>

        <main className={styles.readingColumn}>
          {error && <p role="alert" className={styles.inlineError}>{error} <button type="button" onClick={() => void openUnit(unitIndex, progress?.unitProgress ?? 0, progress?.passageId)}>Try again</button></p>}
          <article ref={articleRef} className={`${styles.readingPaper} ${unitLoading ? styles.unitLoading : ""}`} style={articleStyle} aria-busy={unitLoading} aria-labelledby={`reading-unit-${book.id}-${unitIndex}`}>
            <header className={`${styles.unitHeader} ${book.unitKind === "page" ? styles.pageHeader : ""}`}>
              <div className={styles.chapterScene}><CourseWorld seed={`${book.id}:${unitIndex}:${unit.title}`} theme={appearance.worldTheme} title={unit.title} progress={unitProgress} mood="dusk" className={styles.world} /></div>
              <span className={styles.chapterNumber} aria-hidden="true">{String(unitIndex + 1).padStart(2, "0")}</span>
              <div className={styles.unitHeaderCopy}>
                <p>{unitLabel(book, unitIndex)}</p>
                <h1 ref={unitHeadingRef} id={`reading-unit-${book.id}-${unitIndex}`} className="display" tabIndex={-1}>{displayUnitTitle(unit.title)}</h1>
                <div className={styles.chapterMeta}><span>{unit.wordCount.toLocaleString()} words</span><span>{timeLeftLabel(chapterMinutesLeft)}</span><span>{bookMinutesLeft > 0 ? `${bookMinutesLeft} min in book` : "Book complete"}</span></div>
              </div>
            </header>
            <div className={styles.prose}>{blocks.map((block, index) => <ReadingBlock key={block.id} block={block} index={index} active={index === activeBlockIndex} nearby={Math.abs(index - activeBlockIndex) === 1} />)}</div>
            <footer className={styles.unitFooter}>
              {unitIndex > 0 ? <button type="button" onClick={() => moveTo(unitIndex - 1)}><span>Previous</span><strong>{unit.previousTitle}</strong></button> : <span />}
              {unitIndex < book.sourceChapterCount - 1 ? <button type="button" onClick={() => moveTo(unitIndex + 1, true)}><span>Next</span><strong>{unit.nextTitle}</strong></button> : <Link href={preview?.backHref ?? "/books"} onClick={finishReading}><span>Finished</span><strong>{preview ? "Return to demo gallery" : "Return to your shelf"}</strong></Link>}
            </footer>
          </article>
        </main>

        <aside className={styles.lumenCompass} aria-label="Live reading position">
          {voyageSession ? <LongReadingDock
            key={voyageSession.id}
            goal={voyageSession.goal}
            activePassageId={activeBlock?.id ?? null}
            passageLabel={`Passage ${Math.min(blocks.length, activeBlockIndex + 1)} of ${blocks.length}`}
            marked={activePassageMarked}
            onToggleMark={toggleQuestMark}
            onEnd={endVoyage}
            onHarbor={reachRestHarbor}
          /> : <div className={styles.compassCard}>
            <div className={styles.lumenDial} style={dialStyle}><span><strong>{Math.round(unitProgress)}%</strong><small>{book.unitKind}</small></span></div>
            <p className={styles.compassEyebrow}><AppIcon name="spark" /> Lumen</p>
            <strong>Passage {Math.min(blocks.length, activeBlockIndex + 1)} of {blocks.length}</strong>
            <span>{timeLeftLabel(chapterMinutesLeft)}</span>
            <div className={styles.compassActions}>
              <button type="button" onClick={toggleQuestMark} aria-pressed={activePassageMarked}><AppIcon name="bookmark" />{activePassageMarked ? "Marked" : "Mark"}</button>
              <button type="button" onClick={() => setLumenMode((current) => !current)} aria-pressed={lumenMode}>{lumenMode ? "Quiet light" : "Wake light"}</button>
            </div>
            <small>Alt + L toggles Lumen</small>
          </div>}
        </aside>
      </div>}

      {restHarborMilliseconds !== null && <section className={styles.restHarbor} aria-labelledby={`rest-harbor-${book.id}`}>
        <div className={styles.harborGlow} aria-hidden="true"><AppIcon name="spark" /></div>
        <div><p>Natural stopping point · {Math.max(1, Math.round(restHarborMilliseconds / 60_000))} active min</p><h2 id={`rest-harbor-${book.id}`} className="display">You reached a quiet harbor.</h2><span>Look away, move a little, or continue when the next page is calling.</span></div>
        <div className={styles.harborActions}><button type="button" onClick={() => startVoyage(10)}>Continue 10 min</button><button type="button" onClick={() => setRestHarborMilliseconds(null)}>End for now</button></div>
        <span className="screen-reader-text" role="status" aria-live="polite">You reached a natural stopping point.</span>
      </section>}

      <p className="screen-reader-text" role="status" aria-live="polite">{unitLoading ? "Opening the next part." : readerAnnouncement}</p>

      <dialog ref={tocDialog} className={`${styles.dialog} ${styles.atlasDialog}`} aria-labelledby={`book-atlas-${book.id}`} onClose={() => { setQuery(""); setAtlasOpen(false); }}>
        <header><div><p>See the whole book at a glance</p><h2 id={`book-atlas-${book.id}`} className="display">Book atlas</h2></div><button type="button" onClick={() => tocDialog.current?.close()} aria-label="Close book atlas">×</button></header>
        <label className={styles.searchLabel}>Find in this book<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the full text" /></label>
        <div className={styles.dialogBody}>
          {atlasOpen ? query.trim().length >= 2 ? <div className={styles.searchResults} aria-live="polite"><p>{searching ? "Searching…" : `${searchResults.length} matching ${searchResults.length === 1 ? "section" : "sections"}`}</p>{searchResults.map((result) => <button key={result.index} type="button" onClick={() => moveTo(result.index)}><strong>{result.title}</strong><span>{result.snippet}</span></button>)}</div> : <>
            <div className={styles.atlasSummary}>
              <button type="button" onClick={() => { setShowCover(true); tocDialog.current?.close(); }}><span className={styles.atlasCover}><CourseWorld seed={`${book.id}:${book.title}:atlas`} theme={appearance.worldTheme} title={book.title} progress={visibleProgress} className={styles.world} /><ArtifactCoverImage kind="book" artifactId={book.id} contentHash={book.coverHash} variant="book" /></span><span><small>Lumen Edition</small><strong>{book.title}</strong><em>{Math.round(visibleProgress)}% explored · {bookMinutesLeft > 0 ? `${bookMinutesLeft} min left` : "complete"}</em></span></button>
            </div>
            {questMarks.length > 0 && <section className={styles.questMarks} aria-labelledby={`quest-marks-${book.id}`}>
              <header><div><p>Private return trail</p><h3 id={`quest-marks-${book.id}`}>Quest Marks</h3></div><span>{questMarks.length}</span></header>
              <div>{questMarks.map((mark) => <button key={mark.id} type="button" onClick={() => moveTo(mark.unitIndex, false, 0, mark.passageId)}><small>{mark.unitTitle}</small><strong>{mark.excerpt}</strong></button>)}</div>
              <p>Saved in this browser. Open a marked passage and use Mark again to remove it.</p>
            </section>}
            <ReadingSpine outline={book.outline} currentIndex={unitIndex} unitProgress={unitProgress} onSelect={(index) => moveTo(index)} variant="atlas" />
          </> : null}
        </div>
      </dialog>

      <dialog ref={voyageDialog} className={`${styles.dialog} ${styles.voyageDialog}`} aria-labelledby={`lumen-voyage-${book.id}`}>
        <header><div><p>Long-read studio</p><h2 id={`lumen-voyage-${book.id}`} className="display">Lumen Voyage</h2></div><button type="button" onClick={() => voyageDialog.current?.close()} aria-label="Close Lumen Voyage controls">×</button></header>
        <div className={styles.voyageBody}>
          <section className={styles.voyageIntro}>
            <div><p>{voyageSession ? "Voyage in progress" : "Choose a reading horizon"}</p><h3>{voyageSession ? (voyageSession.goal === "open" ? "Open destination" : `${voyageSession.goal}-minute destination`) : "Read longer without turning it into a race."}</h3><span>Only visible, recently active reading time counts. Stops wait for a passage boundary.</span></div>
            <AppIcon name="compass" />
          </section>

          <fieldset><legend>Destination</legend><div className={styles.voyageGoalGrid}>{VOYAGE_GOALS.map((goal) => <button key={goal} type="button" onClick={() => startVoyage(goal)} aria-pressed={voyageSession?.goal === goal}><span>{voyageGoalName(goal)}</span><small>{voyageGoalDescription(goal)}</small></button>)}</div>{voyageSession && <button type="button" className={styles.endVoyageButton} onClick={endVoyage}>End current voyage</button>}</fieldset>

          <fieldset><legend>Sightline</legend><p className={styles.fieldIntro}>A visual tracking layer that never rewrites, hides, or fades the source text.</p><div className={styles.sightlineGrid}>{([
            ["off", "Natural", "The original Lumen page"],
            ["horizon", "Horizon", "A three-line reading ribbon"],
            ["passage", "Passage", "Frame the live passage"],
          ] as const).map(([mode, name, description]) => <label key={mode}><input type="radio" name="reading-sightline" value={mode} checked={sightline === mode} onChange={() => setSightline(mode)} /><span><strong>{name}</strong><small>{description}</small></span></label>)}</div></fieldset>

          <fieldset><legend>Sanctuary</legend><label className={styles.lumenToggle}><input type="checkbox" checked={focusMode} onChange={(event) => setFocusMode(event.target.checked)} /><span aria-hidden="true"><i /></span><strong>Quiet the room</strong><small>Hide the Book Spine and ordinary compass. Active Voyage controls remain within reach.</small></label></fieldset>

          <section className={styles.trailSummary}><div><p>Return trail</p><strong>{questMarks.length === 0 ? "No Quest Marks yet" : `${questMarks.length} saved ${questMarks.length === 1 ? "passage" : "passages"}`}</strong><span>Marks stay private in this browser and appear inside Book Atlas.</span></div><button type="button" onClick={toggleQuestMark} aria-pressed={activePassageMarked} disabled={showCover || !activeBlock}><AppIcon name="bookmark" />{activePassageMarked ? "Remove current mark" : "Mark current passage"}</button></section>

          <p className={styles.voyagePrivacy}><AppIcon name="lock" /> Voyage runs locally. No AI calls, credits, sound, streak pressure, or source rewriting.</p>
        </div>
      </dialog>

      <dialog ref={appearanceDialog} className={styles.dialog} aria-labelledby={`reading-vibe-${book.id}`}>
        <header><div><p>Make the room yours</p><h2 id={`reading-vibe-${book.id}`} className="display">Reading vibe</h2></div><button type="button" onClick={() => appearanceDialog.current?.close()} aria-label="Close reading appearance">×</button></header>
        <div className={styles.settingsBody}>
          <fieldset><legend>Living page</legend><label className={styles.lumenToggle}><input type="checkbox" checked={lumenMode} onChange={(event) => setLumenMode(event.target.checked)} /><span aria-hidden="true"><i /></span><strong>Lumen reading light</strong><small>Follows your active passage and evolves with progress. No AI, sound, or rewritten text.</small></label><small>Keyboard shortcut: Alt + L. Reduced-motion preferences are respected automatically.</small></fieldset>
          {!preview && <fieldset><legend>Book cover</legend><div className={styles.coverSettingPreview} aria-label="Current book cover preview"><CourseWorld seed={`${book.id}:${book.title}:settings`} theme={appearance.worldTheme} title={book.title} progress={visibleProgress} className={styles.world} /><ArtifactCoverImage kind="book" artifactId={book.id} contentHash={book.coverHash} variant="book" /></div><CoverImageEditor kind="book" artifactId={book.id} title={book.title} coverHash={book.coverHash} compact onChanged={(coverHash) => setBook((current) => current ? { ...current, coverHash } : current)} /></fieldset>}
          <fieldset><legend>Atmosphere</legend><div className={styles.modeGrid}>{(["auto", "paper", "night", "focus"] as const).map((mode) => <label key={mode}><input type="radio" name="reading-atmosphere" value={mode} checked={atmosphere === mode} onChange={() => setAtmosphere(mode)} /><span>{mode === "auto" ? `Auto · ${READING_VIBES[book.vibeId].name}` : mode === "paper" ? "Paper" : mode === "night" ? "Night" : "Clear focus"}</span></label>)}</div><small>Auto uses deterministic source signals. It never calls an AI model.</small></fieldset>
          <fieldset><legend>Text size</legend><div className={styles.stepper}><button type="button" onClick={() => setFontSize((value) => clamp(value - 1, 16, 25))} disabled={fontSize <= 16} aria-label="Decrease text size">A−</button><span>{fontSize}px</span><button type="button" onClick={() => setFontSize((value) => clamp(value + 1, 16, 25))} disabled={fontSize >= 25} aria-label="Increase text size">A+</button></div></fieldset>
          <fieldset><legend>Line spacing</legend><div className={styles.stepper}><button type="button" onClick={() => setLineHeight((value) => clamp(Number((value - 0.08).toFixed(2)), 1.55, 2.05))} disabled={lineHeight <= 1.55} aria-label="Decrease line spacing">−</button><span>{lineHeight.toFixed(2)}</span><button type="button" onClick={() => setLineHeight((value) => clamp(Number((value + 0.08).toFixed(2)), 1.55, 2.05))} disabled={lineHeight >= 2.05} aria-label="Increase line spacing">+</button></div></fieldset>
          <fieldset><legend>Reading width</legend><div className={styles.modeGrid}>{(["focused", "balanced", "wide"] as const).map((option) => <label key={option}><input type="radio" name="reading-width" value={option} checked={width === option} onChange={() => setWidth(option)} /><span>{option[0].toUpperCase() + option.slice(1)}</span></label>)}</div></fieldset>
          {!preview && <div className={styles.dangerZone}><strong>Remove from Reading Room</strong><p>This deletes the private full text and synced reading position.</p><button type="button" onClick={() => void removeBook()}>Remove this book</button>{deleteError && <p role="alert">{deleteError}</p>}</div>}
        </div>
      </dialog>
    </div>
  </CourseAppearanceFrame>;
}
