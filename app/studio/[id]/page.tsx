"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import { BLOCK_CHANNELS, type BlockType } from "@/lib/block-registry";
import {
  COURSE_ACCENT_HEX,
  DEFAULT_COURSE_APPEARANCE,
  type CourseAppearance,
} from "@/lib/course-appearance";

interface SourceItem { source_version_id: string; title: string; kind: string }
interface BlockItem {
  id: string; lineageId: string; moduleKey: string; moduleTitle: string; moduleSummary: string;
  lessonKey: string; lessonTitle: string; modulePosition: number; lessonPosition: number;
  position: number; blockType: BlockType; revision: number; content: Record<string, unknown>;
  sourceRefs: Array<{ sourceVersionId?: string }>; editOrigin: string;
}
interface StudioData {
  version: { id: string; version_number: number; parent_version_id: string | null; lifecycle_status: string; title: string; description: string; appearance: CourseAppearance };
  versions: Array<{ id: string; version_number: number; parent_version_id: string | null; lifecycle_status: string }>;
  reviews: Array<{ id: string; decision: string; summary: string; reviewer_name: string; created_at: string }>;
  comments: Array<{ id: string; body: string; status: string; author_name: string }>;
  sources: SourceItem[];
  blocks: BlockItem[];
}

const LABELS: Record<BlockType, string> = {
  explanation: "Explanation", image: "Image", audio_video: "Audio or video", story: "Story",
  worked_example: "Worked example", flashcard: "Flashcard", multiple_choice: "Multiple choice",
  true_false: "True or false", fill_in: "Fill in", scenario: "Scenario", practical_task: "Practical task",
  discussion: "Discussion", survey: "Survey", attestation: "Attestation", recap: "Recap",
};

function template(type: BlockType): Record<string, unknown> {
  const values: Record<BlockType, Record<string, unknown>> = {
    explanation: { type, heading: "New idea", body: "Explain this idea clearly." },
    image: { type, url: "", altText: "", decorative: false, caption: "" },
    audio_video: { type, url: "", title: "Media", transcript: "" },
    story: { type, title: "Story", body: "Tell the story." },
    worked_example: { type, title: "Example", problem: "Problem", steps: ["First step"], result: "Result" },
    flashcard: { type, front: "Question", back: "Answer", frontLabel: "Question", backLabel: "Answer" },
    multiple_choice: { type, question: "Question?", options: ["Option A", "Option B"], correctIndex: 0, explanation: "Explain the answer." },
    true_false: { type, statement: "Statement", answer: true, explanation: "Explain why." },
    fill_in: { type, prompt: "Complete ___", answer: "answer", acceptedAnswers: [], explanation: "Explain why." },
    scenario: { type, context: "Situation", decisionPrompt: "What should you do?" },
    practical_task: { type, title: "Task", instructions: ["Complete the task"], submissionAlternative: "Describe what you did", rubric: [] },
    discussion: { type, prompt: "Discuss this idea", privateAlternative: "Reflect privately instead" },
    survey: { type, title: "Survey", questions: [{ id: "q1", label: "Your response", responseType: "text" }] },
    attestation: { type, statement: "I completed this activity", consentLabel: "Confirm", required: true },
    recap: { type, heading: "Recap", points: ["Key point"] },
  };
  return values[type];
}

