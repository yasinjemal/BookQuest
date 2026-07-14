"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import {
  COURSE_ACCENTS,
  COURSE_ACCENT_HEX,
  COURSE_APPEARANCE_TEMPLATES,
  COURSE_ATMOSPHERES,
  COURSE_READING_WIDTHS,
  COURSE_SURFACES,
  COURSE_TYPOGRAPHIES,
  COURSE_WORLD_THEMES,
  parseCourseAppearance,
  type CourseAppearance,
} from "@/lib/course-appearance";

const labels: Record<string, string> = {
  editorial: "Editorial serif",
  literary: "Literary book",
  modern: "Modern sans",
  clear: "Clear & accessible",
  parchment: "Warm parchment",
  ivory: "Clean ivory",
  mist: "Cool mist",
  herbarium: "Herbarium",
  rose: "Soft rose",
  noir: "Noir charcoal",
  shadow: "Shadow chamber",
  crimson: "Crimson",
  full: "Full atmosphere",
  quiet: "Quiet atmosphere",
  focused: "Focused",
  balanced: "Balanced",
  wide: "Generous",
};

const titleCase = (value: string) => labels[value] ?? value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CourseAppearanceEditor({
  courseId,
  courseTitle,
  value,
  onSaved,
}: {
  courseId: number;
  courseTitle: string;
  value: CourseAppearance;
  onSaved: (appearance: CourseAppearance) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(() => parseCourseAppearance(value));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setDraft(parseCourseAppearance(value)), [value]);

  function customize<K extends keyof CourseAppearance>(key: K, next: CourseAppearance[K]) {
    setDraft((current) => ({ ...current, template: "custom", [key]: next }));
    setMessage("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/courses/${courseId}/appearance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Could not save this appearance");
        return;
      }
      const saved = parseCourseAppearance(result.appearance);
      setDraft(saved);
      setMessage(result.branched
        ? `Saved to course version ${result.versionNumber}. Learners keep the published style until this draft is reviewed and released.`
        : "Appearance saved to this course draft.");
      await onSaved(saved);
    } catch {
      setError("Could not save this appearance. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details id="course-appearance" className="group mb-8 overflow-hidden rounded-[1.5rem] border border-line bg-card shadow-card">
      <summary className="flex min-h-20 items-center justify-between gap-5 px-5 py-4 sm:px-7" aria-controls="course-appearance-controls">
        <span><span className="section-label block">Course appearance</span><span className="mt-1 block text-base font-semibold">Design this world</span></span>
        <span className="flex shrink-0 items-center gap-3 text-xs font-semibold text-ink-soft"><span className="hidden sm:inline">{titleCase(draft.worldTheme)} · {titleCase(draft.typography)}</span><span className="grid h-10 w-10 place-items-center rounded-full bg-paper transition-transform group-open:rotate-45" aria-hidden="true">+</span></span>
      </summary>
      <div id="course-appearance-controls" className="grid border-t border-line lg:grid-cols-[.95fr_1.05fr]">
        <div className="p-5 sm:p-7">
          <p className="section-label">Design choices</p>
          <h2 id="course-appearance-heading" className="display mt-2 text-4xl">Choose how this world feels.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">Templates set a complete, accessible starting point. You can then tune the world, typography, reading background, accent, atmosphere, and line length.</p>

          <fieldset className="mt-6">
            <legend className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">Starting templates</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {COURSE_APPEARANCE_TEMPLATES.map((template) => {
                const selected = draft.template === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => { setDraft(template.appearance); setMessage(""); }}
                    className={`min-h-28 rounded-2xl border p-4 text-left transition-colors ${selected ? "border-ink bg-ink text-white" : "border-line bg-paper/55 hover:border-line-deep"}`}
                  >
                    <span className="text-sm font-semibold">{template.name}</span>
                    <span className={`mt-1.5 block text-xs leading-5 ${selected ? "text-white/70" : "text-ink-soft"}`}>{template.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <details className="mt-5 rounded-2xl border border-line p-4" open>
            <summary className="flex min-h-11 items-center justify-between gap-3 font-semibold">Fine-tune this template <AppIcon name="settings" className="h-4 w-4 text-ink-soft" /></summary>
            <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <label className="text-xs font-semibold">World background<select value={draft.worldTheme} onChange={(event) => customize("worldTheme", event.target.value as CourseAppearance["worldTheme"])} className="field mt-2">{COURSE_WORLD_THEMES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <label className="text-xs font-semibold">Typography<select value={draft.typography} onChange={(event) => customize("typography", event.target.value as CourseAppearance["typography"])} className="field mt-2">{COURSE_TYPOGRAPHIES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <label className="text-xs font-semibold">Reading background<select value={draft.surface} onChange={(event) => customize("surface", event.target.value as CourseAppearance["surface"])} className="field mt-2">{COURSE_SURFACES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <label className="text-xs font-semibold">Atmosphere<select value={draft.atmosphere} onChange={(event) => customize("atmosphere", event.target.value as CourseAppearance["atmosphere"])} className="field mt-2">{COURSE_ATMOSPHERES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <label className="text-xs font-semibold">Reading width<select value={draft.readingWidth} onChange={(event) => customize("readingWidth", event.target.value as CourseAppearance["readingWidth"])} className="field mt-2">{COURSE_READING_WIDTHS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <fieldset><legend className="text-xs font-semibold">Accent colour</legend><div className="mt-2 flex min-h-12 flex-wrap items-center gap-2">{COURSE_ACCENTS.map((item) => <button key={item} type="button" onClick={() => customize("accent", item)} aria-label={`${titleCase(item)} accent`} aria-pressed={draft.accent === item} className={`grid h-11 w-11 place-items-center rounded-full border-2 ${draft.accent === item ? "border-ink" : "border-transparent"}`}><span className="h-7 w-7 rounded-full border border-black/10" style={{ background: COURSE_ACCENT_HEX[item] }} aria-hidden="true" /></button>)}</div></fieldset>
            </div>
          </details>

          <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary mt-5 w-full">{saving ? "Saving appearance…" : "Save course appearance"}<AppIcon name="spark" className="h-4 w-4" /></button>
          {message && <p role="status" className="mt-3 rounded-xl bg-go-soft px-4 py-3 text-xs font-semibold leading-5 text-go-deep">{message}</p>}
          {error && <p role="alert" className="mt-3 rounded-xl bg-no-soft px-4 py-3 text-xs font-semibold leading-5 text-no">{error}</p>}
        </div>

        <CourseAppearanceFrame appearance={draft} className="course-preview-bg border-t border-line p-4 sm:p-6 lg:border-l lg:border-t-0">
          <div className="sticky top-5 overflow-hidden rounded-[1.4rem] border border-[var(--course-line)] bg-[var(--course-canvas)] shadow-pop">
            <CourseWorld seed={`appearance:${courseId}`} title={courseTitle} theme={draft.worldTheme} accent={COURSE_ACCENT_HEX[draft.accent]} mood={draft.atmosphere === "full" ? "bright" : "calm"} progress={42} className="min-h-48" />
            <div className="course-reading-surface p-5 sm:p-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft">Live learner preview</p>
              <h3 className="display mt-2 text-4xl leading-[0.95]">{courseTitle}</h3>
              <p className="reading mt-4 text-ink-soft">One idea at a time, in a world shaped to fit the subject and the people reading it.</p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full w-[42%] rounded-full bg-[var(--course-accent)]" /></div>
            </div>
          </div>
        </CourseAppearanceFrame>
      </div>
    </details>
  );
}
