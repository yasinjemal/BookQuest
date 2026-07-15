"use client";

import type { BlockType } from "@/lib/block-registry";
import { BLOCK_DENSITIES, BLOCK_IMPORTANCE, BLOCK_INTENTS } from "@/lib/block-presentation";

const HELP: Record<string, string> = {
  heading: "A short heading learners can scan.",
  body: "Keep one idea per block and use plain language.",
  altText: "Describe the purpose of the image for someone who cannot see it.",
  transcript: "A text alternative makes media usable without sound.",
  explanation: "Explain why the answer is correct, not only which answer is correct.",
  submissionAlternative: "Offer a text-based way to complete the task.",
};

function labelFor(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function TextField({ name, value, onChange }: { name: string; value: string; onChange: (value: string) => void }) {
  const multiline = value.length > 70 || ["body", "transcript", "context", "guidance", "explanation", "statement", "prompt", "decisionPrompt", "submissionAlternative"].includes(name);
  return <label className="block text-xs font-semibold text-ink">
    {labelFor(name)}
    {multiline
      ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={name === "body" || name === "transcript" ? 6 : 3} className="field mt-2 resize-y" />
      : <input value={value} onChange={(event) => onChange(event.target.value)} className="field mt-2" />}
    {HELP[name] && <span className="mt-1.5 block font-normal leading-5 text-ink-soft">{HELP[name]}</span>}
  </label>;
}

function StringList({ name, values, onChange }: { name: string; values: string[]; onChange: (values: string[]) => void }) {
  return <fieldset className="space-y-2 rounded-xl border border-line bg-paper/45 p-3">
    <legend className="px-1 text-xs font-semibold">{labelFor(name)}</legend>
    {values.map((value, index) => <div key={index} className="flex items-start gap-2">
      <span className="mt-3 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{index + 1}</span>
      <textarea aria-label={`${labelFor(name)} ${index + 1}`} value={value} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} rows={2} className="field min-h-11 flex-1 resize-y" />
      <button type="button" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} disabled={values.length === 1} aria-label={`Remove ${labelFor(name)} ${index + 1}`} className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-lg text-ink-soft hover:border-no hover:text-no">×</button>
    </div>)}
    <button type="button" onClick={() => onChange([...values, ""])} className="quiet-button min-h-10 w-full text-xs">+ Add {labelFor(name).toLowerCase().replace(/s$/, "")}</button>
  </fieldset>;
}

function SurveyQuestions({ values, onChange }: { values: Array<{ id: string; label: string; responseType: "text" | "scale" | "choice" }>; onChange: (values: Array<{ id: string; label: string; responseType: "text" | "scale" | "choice" }>) => void }) {
  return <fieldset className="space-y-3 rounded-xl border border-line bg-paper/45 p-3">
    <legend className="px-1 text-xs font-semibold">Questions</legend>
    {values.map((question, index) => <div key={question.id} className="rounded-xl border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">Question {index + 1}</span><button type="button" disabled={values.length === 1} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-semibold text-no disabled:opacity-30">Remove</button></div>
      <input aria-label={`Question ${index + 1}`} value={question.label} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className="field mt-2" />
      <select aria-label={`Question ${index + 1} response type`} value={question.responseType} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? { ...item, responseType: event.target.value as "text" | "scale" | "choice" } : item))} className="field mt-2">
        <option value="text">Written response</option><option value="scale">Rating scale</option><option value="choice">Choice</option>
      </select>
    </div>)}
    <button type="button" onClick={() => onChange([...values, { id: `q${Date.now()}`, label: "New question", responseType: "text" }])} className="quiet-button min-h-10 w-full text-xs">+ Add question</button>
  </fieldset>;
}

export default function StudioBlockFields({ blockType, content, onChange }: { blockType: BlockType; content: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void }) {
  const update = (key: string, value: unknown) => onChange({ ...content, [key]: value });
  return <div className="space-y-4">
    <fieldset className="rounded-xl border border-line bg-paper/45 p-3">
      <legend className="px-1 text-xs font-semibold">Editorial treatment</legend>
      <p className="mb-3 text-xs leading-5 text-ink-soft">Describe the learning purpose. BookQuest uses these choices to compose the moment without relying on card order.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold">Intent<select value={String(content.intent ?? "")} onChange={(event) => update("intent", event.target.value || undefined)} className="field mt-2"><option value="">Automatic</option>{BLOCK_INTENTS.map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select></label>
        <label className="text-xs font-semibold">Importance<select value={String(content.importance ?? "")} onChange={(event) => update("importance", event.target.value || undefined)} className="field mt-2"><option value="">Automatic</option>{BLOCK_IMPORTANCE.map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select></label>
        <label className="text-xs font-semibold">Density<select value={String(content.density ?? "")} onChange={(event) => update("density", event.target.value || undefined)} className="field mt-2"><option value="">Automatic</option>{BLOCK_DENSITIES.map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select></label>
      </div>
    </fieldset>
    {Object.entries(content).filter(([key]) => !["type", "intent", "importance", "density"].includes(key)).map(([key, value]) => {
      if (key === "questions" && blockType === "survey" && Array.isArray(value)) {
        return <SurveyQuestions key={key} values={value as Array<{ id: string; label: string; responseType: "text" | "scale" | "choice" }>} onChange={(next) => update(key, next)} />;
      }
      if (typeof value === "boolean") return <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-paper/45 px-4 text-sm font-semibold"><input type="checkbox" checked={value} onChange={(event) => update(key, event.target.checked)} className="h-4 w-4" />{labelFor(key)}</label>;
      if (typeof value === "number") {
        if (key === "correctIndex" && Array.isArray(content.options)) return <fieldset key={key} className="space-y-2"><legend className="text-xs font-semibold">Correct answer</legend>{(content.options as string[]).map((option, index) => <label key={index} className="flex min-h-10 items-center gap-3 rounded-xl border border-line px-3 text-sm"><input type="radio" name="correctIndex" checked={value === index} onChange={() => update(key, index)} />{option || `Option ${index + 1}`}</label>)}</fieldset>;
        return <label key={key} className="block text-xs font-semibold">{labelFor(key)}<input type="number" value={value} onChange={(event) => update(key, Number(event.target.value))} className="field mt-2" /></label>;
      }
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) return <StringList key={key} name={key} values={value as string[]} onChange={(next) => update(key, next)} />;
      if (typeof value === "string") return <TextField key={key} name={key} value={value} onChange={(next) => update(key, next)} />;
      return <div key={key} className="rounded-xl bg-paper p-3 text-xs text-ink-soft">{labelFor(key)} is retained as structured data.</div>;
    })}
  </div>;
}