function FieldEditor({ content, onChange }: { content: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void }) {
  return <div className="space-y-2">{Object.entries(content).filter(([key]) => key !== "type").map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
    if (typeof value === "boolean") return <label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={value} onChange={(event) => onChange({ ...content, [key]: event.target.checked })} />{label}</label>;
    if (typeof value === "number") return <label key={key} className="block text-xs font-semibold">{label}<input type="number" value={value} onChange={(event) => onChange({ ...content, [key]: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" /></label>;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) return <label key={key} className="block text-xs font-semibold">{label}<textarea value={value.join("\n")} onChange={(event) => onChange({ ...content, [key]: event.target.value.split("\n").filter(Boolean) })} rows={3} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" /></label>;
    if (typeof value === "string") return <label key={key} className="block text-xs font-semibold">{label}<textarea value={value} onChange={(event) => onChange({ ...content, [key]: event.target.value })} rows={value.length > 80 ? 4 : 2} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2" /></label>;
    return <p key={key} className="text-xs text-ink-soft">{label} is preserved in its structured format.</p>;
  })}</div>;
}

function BlockEditor({ block, sources, onSaved }: { block: BlockItem; sources: SourceItem[]; onSaved: () => Promise<void> }) {
  const [content, setContent] = useState(block.content);
  const [refs, setRefs] = useState(block.sourceRefs.map((ref) => ref.sourceVersionId).filter(Boolean) as string[]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setContent(block.content); }, [block.content]);
  async function save() {
    setSaving(true); setError("");
    try {
      const result = await fetch(window.location.pathname.replace("/studio/", "/api/studio/courses/") + `/blocks/${block.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: block.revision, content, sourceRefs: refs.map((sourceVersionId) => ({ sourceVersionId })) }),
      });
      const data = await result.json();
      if (!result.ok) return setError(data.error ?? "Could not save block");
      await onSaved();
    } finally { setSaving(false); }
  }
  return <article id={`block-${block.id}`} className="scroll-mt-28 space-y-5 rounded-[1.35rem] border border-line bg-card p-5 shadow-card sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">{LABELS[block.blockType]} · revision {block.revision}</p><h3 className="display mt-2 text-3xl">{block.lessonTitle}</h3></div>{block.editOrigin === "manual" && <span className="rounded-full bg-go-soft px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-go-deep">Edited by a human</span>}</div><FieldEditor content={content} onChange={setContent} />{sources.length > 0 && <fieldset className="rounded-xl bg-paper/65 p-4"><legend className="px-1 text-xs font-semibold">Source traceability</legend><div className="mt-2 space-y-2">{sources.map((source) => <label key={source.source_version_id} className="flex min-h-9 items-start gap-2 text-xs"><input type="checkbox" checked={refs.includes(source.source_version_id)} onChange={(event) => setRefs((current) => event.target.checked ? [...current, source.source_version_id] : current.filter((id) => id !== source.source_version_id))} className="mt-0.5" /><span>{source.title}</span></label>)}</div></fieldset>}<button onClick={() => void save()} disabled={saving} className="btn-primary w-full">{saving ? "Saving this block…" : "Save block"}</button>{error && <p role="alert" className="text-xs font-semibold text-no">{error}</p>}</article>;
}

function OutlineEditor({ section, onSaved, onRegenerate }: {
  section: BlockItem;
  onSaved: () => Promise<void>;
  onRegenerate: (scope: "lesson" | "module", key: string) => Promise<void>;
}) {
  const [moduleTitle, setModuleTitle] = useState(section.moduleTitle);
  const [moduleSummary, setModuleSummary] = useState(section.moduleSummary);
  const [lessonTitle, setLessonTitle] = useState(section.lessonTitle);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const courseId = window.location.pathname.split("/").pop();
    const response = await fetch(`/api/studio/courses/${courseId}/blocks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "outline", moduleKey: section.moduleKey, moduleTitle, moduleSummary,
        modulePosition: section.modulePosition, lessonKey: section.lessonKey,
        lessonTitle, lessonPosition: section.lessonPosition,
      }),
    });
    setSaving(false);
    if (response.ok) await onSaved();
  }
  return <article className="rounded-2xl bg-card border border-line p-4 space-y-3">
    <div><p className="text-xs font-bold uppercase text-ink-soft">Module and lesson</p><input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} aria-label="Module title" className="mt-2 w-full rounded-xl border-2 border-line bg-paper px-3 py-2 font-bold" /><textarea value={moduleSummary} onChange={(event) => setModuleSummary(event.target.value)} aria-label="Module summary" rows={2} className="mt-2 w-full rounded-xl border-2 border-line bg-paper px-3 py-2 text-sm" /><input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} aria-label="Lesson title" className="mt-2 w-full rounded-xl border-2 border-line bg-paper px-3 py-2 font-semibold" /></div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="min-h-11 flex-1 rounded-full bg-teal px-4 text-xs font-bold text-white">{saving ? "Saving…" : "Save outline"}</button><button type="button" onClick={() => void onRegenerate("lesson", section.lessonKey)} className="min-h-11 flex-1 rounded-full border border-line px-4 text-xs font-bold">Regenerate lesson</button><button type="button" onClick={() => void onRegenerate("module", section.moduleKey)} className="min-h-11 flex-1 rounded-full border border-line px-4 text-xs font-bold">Regenerate module</button></div>
  </article>;
}

