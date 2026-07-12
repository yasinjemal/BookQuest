"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { BlockType } from "@/lib/block-registry";

interface SourceItem { source_version_id: string; title: string; kind: string }
interface BlockItem {
  id: string; lineageId: string; moduleKey: string; moduleTitle: string; moduleSummary: string;
  lessonKey: string; lessonTitle: string; modulePosition: number; lessonPosition: number;
  position: number; blockType: BlockType; revision: number; content: Record<string, unknown>;
  sourceRefs: Array<{ sourceVersionId?: string }>; editOrigin: string;
}
interface StudioData {
  version: { id: string; version_number: number; lifecycle_status: string; title: string; description: string };
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

export default function StudioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<StudioData | null>(null);
  const [analysis, setAnalysis] = useState<{ totalBlocks: number; tracedBlocks: number; accessibilityIssueBlockIds: string[] } | null>(null);
  const [blockType, setBlockType] = useState<BlockType>("explanation");
  const [moduleTitle, setModuleTitle] = useState("Module 1");
  const [lessonTitle, setLessonTitle] = useState("Lesson 1");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/studio/courses/${id}`);
    if (response.status === 401) return router.push("/login");
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not open Studio");
    setData(result);
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

  if (!data) return <div className="p-6 text-ink-soft">{error || "Opening Studio…"}</div>;
  return <div className="px-4 pt-6 pb-8 space-y-5"><header><Link href={`/course/${id}`} className="text-sm text-primary-deep font-semibold">← Course</Link><h1 className="text-2xl font-extrabold mt-2">{data.version.title}</h1><p className="text-sm text-ink-soft">Draft version {data.version.version_number} · {data.blocks.length} blocks</p></header>{analysis && <section className="rounded-2xl bg-card border border-line p-4"><h2 className="font-bold">Draft checks</h2><p className="text-sm mt-1">{analysis.tracedBlocks}/{analysis.totalBlocks} blocks linked to sources</p><p className="text-sm">{analysis.accessibilityIssueBlockIds.length === 0 ? "Accessibility checks pass" : `${analysis.accessibilityIssueBlockIds.length} accessibility issues need attention`}</p></section>}<section className="space-y-3">{data.blocks.length === 0 && <p className="rounded-xl bg-paper border border-line p-4 text-sm text-ink-soft">This draft is empty. Add its first block below.</p>}{data.blocks.map((block) => <BlockEditor key={`${block.id}:${block.revision}`} block={block} sources={data.sources} onSaved={load} />)}</section><form onSubmit={addBlock} className="rounded-2xl bg-card border border-line p-4 space-y-3"><h2 className="font-bold">Add a block</h2>{lessons.length === 0 && <><input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} placeholder="Module title" className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2" /><input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="Lesson title" className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2" /></>}<select value={blockType} onChange={(event) => setBlockType(event.target.value as BlockType)} className="w-full rounded-xl border-2 border-line bg-paper px-3 py-2.5">{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="w-full rounded-xl bg-teal text-white font-bold py-2.5">Add block</button></form>{error && <p className="text-sm text-no font-semibold">{error}</p>}</div>;
}
