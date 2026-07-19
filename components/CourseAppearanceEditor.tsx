"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import ArtifactCoverImage from "@/components/ArtifactCoverImage";
import CoverImageEditor from "@/components/CoverImageEditor";
import CourseAppearanceFrame from "@/components/CourseAppearanceFrame";
import CourseWorld from "@/components/CourseWorld";
import {
  COURSE_ACCENTS,
  COURSE_ACCENT_HEX,
  COURSE_ATMOSPHERES,
  COURSE_READING_WIDTHS,
  COURSE_SURFACES,
  COURSE_TYPOGRAPHIES,
  COURSE_WORLD_THEMES,
  parseCourseAppearance,
  type CourseAppearance,
} from "@/lib/course-appearance";
import {
  COURSE_SURFACE_TOKENS,
  COURSE_THEME_PRESETS,
  resolveCourseThemeDefinition,
} from "@/lib/course-themes";

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
  evergreen: "Evergreen vault",
  sand: "Warm strategy sand",
  pearl: "Quiet pearl",
  frost: "Luminous frost",
  shadow: "Shadow chamber",
  wealth: "Wealth vault",
  strategy: "Strategy atlas",
  sanctuary: "Reading sanctuary",
  science: "Science lab",
  neutral: "Classic study",
  crimson: "Crimson",
  gold: "Brushed gold",
  emerald: "Emerald",
  jade: "Jade",
  cyan: "Signal cyan",
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
  coverHash,
  onCoverChanged,
  published,
}: {
  courseId: number;
  courseTitle: string;
  value: CourseAppearance;
  onSaved: (appearance: CourseAppearance) => void | Promise<void>;
  coverHash: string | null;
  onCoverChanged: (coverHash: string | null) => void;
  published?: boolean;
}) {
  const [draft, setDraft] = useState(() => parseCourseAppearance(value));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const draftTheme = resolveCourseThemeDefinition(draft);
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
    <details id="course-appearance" className="course-theme-editor group mb-8 border border-line bg-card shadow-card">
      <summary className="flex min-h-20 items-center justify-between gap-5 px-5 py-4 sm:px-7" aria-controls="course-appearance-controls">
        <span><span className="section-label block">World system</span><span className="mt-1 block text-base font-semibold">{draftTheme.name}</span></span>
        <span className="flex shrink-0 items-center gap-3 text-xs font-semibold text-ink-soft"><span className="hidden sm:inline">{titleCase(draftTheme.cardStyle)} cards · {titleCase(draftTheme.lockStyle)} locks</span><span className="grid h-10 w-10 place-items-center rounded-full bg-paper transition-transform group-open:rotate-45" aria-hidden="true">+</span></span>
      </summary>
      <div id="course-appearance-controls" className="grid border-t border-line lg:grid-cols-[1.08fr_.92fr]">
        <div className="p-5 sm:p-7">
          <p className="section-label">Subject atmosphere</p>
          <h2 id="course-appearance-heading" className="display mt-2 text-4xl">Choose the world, keep the rules.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">Every preset changes the mood, card treatment, pattern language, locks, and controls while navigation and reading behaviour stay familiar.</p>

          <div className="mt-6"><CoverImageEditor kind="course" artifactId={courseId} title={courseTitle} coverHash={coverHash} onChanged={onCoverChanged} /></div>

          <fieldset className="mt-6">
            <legend className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">Premium presets</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {COURSE_THEME_PRESETS.map((theme) => {
                const selected = draft.template === theme.id;
                const surface = COURSE_SURFACE_TOKENS[theme.appearance.surface];
                return (
                  <button
                    key={theme.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => { setDraft(theme.appearance); setMessage(""); }}
                    className="theme-preset-card min-h-32 border p-4 text-left transition-all"
                    data-selected={selected ? "true" : "false"}
                  >
                    <span className="mb-4 flex gap-1.5" aria-hidden="true"><span style={{ background: theme.colors.primary }} /><span style={{ background: surface.canvas }} /><span style={{ background: theme.colors.ambient }} /></span>
                    <span className="text-sm font-semibold">{theme.name}</span>
                    <span className="mt-1.5 block text-xs leading-5 text-ink-soft">{theme.tagline}</span>
                    <span className="mt-3 flex flex-wrap gap-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-ink-soft"><span>{theme.decorativePattern}</span><span>{theme.lockStyle}</span></span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <details className="mt-5 rounded-2xl border border-line p-4">
            <summary className="flex min-h-11 items-center justify-between gap-3 font-semibold">Fine-tune this world <AppIcon name="settings" className="h-4 w-4 text-ink-soft" /></summary>
            <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <label className="text-xs font-semibold">World background<select value={draft.worldTheme} onChange={(event) => customize("worldTheme", event.target.value as CourseAppearance["worldTheme"])} className="field mt-2">{COURSE_WORLD_THEMES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <label className="text-xs font-semibold">Typography<select value={draft.typography} onChange={(event) => customize("typography", event.target.value as CourseAppearance["typography"])} className="field mt-2">{COURSE_TYPOGRAPHIES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <label className="text-xs font-semibold">Reading background<select value={draft.surface} onChange={(event) => customize("surface", event.target.value as CourseAppearance["surface"])} className="field mt-2">{COURSE_SURFACES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <label className="text-xs font-semibold">Atmosphere<select value={draft.atmosphere} onChange={(event) => customize("atmosphere", event.target.value as CourseAppearance["atmosphere"])} className="field mt-2">{COURSE_ATMOSPHERES.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <label className="text-xs font-semibold">Reading width<select value={draft.readingWidth} onChange={(event) => customize("readingWidth", event.target.value as CourseAppearance["readingWidth"])} className="field mt-2">{COURSE_READING_WIDTHS.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              <fieldset><legend className="text-xs font-semibold">Accent colour</legend><div className="mt-2 flex min-h-12 flex-wrap items-center gap-2">{COURSE_ACCENTS.map((item) => <button key={item} type="button" onClick={() => customize("accent", item)} aria-label={`${titleCase(item)} accent`} aria-pressed={draft.accent === item} className={`grid h-11 w-11 place-items-center rounded-full border-2 ${draft.accent === item ? "border-ink" : "border-transparent"}`}><span className="h-7 w-7 rounded-full border border-black/10" style={{ background: COURSE_ACCENT_HEX[item] }} aria-hidden="true" /></button>)}</div></fieldset>
            </div>
          </details>

          <button type="button" onClick={() => void save()} disabled={saving} className="course-accent-button mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-bold">{saving ? "Saving appearance…" : "Save course appearance"}<AppIcon name="spark" className="h-4 w-4" /></button>
          {message && <p role="status" className="mt-3 rounded-xl bg-go-soft px-4 py-3 text-xs font-semibold leading-5 text-go-deep">{message}</p>}
          {error && <p role="alert" className="mt-3 rounded-xl bg-no-soft px-4 py-3 text-xs font-semibold leading-5 text-no">{error}</p>}
        </div>

        <CourseAppearanceFrame appearance={draft} className="course-preview-bg order-first border-b border-line p-4 sm:p-6 lg:order-last lg:border-b-0 lg:border-l">
          <div className="sticky top-5 overflow-hidden border border-[var(--course-line)] bg-[var(--course-canvas)] shadow-pop" style={{ borderRadius: "var(--course-card-radius)" }}>
            <div className="relative min-h-44 overflow-hidden">
              <CourseWorld seed={`appearance:${courseId}`} title={courseTitle} theme={draft.worldTheme} accent={COURSE_ACCENT_HEX[draft.accent]} mood={draft.atmosphere === "full" ? "bright" : "calm"} progress={42} className="absolute inset-0 min-h-full" />
              <ArtifactCoverImage kind="course" artifactId={courseId} contentHash={coverHash} variant="course" priority />
            </div>
            <div className="course-reading-surface p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft">{draftTheme.name} · {published ? "Draft preview — published course unchanged" : "Learner preview"}</p>
              <h3 className="display mt-2 text-3xl leading-[0.98]">{courseTitle}</h3>
              <p className="reading mt-3 text-ink-soft">One idea at a time, in a world shaped to fit the subject.</p>
              <div className="mt-5 h-1 overflow-hidden rounded-full bg-line"><div className="h-full w-[42%] rounded-full bg-[var(--course-accent)]" /></div>
            </div>
          </div>
        </CourseAppearanceFrame>
      </div>
    </details>
  );
}