function CoursePreview({ blocks, mode, appearance }: { blocks: BlockItem[]; mode: "mobile" | "desktop" | "offline"; appearance: CourseAppearance }) {
  return <CourseAppearanceFrame appearance={appearance} className={`course-page-bg mx-auto rounded-2xl border-4 border-ink/80 p-4 transition-all ${mode === "mobile" ? "max-w-sm" : "max-w-4xl"}`}><div>
    <div className="mb-4 flex items-center justify-between text-xs font-bold text-ink-soft"><span>{mode === "mobile" ? "Mobile learner view" : mode === "desktop" ? "Desktop learner view" : "Offline learner view"}</span><span>{blocks.length} blocks</span></div>
    <div className={mode === "desktop" ? "grid grid-cols-2 gap-3" : "space-y-3"}>{blocks.map((block) => {
      const channel = BLOCK_CHANNELS[block.blockType];
      const unavailable = mode === "offline" && !channel.offline;
      return <article key={block.id} className="rounded-xl bg-card border border-line p-3"><p className="text-xs font-bold uppercase text-primary-deep">{LABELS[block.blockType]}</p><h3 className="font-bold mt-1">{block.lessonTitle}</h3>{unavailable ? <p className="mt-2 text-sm text-ink-soft">Offline fallback: {channel.fallback ? LABELS[channel.fallback] : "Reconnect to use this block"}</p> : <div className="mt-2 space-y-1 text-sm">{Object.entries(block.content).filter(([key]) => key !== "type").slice(0, 4).map(([key, value]) => <p key={key}><span className="font-semibold">{key.replace(/([A-Z])/g, " $1")}:</span> {Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" · ") : String(value)}</p>)}</div>}</article>;
    })}</div>
  </div></CourseAppearanceFrame>;
}

