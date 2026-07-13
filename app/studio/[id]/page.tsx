"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BLOCK_CHANNELS, type BlockType } from "@/lib/block-registry";

interface SourceItem { source_version_id: string; title: string; kind: string }
interface BlockItem {
  id: string; lineageId: string; moduleKey: string; moduleTitle: string; moduleSummary: string;
  lessonKey: string; lessonTitle: string; modulePosition: number; lessonPosition: number;
  position: number; blockType: BlockType; revision: number; content: Record<string, unknown>;
  sourceRefs: Array<{ sourceVersionId?: string }>; editOrigin: string;
}
interface StudioData {
  version: { id: string; version_number: number; parent_version_id: string | null; lifecycle_status: string; title: string; description: string };
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
  return <article className="rounded-2xl bg-card border border-line p-4 space-y-3"><div className="flex justify-between"><div><p className="text-xs text-ink-soft">{LABELS[block.blockType]} · revision {block.revision}</p><h3 className="font-bold">{block.lessonTitle}</h3></div>{block.editOrigin === "manual" && <span className="text-xs text-teal font-semibold">Edited</span>}</div><FieldEditor content={content} onChange={setContent} />{sources.length > 0 && <fieldset><legend className="text-xs font-semibold mb-1">Source links</legend><div className="space-y-1">{sources.map((source) => <label key={source.source_version_id} className="flex gap-2 text-xs"><input type="checkbox" checked={refs.includes(source.source_version_id)} onChange={(event) => setRefs((current) => event.target.checked ? [...current, source.source_version_id] : current.filter((id) => id !== source.source_version_id))} />{source.title}</label>)}</div></fieldset>}<button onClick={() => void save()} disabled={saving} className="w-full rounded-xl bg-primary text-white font-bold py-2 disabled:opacity-40">{saving ? "Saving…" : "Save block"}</button>{error && <p className="text-xs text-no font-semibold">{error}</p>}</article>;
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
    <div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-teal text-white text-xs font-bold py-2">{saving ? "Saving…" : "Save outline"}</button><button type="button" onClick={() => void onRegenerate("lesson", section.lessonKey)} className="rounded-xl border border-line text-xs font-bold py-2">Regenerate lesson</button><button type="button" onClick={() => void onRegenerate("module", section.moduleKey)} className="rounded-xl border border-line text-xs font-bold py-2">Regenerate module</button></div>
  </article>;
}

