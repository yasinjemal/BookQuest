"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import { isSummaryFailed, isSummaryReady, summaryStatusLabel } from "@/components/SummaryGalleryCard";
import { COURSE_APPEARANCE_TEMPLATES, DEFAULT_COURSE_APPEARANCE } from "@/lib/course-appearance";
import type { SummaryDetail, SummarySectionContent, SummarySectionDetail } from "@/lib/summary-types";
import styles from "./SummaryReader.module.css";

type StoredReadingProgress = {
  scrollY?: number;
  progress?: number;
  sectionId?: string;
  updatedAt?: string;
};

const deepReadAppearance = COURSE_APPEARANCE_TEMPLATES.find((item) => item.id === "quiet-library")?.appearance ?? DEFAULT_COURSE_APPEARANCE;

function progressKey(id: string | number) {
  return `bookquest.summary.${id}.reading`;
}

function proseParagraphs(value: string) {
  return value.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function readingStatusCopy(summary: SummaryDetail) {
  if (summary.status === "extracting") return "Opening the source and finding its natural sections.";
  if (summary.status === "outlining") return "Mapping the full document before any summary section is written.";
  if (summary.status === "generating") return `${summary.ready_section_count} of ${summary.section_count} sections are ready. New sections will appear here as they pass coverage checks.`;
  if (summary.status === "error") return summary.error || "Generation stopped before this Deep Read was complete.";
  return "";
}

function CitationRefs({
  ids,
  section,
}: {
  ids: string[];
  section: SummarySectionDetail;
}) {
  if (!section.content || ids.length === 0) return null;
  const known = new Set(section.content.citations.map((citation) => citation.id));
  const visible = ids.filter((id) => known.has(id));
  if (visible.length === 0) return null;
  return <span className={styles.citationRefs} aria-label={`Sources ${visible.join(", ")}`}>{visible.map((id) => <a key={id} href={`#citation-${section.id}-${id}`} aria-label={`Open source note ${id}`}>{id}</a>)}</span>;
}

function SectionSources({ section }: { section: SummarySectionDetail }) {
  const content = section.content;
  if (!content) return null;
  return (
    <details className={styles.sourceTrail}>
      <summary><span><AppIcon name="source" className="h-4 w-4" />Source trail</span><small>{content.citations.length} note{content.citations.length === 1 ? "" : "s"}</small></summary>
      <div className={styles.sourceTrailBody}>
        <p>Short excerpts are shown only to verify the summary. Open the original document when wording or context matters.</p>
        <ol>
          {content.citations.map((citation) => <li key={citation.id} id={`citation-${section.id}-${citation.id}`}>
            <div><strong>{citation.id}</strong><span>{citation.source_chapter}</span></div>
            <p>“{citation.supporting_excerpt}”</p>
            <small>{citation.locator}</small>
          </li>)}
        </ol>
      </div>
    </details>
  );
}

function GeneratedSection({ section }: { section: SummarySectionDetail }) {
  const content = section.content;
  if (!content) {
    return <div className={styles.sectionPending} role="status"><span className="skeleton" aria-hidden="true" /><div><strong>{section.status === "error" ? "This section needs another pass." : "This section is still being written."}</strong><p>{section.source_chapters.length > 0 ? `It draws from ${section.source_chapters.join(", ")}.` : "Its source coverage has already been reserved."}</p></div></div>;
  }

  return (
    <>
      <aside className={styles.oneBreath} aria-label="Section in one breath"><span>In one breath</span><p>{content.takeaway}</p></aside>

      <div className={styles.overview}>
        {proseParagraphs(content.overview).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>

      <section className={styles.ideaSection} aria-labelledby={`ideas-${section.id}`}>
        <p className={styles.sectionEyebrow}>The ideas that move this part</p>
        <h3 id={`ideas-${section.id}`}>Follow the author’s line of thought.</h3>
        <div className={styles.ideaGrid}>
          {content.key_ideas.map((idea, index) => <article key={`${idea.title}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h4>{idea.title}</h4>
            <p>{idea.explanation} <CitationRefs ids={idea.citation_ids} section={section} /></p>
            <aside><strong>Why it matters</strong><p>{idea.why_it_matters}</p></aside>
          </article>)}
        </div>
      </section>

      {content.source_examples.length > 0 && <section className={styles.examples} aria-labelledby={`examples-${section.id}`}>
        <p className={styles.sectionEyebrow}>Evidence and examples</p>
        <h3 id={`examples-${section.id}`}>See the idea in motion.</h3>
        <div>{content.source_examples.map((example, index) => <article key={`${example.title}-${index}`}><h4>{example.title}</h4><p>{example.explanation} <CitationRefs ids={example.citation_ids} section={section} /></p><span>{example.lesson}</span></article>)}</div>
      </section>}

      {content.connections.length > 0 && <aside className={styles.redThread} aria-label="The red thread"><span><AppIcon name="trail" className="h-5 w-5" />The red thread</span><div>{content.connections.map((connection, index) => <p key={index}>{connection}</p>)}</div></aside>}

      {(content.nuances.length > 0 || content.practical_applications.length > 0) && <div className={styles.perspectiveGrid}>
        {content.nuances.length > 0 && <section aria-labelledby={`nuance-${section.id}`}><p className={styles.sectionEyebrow}>Nuance and limits</p><h3 id={`nuance-${section.id}`}>Keep the edges in view.</h3><ul>{content.nuances.map((nuance, index) => <li key={index}><span aria-hidden="true">—</span><p>{nuance.point} <CitationRefs ids={nuance.citation_ids} section={section} /></p></li>)}</ul></section>}
        {content.practical_applications.length > 0 && <section aria-labelledby={`application-${section.id}`}><p className={styles.sectionEyebrow}>What changes after this</p><h3 id={`application-${section.id}`}>Carry it into the world.</h3><ul>{content.practical_applications.map((application, index) => <li key={index}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p>{application.action} <CitationRefs ids={application.citation_ids} section={section} /></p></li>)}</ul></section>}
      </div>}

      <section className={styles.chapterRecap} aria-labelledby={`recap-${section.id}`}>
        <p className={styles.sectionEyebrow}>Nothing important quietly disappears</p>
        <h3 id={`recap-${section.id}`}>What each source chapter contributes.</h3>
        <ol>{content.chapter_recap.map((chapter) => <li key={`${chapter.chapter_index}-${chapter.source_chapter}`}><span>{String(chapter.chapter_index + 1).padStart(2, "0")}</span><div><h4>{chapter.source_chapter}</h4><p>{chapter.summary} <CitationRefs ids={chapter.citation_ids} section={section} /></p></div></li>)}</ol>
      </section>

      <blockquote className={styles.closingReflection}><span>Before turning the page</span><p>{content.closing_reflection}</p></blockquote>
      <SectionSources section={section} />
    </>
  );
}

function TocLinks({
  summary,
  activeSection,
  onNavigate,
}: {
  summary: SummaryDetail;
  activeSection: string;
  onNavigate?: () => void;
}) {
  return <nav aria-label="Deep Read contents" className={styles.tocNav}>
    <a href="#summary-cover" data-current={activeSection === "summary-cover"} onClick={onNavigate}><span>00</span><strong>Before you begin</strong></a>
    {summary.sections.map((section) => <a key={section.id} href={`#summary-section-${section.id}`} data-current={activeSection === String(section.id)} onClick={onNavigate}><span>{String(section.position + 1).padStart(2, "0")}</span><strong>{section.title}</strong><small>{section.status === "ready" ? "Ready" : section.status === "error" ? "Needs attention" : "Being written"}</small></a>)}
    {isSummaryReady(summary.status) && <a href="#whole-book-map" data-current={activeSection === "whole-book-map"} onClick={onNavigate}><span>∞</span><strong>The whole book map</strong></a>}
  </nav>;
}

function SourceRail({ summary }: { summary: SummaryDetail }) {
  return <aside className={styles.sourceCard} aria-label="Deep Read source details">
    <span className={styles.sourceIcon}><AppIcon name="source" className="h-5 w-5" /></span>
    <p>Built from</p>
    <h2>{summary.source_filename}</h2>
    <dl>
      <div><dt>Document</dt><dd>{summary.document_kind.replaceAll("_", " ")}</dd></div>
      <div><dt>Source coverage</dt><dd>{summary.source_chapter_count} section{summary.source_chapter_count === 1 ? "" : "s"}</dd></div>
      <div><dt>Deep Read</dt><dd>{summary.ready_section_count} of {summary.section_count} ready</dd></div>
      {summary.estimated_minutes > 0 && <div><dt>Reading time</dt><dd>About {summary.estimated_minutes} min</dd></div>}
    </dl>
    <p className={styles.sourceNote}>This is an AI-assisted, source-linked draft. Use the source trails when exact wording or context matters.</p>
    {summary.course_id && <Link href={`/course/${summary.course_id}`} className={styles.courseLink}>Open the separate course <AppIcon name="arrow" className="h-4 w-4" /></Link>}
  </aside>;
}

export default function SummaryReader({ summaryId }: { summaryId: string | number }) {
  const [summary, setSummary] = useState<SummaryDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [fontSize, setFontSize] = useState(18);
  const [readingProgress, setReadingProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("summary-cover");
  const [tocOpen, setTocOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const activeSectionRef = useRef(activeSection);
  const restoredRef = useRef(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);
  useEffect(() => { restoredRef.current = false; }, [summaryId]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoadError("");
    try {
      const response = await fetch(`/api/summaries/${summaryId}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/summary/${summaryId}`)}`;
        return;
      }
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) throw new Error("summary request failed");
      setSummary((await response.json()) as SummaryDetail);
    } catch {
      if (!quiet) setLoadError("This Deep Read could not be opened. Check your connection and try again.");
    }
  }, [summaryId]);

  useEffect(() => { void load(); }, [load]);

  const retryGeneration = useCallback(async () => {
    setRetrying(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/summaries/${summaryId}/retry`, { method: "POST" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Retry could not start");
      await load(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Retry could not start.");
    } finally {
      setRetrying(false);
    }
  }, [load, summaryId]);

  useEffect(() => {
    if (!summary || isSummaryReady(summary.status) || isSummaryFailed(summary.status)) return;
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load, summary]);

  useEffect(() => {
    const stored = Number(localStorage.getItem("bookquest.summary.reader.font-size") ?? 18);
    if (Number.isFinite(stored)) setFontSize(Math.min(24, Math.max(16, stored)));
  }, []);

  useEffect(() => {
    localStorage.setItem("bookquest.summary.reader.font-size", String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    if (!summary || restoredRef.current) return;
    restoredRef.current = true;
    let stored: StoredReadingProgress = {};
    try { stored = JSON.parse(localStorage.getItem(progressKey(summaryId)) ?? "{}"); } catch { stored = {}; }
    setReadingProgress(Math.min(100, Math.max(0, Number(stored.progress) || 0)));
    if (stored.sectionId) {
      activeSectionRef.current = stored.sectionId;
      setActiveSection(stored.sectionId);
    }
    const timer = window.setTimeout(() => {
      const target = Number(stored.scrollY) || 0;
      if (target > 0) window.scrollTo({ top: target, behavior: "auto" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [summary, summaryId]);

  useEffect(() => {
    if (!summary) return;
    let timer: number | undefined;
    const persist = (updateState = true) => {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const nextProgress = Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
      if (updateState) setReadingProgress(nextProgress);
      const stored: StoredReadingProgress = { scrollY: window.scrollY, progress: nextProgress, sectionId: activeSectionRef.current, updatedAt: new Date().toISOString() };
      localStorage.setItem(progressKey(summaryId), JSON.stringify(stored));
    };
    const remember = () => { window.clearTimeout(timer); timer = window.setTimeout(persist, 120); };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("scroll", remember); persist(false); };
  }, [summary, summaryId]);

  useEffect(() => {
    if (!summary) return;
    const targets = document.querySelectorAll<HTMLElement>("[data-summary-observe]");
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top)[0];
      const next = visible?.target.getAttribute("data-summary-observe");
      if (next) setActiveSection(next);
    }, { rootMargin: "-18% 0px -68%", threshold: [0, 0.01] });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [summary]);

  useEffect(() => {
    if (!tocOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setTocOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [tocOpen]);

  const completeSections = useMemo(() => summary?.sections.filter((section) => section.content) ?? [], [summary]);
  const readerStyle = { "--summary-font-size": `${fontSize}px` } as CSSProperties;

  if (notFound) return <div className={styles.messagePage}><span><AppIcon name="library" className="h-6 w-6" /></span><h1 className="display">Deep Read not found.</h1><p>It may have been removed or you may not have access.</p><Link href="/summaries" className="btn-primary">Return to Deep Reads</Link></div>;
  if (!summary && loadError) return <div className={styles.messagePage}><span><AppIcon name="compass" className="h-6 w-6" /></span><h1 className="display">We lost your place for a moment.</h1><p>{loadError}</p><button type="button" onClick={() => void load()} className="btn-primary">Try again</button><Link href="/summaries" className="quiet-button">Return to Deep Reads</Link></div>;
  if (!summary) return <div className={styles.loadingPage} aria-label="Opening Deep Read"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;

  const statusCopy = readingStatusCopy(summary);

  return (
    <CourseAppearanceFrame appearance={deepReadAppearance} className={styles.themeFrame}>
      <div className={styles.shell} style={readerStyle}>
        <a href="#summary-cover" className="skip-link">Skip to Deep Read</a>
        <header className={styles.topbar}>
          <div className={styles.topbarInner}>
            <Link href="/summaries" className={styles.backLink} aria-label="Return to Deep Reads"><span aria-hidden="true">←</span><span>Deep Reads</span></Link>
            <div className={styles.titleLockup}><strong>{summary.title}</strong><span>{Math.round(readingProgress)}% read · {summaryStatusLabel(summary.status)}</span></div>
            <div className={styles.controls}>
              <button type="button" onClick={() => setTocOpen(true)} className={styles.mobileTocButton} aria-label="Open table of contents" aria-expanded={tocOpen}><AppIcon name="layers" className="h-4 w-4" /><span>Contents</span></button>
              <div className={styles.fontControls} aria-label="Text size controls"><button type="button" onClick={() => setFontSize((value) => Math.max(16, value - 1))} disabled={fontSize <= 16} aria-label="Decrease text size">A−</button><span aria-hidden="true">{fontSize}</span><button type="button" onClick={() => setFontSize((value) => Math.min(24, value + 1))} disabled={fontSize >= 24} aria-label="Increase text size">A+</button></div>
            </div>
          </div>
          <div className={styles.headerProgress} role="progressbar" aria-label={`Reading progress through ${summary.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(readingProgress)}><span style={{ width: `${readingProgress}%` }} /></div>
        </header>

        <div className={styles.layout}>
          <aside className={styles.tocRail}>
            <p className={styles.railLabel}>Contents</p>
            <TocLinks summary={summary} activeSection={activeSection} />
          </aside>

          <main className={styles.reader}>
            <section id="summary-cover" data-summary-observe="summary-cover" className={styles.cover}>
              <p className={styles.kicker}>A BookQuest Deep Read</p>
              <h1 className="display">{summary.title}</h1>
              {summary.description && <p className={styles.description}>{summary.description}</p>}
              {summary.thesis && <aside className={styles.thesis}><span>The book in one breath</span><p>{summary.thesis}</p></aside>}
              <dl className={styles.coverStats}>
                <div><dt>Reading time</dt><dd>{summary.estimated_minutes > 0 ? `About ${summary.estimated_minutes} min` : "Being estimated"}</dd></div>
                <div><dt>Source coverage</dt><dd>{summary.source_chapter_count} of {summary.source_chapter_count} sections mapped</dd></div>
                <div><dt>Reading path</dt><dd>{summary.section_count} distilled sections</dd></div>
              </dl>
              <div className={styles.mobileSource}><SourceRail summary={summary} /></div>
            </section>

            {statusCopy && <div className={`${styles.statusNotice} ${summary.status === "error" ? styles.statusError : ""}`} role={summary.status === "error" ? "alert" : "status"}><span><AppIcon name={summary.status === "error" ? "compass" : "spark"} className="h-5 w-5" /></span><div><strong>{summary.status === "error" ? "This draft needs attention" : summaryStatusLabel(summary.status)}</strong><p>{statusCopy}</p>{summary.status === "error" && <button type="button" onClick={() => void retryGeneration()} disabled={retrying} className="quiet-button mt-3 text-xs">{retrying ? "Restarting…" : "Retry this Deep Read"}</button>}</div></div>}

            {loadError && <p role="alert" className={styles.inlineError}>{loadError} <button type="button" onClick={() => void load()}>Try again</button></p>}

            <div className={styles.sections}>
              {summary.sections.map((section) => <article key={section.id} id={`summary-section-${section.id}`} data-summary-observe={String(section.id)} className={styles.readingSection}>
                <header className={styles.sectionHeader}>
                  <span>{String(section.position + 1).padStart(2, "0")}</span>
                  <div><p>{section.source_chapters.length} source section{section.source_chapters.length === 1 ? "" : "s"}</p><h2 className="display">{section.title}</h2><strong>{section.hook}</strong></div>
                </header>
                <GeneratedSection section={section} />
              </article>)}
            </div>

            {isSummaryReady(summary.status) && <section id="whole-book-map" data-summary-observe="whole-book-map" className={styles.wholeMap}>
              <p className={styles.kicker}>The whole book map</p>
              <h2 className="display">See the complete thread at once.</h2>
              <p className={styles.mapIntro}>Each movement below carries one part of the source into the next. Reopen any section when you want the full argument, examples, and nuance.</p>
              <ol>{completeSections.map((section, index) => <li key={section.id}><span>{String(index + 1).padStart(2, "0")}</span><div><h3><a href={`#summary-section-${section.id}`}>{section.title}</a></h3><p>{section.content!.takeaway}</p></div></li>)}</ol>
              <aside className={styles.carryForward}><span><AppIcon name="bookmark" className="h-5 w-5" />Ideas worth carrying</span><ul>{completeSections.map((section) => <li key={section.id}>{section.content!.takeaway}</li>)}</ul></aside>
              <div className={styles.finalActions}><Link href="/summaries" className="course-accent-button">Return to your Deep Reads <AppIcon name="arrow" className="h-4 w-4" /></Link>{summary.course_id && <Link href={`/course/${summary.course_id}`} className={styles.separateCourseButton}>Continue with the separate course</Link>}</div>
            </section>}
          </main>

          <div className={styles.sourceRail}><SourceRail summary={summary} /></div>
        </div>

        {tocOpen && <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTocOpen(false); }}><section className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="summary-toc-title"><header><div><p>Deep Read</p><h2 id="summary-toc-title">Contents</h2></div><button ref={drawerCloseRef} type="button" onClick={() => setTocOpen(false)} aria-label="Close table of contents">×</button></header><TocLinks summary={summary} activeSection={activeSection} onNavigate={() => setTocOpen(false)} /></section></div>}
      </div>
    </CourseAppearanceFrame>
  );
}