export default function StudioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<StudioData | null>(null);
  const [analysis, setAnalysis] = useState<{ totalBlocks: number; tracedBlocks: number; unsupportedBlockIds: string[]; accessibilityIssueBlockIds: string[]; estimatedDurationMinutes: number; estimatedLessonMinutes: number } | null>(null);
  const [blockType, setBlockType] = useState<BlockType>("explanation");
  const [moduleTitle, setModuleTitle] = useState("Module 1");
  const [lessonTitle, setLessonTitle] = useState("Lesson 1");
  const [comment, setComment] = useState("");
  const [versionDiff, setVersionDiff] = useState<{ added: string[]; removed: string[]; changed: string[]; appearanceChanged: boolean } | null>(null);
  const [error, setError] = useState("");
  const [regenerating, setRegenerating] = useState("");
  const [previewMode, setPreviewMode] = useState<"edit" | "mobile" | "desktop" | "offline">("edit");
  const [selectedLessonKey, setSelectedLessonKey] = useState("");
  const [studioPanel, setStudioPanel] = useState<"outline" | "canvas" | "inspector">("canvas");

  const load = useCallback(async () => {
    const response = await fetch(`/api/studio/courses/${id}`);
    if (response.status === 401) return router.push("/login");
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not open Studio");
    setData(result);
    if (result.version.parent_version_id) {
      const diff = await fetch(`/api/studio/courses/${id}/versions/diff?base=${encodeURIComponent(result.version.parent_version_id)}&compare=${encodeURIComponent(result.version.id)}`);
      if (diff.ok) setVersionDiff(await diff.json());
    } else {
      setVersionDiff(null);
    }
    const check = await fetch(`/api/studio/courses/${id}/analysis`);
    if (check.ok) setAnalysis(await check.json());
  }, [id, router]);
  useEffect(() => { void load(); }, [load]);
  const lessons = useMemo(() => data ? [...new Map(data.blocks.map((block) => [block.lessonKey, block])).values()] : [], [data]);
  useEffect(() => {
    if (lessons.length > 0 && !lessons.some((lesson) => lesson.lessonKey === selectedLessonKey)) {
      setSelectedLessonKey(lessons[0].lessonKey);
    }
  }, [lessons, selectedLessonKey]);
  const selectedLesson = lessons.find((lesson) => lesson.lessonKey === selectedLessonKey) ?? lessons[0];
  const visibleBlocks = data?.blocks.filter((block) => block.lessonKey === selectedLesson?.lessonKey) ?? [];
  const outlineModules = useMemo(() => {
    const groups = new Map<string, { title: string; lessons: BlockItem[] }>();
    for (const lesson of lessons) {
      const group = groups.get(lesson.moduleKey) ?? { title: lesson.moduleTitle, lessons: [] };
      group.lessons.push(lesson);
      groups.set(lesson.moduleKey, group);
    }
    return [...groups.entries()];
  }, [lessons]);

  async function addBlock(event: FormEvent) {
    event.preventDefault(); setError("");
    const existing = selectedLesson ?? lessons[0];
    const response = await fetch(`/api/studio/courses/${id}/blocks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", moduleKey: existing?.moduleKey ?? "module:1", moduleTitle: existing?.moduleTitle ?? moduleTitle, moduleSummary: existing?.moduleSummary ?? "", lessonKey: existing?.lessonKey ?? "lesson:1", lessonTitle: existing?.lessonTitle ?? lessonTitle, modulePosition: existing?.modulePosition ?? 0, lessonPosition: existing?.lessonPosition ?? 0, blockType, content: template(blockType), sourceRefs: [] }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not add block");
    await load();
  }

  async function runLifecycle(action: "submit" | "review" | "branch" | "archive", decision?: "approved" | "changes_requested", versionId?: string) {
    setError("");
    const response = await fetch(`/api/studio/courses/${id}/lifecycle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, decision, versionId }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not update this version");
    await load();
  }

  async function addComment() {
    if (!comment.trim()) return;
    const response = await fetch(`/api/studio/courses/${id}/lifecycle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "comment", comment }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not add comment");
    setComment("");
    await load();
  }

  async function resolveComment(commentId: string) {
    const response = await fetch(`/api/studio/courses/${id}/lifecycle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve_comment", commentId }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not resolve comment");
    await load();
  }

  async function regenerate(scopeType: "block" | "lesson" | "module", scopeKey: string) {
    setError("");
    setRegenerating(`${scopeType}:${scopeKey}`);
    try {
      const response = await fetch(`/api/studio/courses/${id}/regenerate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType, scopeKey }),
      });
      const result = await response.json();
      if (!response.ok) return setError(result.error ?? "Could not regenerate this selection");
      await load();
    } finally {
      setRegenerating("");
    }
  }

  async function publish() {
    setError("");
    const response = await fetch(`/api/courses/${id}/publish`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: true, category: "General" }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not publish this version");
    await load();
  }

  async function moveBlock(block: BlockItem, direction: -1 | 1) {
    const lessonBlocks = data?.blocks.filter((candidate) => candidate.lessonKey === block.lessonKey) ?? [];
    const index = lessonBlocks.findIndex((candidate) => candidate.id === block.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= lessonBlocks.length) return;
    const orderedBlockIds = lessonBlocks.map((candidate) => candidate.id);
    [orderedBlockIds[index], orderedBlockIds[target]] = [orderedBlockIds[target], orderedBlockIds[index]];
    const response = await fetch(`/api/studio/courses/${id}/blocks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", lessonKey: block.lessonKey, orderedBlockIds }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not reorder blocks");
    await load();
  }

  if (!data) return <div className="p-6 text-ink-soft">{error || "Opening Studio…"}</div>;
  const editable = data.version.lifecycle_status === "draft";
  return <div className="page-wrap"><div className="mx-auto max-w-[88rem] space-y-5">
    <header className="grid overflow-hidden rounded-[1.6rem] border border-line bg-card shadow-card lg:grid-cols-[1.2fr_.8fr]">
      <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10"><Link href={`/course/${id}`} className="inline-flex w-fit items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft hover:text-ink"><span aria-hidden="true">←</span> Course journey</Link><div className="mt-7 flex flex-wrap items-center gap-2"><span className="rounded-full bg-ink px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-white">Studio</span><span className="rounded-full border border-line px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-ink-soft">Version {data.version.version_number}</span><span className="rounded-full bg-go-soft px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-go-deep">{data.version.lifecycle_status.replaceAll("_", " ")}</span></div><h1 className="display mt-4 text-[clamp(2.8rem,8vw,5rem)] leading-[0.9]">{data.version.title}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-ink-soft">{data.version.description || "Shape the course with full source, review, accessibility, and version control."}</p></div>
      <div className="relative min-h-56"><CourseWorld seed={`studio:${id}`} title={data.version.title} theme={(data.version.appearance ?? DEFAULT_COURSE_APPEARANCE).worldTheme} accent={COURSE_ACCENT_HEX[(data.version.appearance ?? DEFAULT_COURSE_APPEARANCE).accent]} progress={analysis && analysis.totalBlocks > 0 ? Math.round((analysis.tracedBlocks / analysis.totalBlocks) * 100) : 0} className="absolute inset-0" /><Link href={`/course/${id}#course-appearance`} className="absolute bottom-5 right-5 z-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-pine/70 px-5 text-sm font-semibold text-white backdrop-blur-sm">Preview & design learner world <AppIcon name="arrow" className="h-4 w-4" /></Link></div>
    </header>

    {analysis && <section className="grid gap-3 sm:grid-cols-3" aria-label="Course quality summary"><div className="rounded-[1.2rem] bg-signal p-4"><p className="section-label text-ink/55">Source coverage</p><p className="display mt-3 text-3xl">{analysis.tracedBlocks}/{analysis.totalBlocks}</p><p className="text-xs text-ink/60">blocks linked</p></div><div className="rounded-[1.2rem] bg-sky p-4"><p className="section-label text-ink/55">Accessibility</p><p className="display mt-3 text-3xl">{analysis.accessibilityIssueBlockIds.length === 0 ? "Ready" : analysis.accessibilityIssueBlockIds.length}</p><p className="text-xs text-ink/60">{analysis.accessibilityIssueBlockIds.length === 0 ? "checks pass" : "issues to resolve"}</p></div><div className="rounded-[1.2rem] border border-line bg-card p-4 shadow-card"><p className="section-label">Estimated duration</p><p className="display mt-3 text-3xl">{analysis.estimatedDurationMinutes}</p><p className="text-xs text-ink-soft">minutes</p></div></section>}

    <section className="sticky top-[4.5rem] z-20 flex flex-col gap-3 rounded-[1.2rem] border border-line bg-paper/92 p-2 shadow-card backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between lg:top-2"><div className="flex gap-1 overflow-x-auto rounded-full bg-card p-1">{(["edit", "mobile", "desktop", "offline"] as const).map((mode) => <button key={mode} type="button" onClick={() => setPreviewMode(mode)} aria-pressed={previewMode === mode} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold capitalize ${previewMode === mode ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>{mode === "edit" ? "Editorial view" : `${mode} preview`}</button>)}</div><p className="hidden px-3 text-xs text-ink-soft sm:block">{editable ? "Draft changes remain private until review and publishing." : "This version is read-only."}</p></section>

    {error && <p role="alert" className="rounded-xl bg-no-soft px-4 py-3 text-sm font-semibold text-no">{error}</p>}
    {previewMode !== "edit" && <section className="rounded-[1.5rem] border border-line bg-card p-4 shadow-card sm:p-6"><CoursePreview blocks={data.blocks} mode={previewMode} appearance={data.version.appearance ?? DEFAULT_COURSE_APPEARANCE} /></section>}

    {previewMode === "edit" && <>
      <nav className="grid grid-cols-3 gap-1 rounded-[1.1rem] border border-line bg-card p-1 xl:hidden" aria-label="Studio panels">{([ ["outline", "Outline", "layers"], ["canvas", "Canvas", "create"], ["inspector", "Inspector", "settings"] ] as const).map(([panel, label, icon]) => <button key={panel} type="button" onClick={() => setStudioPanel(panel)} aria-pressed={studioPanel === panel} className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold ${studioPanel === panel ? "bg-ink text-white" : "text-ink-soft"}`}><AppIcon name={icon} className="h-4 w-4" /><span className="truncate">{label}</span></button>)}</nav>

      <div className="grid items-start gap-5 xl:grid-cols-[17rem_minmax(0,1fr)_20rem]">
        <aside className={`${studioPanel === "outline" ? "block" : "hidden"} space-y-4 xl:sticky xl:top-24 xl:block`} aria-label="Course outline"><div className="rounded-[1.35rem] border border-line bg-card p-4 shadow-card"><div className="flex items-center justify-between gap-3"><div><p className="section-label">Outline</p><h2 className="display mt-1 text-3xl">Course structure</h2></div><span className="text-xs font-semibold text-ink-soft">{lessons.length}</span></div><nav className="mt-5 space-y-5" aria-label="Modules and lessons">{outlineModules.length === 0 && <p className="text-sm leading-6 text-ink-soft">Add the first block to create a module and lesson.</p>}{outlineModules.map(([moduleKey, module]) => <section key={moduleKey}><h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">{module.title}</h3><div className="mt-2 space-y-1">{module.lessons.map((lesson) => <button key={lesson.lessonKey} type="button" onClick={() => { setSelectedLessonKey(lesson.lessonKey); setStudioPanel("canvas"); }} aria-pressed={selectedLesson?.lessonKey === lesson.lessonKey} className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${selectedLesson?.lessonKey === lesson.lessonKey ? "bg-ink text-white" : "hover:bg-paper"}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${selectedLesson?.lessonKey === lesson.lessonKey ? "bg-signal" : "bg-moss"}`} /><span className="min-w-0 flex-1 leading-snug">{lesson.lessonTitle}</span><span className="text-[10px] opacity-60">{data.blocks.filter((block) => block.lessonKey === lesson.lessonKey).length}</span></button>)}</div></section>)}</nav></div></aside>

        <section className={`${studioPanel === "canvas" ? "block" : "hidden"} min-w-0 space-y-5 xl:block`} aria-labelledby="studio-canvas-heading"><div className="rounded-[1.35rem] border border-line bg-card p-5 shadow-card sm:p-6"><p className="section-label">Editable canvas</p><h2 id="studio-canvas-heading" className="display mt-2 text-4xl">{selectedLesson?.lessonTitle ?? "First lesson"}</h2><p className="mt-2 text-sm text-ink-soft">{selectedLesson?.moduleTitle ?? "Start by naming the first module and lesson."}</p></div>
          {editable && selectedLesson && <OutlineEditor key={`outline:${selectedLesson.lessonKey}`} section={selectedLesson} onSaved={load} onRegenerate={regenerate} />}
          {visibleBlocks.length === 0 && <p className="rounded-[1.35rem] border border-dashed border-line-deep bg-card px-5 py-10 text-center text-sm text-ink-soft">This lesson is empty. Add its first block below.</p>}
          {visibleBlocks.map((block) => { const lessonIndex = visibleBlocks.findIndex((candidate) => candidate.id === block.id); return <div key={`${block.id}:${block.revision}`} className="space-y-2"><div className="flex flex-wrap justify-end gap-2">{editable && <><button type="button" onClick={() => void moveBlock(block, -1)} disabled={lessonIndex === 0} className="min-h-10 rounded-full border border-line px-4 text-xs font-semibold disabled:opacity-30">Move up</button><button type="button" onClick={() => void moveBlock(block, 1)} disabled={lessonIndex === visibleBlocks.length - 1} className="min-h-10 rounded-full border border-line px-4 text-xs font-semibold disabled:opacity-30">Move down</button></>}</div><BlockEditor block={block} sources={data.sources} onSaved={load} />{editable && <button type="button" onClick={() => void regenerate("block", block.id)} disabled={!!regenerating} className="min-h-11 w-full rounded-full border border-teal/40 px-5 text-sm font-semibold text-teal-deep disabled:opacity-40">{regenerating === `block:${block.id}` ? "Regenerating this block…" : "Regenerate only this block"}</button>}</div>; })}
          {editable && <form onSubmit={addBlock} className="space-y-4 rounded-[1.35rem] border border-line bg-card p-5 shadow-card sm:p-6"><div><p className="section-label">Add to the canvas</p><h2 className="display mt-2 text-3xl">New content block</h2></div>{lessons.length === 0 && <><label className="block text-xs font-semibold">Module title<input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} className="field mt-2" /></label><label className="block text-xs font-semibold">Lesson title<input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} className="field mt-2" /></label></>}<label className="block text-xs font-semibold">Block type<select value={blockType} onChange={(event) => setBlockType(event.target.value as BlockType)} className="field mt-2">{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="btn-teal w-full">Add block</button></form>}
        </section>

        <aside className={`${studioPanel === "inspector" ? "block" : "hidden"} space-y-4 xl:sticky xl:top-24 xl:block`} aria-label="Course inspector">
          <section className="rounded-[1.35rem] border border-line bg-card p-4 shadow-card"><p className="section-label">Release desk</p><h2 className="display mt-2 text-3xl">Review & publish</h2><div className="mt-4 space-y-2">{data.version.lifecycle_status === "draft" && <button onClick={() => void runLifecycle("submit")} className="btn-primary w-full">Submit for review</button>}{data.version.lifecycle_status === "review" && <><button onClick={() => void runLifecycle("review", "changes_requested")} className="min-h-11 w-full rounded-full border border-line px-4 text-sm font-semibold">Request changes</button><button onClick={() => void runLifecycle("review", "approved")} className="btn-teal w-full">Approve version</button></>}{data.version.lifecycle_status === "approved" && <button onClick={() => void publish()} className="btn-go w-full">Publish approved version</button>}{data.version.lifecycle_status === "published" && <button onClick={() => void runLifecycle("branch")} className="btn-primary w-full">Create a new draft</button>}{["draft", "review", "approved"].includes(data.version.lifecycle_status) && <button onClick={() => void runLifecycle("archive")} className="min-h-11 w-full rounded-full border border-line px-4 text-sm font-semibold">Archive working version</button>}</div></section>

          <details className="rounded-[1.25rem] border border-line bg-card p-4 shadow-card" open><summary className="min-h-10 text-sm font-semibold">Source traceability <span className="float-right text-xs font-normal text-ink-soft">{data.sources.length}</span></summary><div className="mt-3 space-y-2 border-t border-line pt-3">{data.sources.length === 0 && <p className="text-xs leading-5 text-ink-soft">No source versions are attached to this course.</p>}{data.sources.map((source) => <div key={source.source_version_id} className="rounded-lg bg-paper p-3"><p className="text-xs font-semibold">{source.title}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-ink-soft">{source.kind}</p></div>)}</div></details>

          <details className="rounded-[1.25rem] border border-line bg-card p-4 shadow-card"><summary className="min-h-10 text-sm font-semibold">Review notes <span className="float-right text-xs font-normal text-ink-soft">{data.comments.filter((item) => item.status === "open").length} open</span></summary><div className="mt-3 space-y-3 border-t border-line pt-3">{data.reviews.map((review) => <div key={review.id} className="rounded-lg bg-paper p-3 text-xs"><p className="font-semibold">{review.reviewer_name} · {review.decision.replaceAll("_", " ")}</p>{review.summary && <p className="mt-1 leading-5 text-ink-soft">{review.summary}</p>}</div>)}{data.comments.map((item) => <div key={item.id} className="rounded-lg border border-line p-3 text-xs"><p><strong>{item.author_name}:</strong> {item.body}</p><p className="mt-1 uppercase tracking-wide text-ink-soft">{item.status}</p>{item.status === "open" && <button onClick={() => void resolveComment(item.id)} className="mt-2 font-semibold text-teal">Mark resolved</button>}</div>)}<label className="block text-xs font-semibold">Add a review note<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} className="field mt-2" /></label><button type="button" onClick={() => void addComment()} disabled={!comment.trim()} className="btn-teal w-full">Add note</button></div></details>

          <details className="rounded-[1.25rem] border border-line bg-card p-4 shadow-card"><summary className="min-h-10 text-sm font-semibold">Version history <span className="float-right text-xs font-normal text-ink-soft">{data.versions.length}</span></summary><div className="mt-3 space-y-2 border-t border-line pt-3">{versionDiff && <div className="rounded-lg bg-sky/45 p-3 text-xs"><p className="font-semibold">Changes from version {data.versions.find((version) => version.id === data.version.parent_version_id)?.version_number}</p><p className="mt-1 text-ink-soft">{versionDiff.changed.length} changed · {versionDiff.added.length} added · {versionDiff.removed.length} removed{versionDiff.appearanceChanged ? " · appearance changed" : ""}</p></div>}{data.versions.map((version) => <div key={version.id} className="rounded-lg bg-paper p-3 text-xs"><p><strong>Version {version.version_number}</strong> · {version.lifecycle_status}</p>{data.version.lifecycle_status === "published" && version.lifecycle_status === "superseded" && <button onClick={() => void runLifecycle("branch", undefined, version.id)} className="mt-2 font-semibold text-teal-deep">Restore as draft</button>}</div>)}</div></details>
        </aside>
      </div>
    </>}
  </div></div>;
}