function CoursePreview({ blocks, mode }: { blocks: BlockItem[]; mode: "mobile" | "desktop" | "offline" }) {
  return <div className={`mx-auto rounded-2xl border-4 border-ink/80 bg-paper p-4 transition-all ${mode === "mobile" ? "max-w-sm" : "max-w-4xl"}`}>
    <div className="mb-4 flex items-center justify-between text-xs font-bold text-ink-soft"><span>{mode === "mobile" ? "Mobile learner view" : mode === "desktop" ? "Desktop learner view" : "Offline learner view"}</span><span>{blocks.length} blocks</span></div>
    <div className={mode === "desktop" ? "grid grid-cols-2 gap-3" : "space-y-3"}>{blocks.map((block) => {
      const channel = BLOCK_CHANNELS[block.blockType];
      const unavailable = mode === "offline" && !channel.offline;
      return <article key={block.id} className="rounded-xl bg-card border border-line p-3"><p className="text-xs font-bold uppercase text-primary-deep">{LABELS[block.blockType]}</p><h3 className="font-bold mt-1">{block.lessonTitle}</h3>{unavailable ? <p className="mt-2 text-sm text-ink-soft">Offline fallback: {channel.fallback ? LABELS[channel.fallback] : "Reconnect to use this block"}</p> : <div className="mt-2 space-y-1 text-sm">{Object.entries(block.content).filter(([key]) => key !== "type").slice(0, 4).map(([key, value]) => <p key={key}><span className="font-semibold">{key.replace(/([A-Z])/g, " $1")}:</span> {Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" · ") : String(value)}</p>)}</div>}</article>;
    })}</div>
  </div>;
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
  const [versionDiff, setVersionDiff] = useState<{ added: string[]; removed: string[]; changed: string[] } | null>(null);
  const [error, setError] = useState("");
  const [regenerating, setRegenerating] = useState("");
  const [previewMode, setPreviewMode] = useState<"edit" | "mobile" | "desktop" | "offline">("edit");

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

  async function addBlock(event: FormEvent) {
    event.preventDefault(); setError("");
    const existing = lessons[0];
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
  return <div className="page-wrap max-w-6xl space-y-5">
    <header className="premium-panel p-7 sm:p-10">
      <Link href={`/course/${id}`} className="relative z-10 text-[10px] font-bold uppercase tracking-[0.15em] text-white/45 hover:text-white">← Course</Link>
      <p className="relative z-10 mt-8 text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Studio · Version {data.version.version_number}</p>
      <h1 className="relative z-10 mt-3 font-display text-5xl leading-[0.9] text-white sm:text-7xl">{data.version.title}</h1>
      <p className="relative z-10 mt-5 text-sm text-white/45">{data.version.lifecycle_status} · {data.blocks.length} blocks · Every detail remains yours</p>
    </header>
    {analysis && <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-signal p-5"><p className="section-label text-ink/50">Source coverage</p><p className="display mt-5 text-3xl">{analysis.tracedBlocks}/{analysis.totalBlocks}</p><p className="text-xs text-ink/55">blocks linked</p></div>
      <div className="rounded-2xl bg-sky p-5"><p className="section-label text-ink/50">Accessibility</p><p className="display mt-5 text-3xl">{analysis.accessibilityIssueBlockIds.length === 0 ? "Ready" : analysis.accessibilityIssueBlockIds.length}</p><p className="text-xs text-ink/55">{analysis.accessibilityIssueBlockIds.length === 0 ? "checks pass" : "issues to resolve"}</p></div>
      <div className="paper-card p-5"><p className="section-label">Estimated duration</p><p className="display mt-5 text-3xl">{analysis.estimatedDurationMinutes}</p><p className="text-xs text-ink-soft">minutes</p></div>
    </section>}
    <section><div className="flex w-fit gap-1 overflow-x-auto rounded-full border border-line bg-card p-1 shadow-card">{(["edit", "mobile", "desktop", "offline"] as const).map((mode) => <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition-all ${previewMode === mode ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>{mode}</button>)}</div></section>
    {previewMode !== "edit" && <CoursePreview blocks={data.blocks} mode={previewMode} />}
    <section className="paper-card space-y-3 p-5 sm:p-6">
      <p className="section-label">Release desk</p><h2 className="display text-3xl">Review and publish</h2>
      {data.version.lifecycle_status === "draft" && <button onClick={() => void runLifecycle("submit")} className="w-full rounded-xl bg-primary text-white font-bold py-2.5">Submit for review</button>}
      {data.version.lifecycle_status === "review" && <div className="grid grid-cols-2 gap-2"><button onClick={() => void runLifecycle("review", "changes_requested")} className="rounded-xl border border-line font-bold py-2.5">Request changes</button><button onClick={() => void runLifecycle("review", "approved")} className="rounded-xl bg-teal text-white font-bold py-2.5">Approve</button></div>}
      {data.version.lifecycle_status === "approved" && <button onClick={() => void publish()} className="w-full rounded-xl bg-go text-white font-bold py-2.5">Publish approved version</button>}
      {data.version.lifecycle_status === "published" && <button onClick={() => void runLifecycle("branch")} className="w-full rounded-xl bg-primary text-white font-bold py-2.5">Create a new draft</button>}
      {["draft", "review", "approved"].includes(data.version.lifecycle_status) && <button onClick={() => void runLifecycle("archive")} className="w-full rounded-xl border border-line font-bold py-2.5">Archive this working version</button>}
    </section>
    {versionDiff && <section className="rounded-2xl bg-card border border-line p-4">
      <h2 className="font-bold">Changes from version {data.versions.find((version) => version.id === data.version.parent_version_id)?.version_number}</h2>
      <p className="text-sm mt-1">{versionDiff.changed.length} changed · {versionDiff.added.length} added · {versionDiff.removed.length} removed</p>
    </section>}
    <section className="rounded-2xl bg-card border border-line p-4 space-y-3">
      <h2 className="font-bold">Review notes</h2>
      {data.reviews.map((review) => <div key={review.id} className="rounded-xl bg-paper border border-line p-3 text-sm"><p className="font-semibold">{review.reviewer_name} · {review.decision.replace("_", " ")}</p>{review.summary && <p className="text-ink-soft mt-1">{review.summary}</p>}</div>)}
      {data.comments.map((item) => <div key={item.id} className="rounded-xl bg-paper border border-line p-3 text-sm"><div className="flex justify-between gap-2"><p><span className="font-semibold">{item.author_name}:</span> {item.body}</p><span className="text-xs text-ink-soft">{item.status}</span></div>{item.status === "open" && <button onClick={() => void resolveComment(item.id)} className="mt-2 text-xs font-bold text-teal">Mark resolved</button>}</div>)}
      <div className="flex gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a review note" className="min-w-0 flex-1 rounded-xl border-2 border-line bg-paper px-3 py-2" /><button type="button" onClick={() => void addComment()} className="rounded-xl bg-teal text-white font-bold px-4">Add</button></div>
    </section>
    <section className="rounded-2xl bg-card border border-line p-4 space-y-2">
      <h2 className="font-bold">Version history</h2>
      {data.versions.map((version) => <div key={version.id} className="flex items-center justify-between rounded-xl bg-paper border border-line px-3 py-2"><p className="text-sm"><span className="font-semibold">Version {version.version_number}</span> · {version.lifecycle_status}</p>{data.version.lifecycle_status === "published" && version.lifecycle_status === "superseded" && <button onClick={() => void runLifecycle("branch", undefined, version.id)} className="text-xs font-bold text-primary-deep">Restore as draft</button>}</div>)}
    </section>
    {previewMode === "edit" && <section className="space-y-3">
      {editable && lessons.map((section) => <OutlineEditor key={`outline:${section.lessonKey}`} section={section} onSaved={load} onRegenerate={regenerate} />)}
      {data.blocks.length === 0 && <p className="rounded-xl bg-paper border border-line p-4 text-sm text-ink-soft">This draft is empty. Add its first block below.</p>}
      {data.blocks.map((block) => {
        const lessonBlocks = data.blocks.filter((candidate) => candidate.lessonKey === block.lessonKey);
        const lessonIndex = lessonBlocks.findIndex((candidate) => candidate.id === block.id);
        return <div key={`${block.id}:${block.revision}`} className="space-y-2">
          {editable && <div className="flex justify-end gap-2"><button type="button" onClick={() => void moveBlock(block, -1)} disabled={lessonIndex === 0} className="rounded-lg border border-line px-3 py-1 text-xs font-bold disabled:opacity-30">Move up</button><button type="button" onClick={() => void moveBlock(block, 1)} disabled={lessonIndex === lessonBlocks.length - 1} className="rounded-lg border border-line px-3 py-1 text-xs font-bold disabled:opacity-30">Move down</button></div>}
          <BlockEditor block={block} sources={data.sources} onSaved={load} />
          {editable && <button type="button" onClick={() => void regenerate("block", block.id)} disabled={!!regenerating} className="w-full rounded-xl border border-primary/40 text-primary-deep font-bold py-2 disabled:opacity-40">{regenerating === `block:${block.id}` ? "Regenerating…" : "Regenerate this block"}</button>}
        </div>;
      })}
    </section>}
    {previewMode === "edit" && editable && <form onSubmit={addBlock} className="rounded-2xl bg-card border border-line p-4 space-y-3">
      <h2 className="font-bold">Add a block</h2>
      {lessons.length === 0 && <><input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} placeholder="Module title" className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2" /><input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="Lesson title" className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2" /></>}
      <select value={blockType} onChange={(event) => setBlockType(event.target.value as BlockType)} className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2.5">{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button className="w-full rounded-xl bg-teal text-white font-bold py-2.5">Add block</button>
    </form>}
    {error && <p className="text-sm text-no font-semibold">{error}</p>}
  </div>;
}
