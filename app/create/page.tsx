"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import AppIcon, { type AppIconName } from "@/components/AppIcon";
import CourseWorld from "@/components/CourseWorld";

type CreationMode = "ai" | "manual" | "sources" | "recipe";
interface SpaceOption { space: { id: string; name: string; type: string }; membership: { role: string } }
interface SourceOption { id: string; title: string; kind: string; source_version_id: string }
interface RecipeOption { id: string; title: string; recipe_version_id: string; status: string }
interface StarterOption { id: string; title: string }

const creationMethods: Array<{ id: CreationMode; title: string; description: string; icon: AppIconName }> = [
  { id: "ai", title: "Create with AI", description: "Upload one document and receive an editable draft to review.", icon: "spark" },
  { id: "manual", title: "Create manually", description: "Open a calm, beautifully blank Studio draft.", icon: "create" },
  { id: "sources", title: "Build from saved sources", description: "Combine several approved sources from this Space.", icon: "source" },
  { id: "recipe", title: "Start from a recipe", description: "Apply a trusted teaching structure to a new draft.", icon: "layers" },
];

export default function CreatePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [creationMode, setCreationMode] = useState<CreationMode>("ai");
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [starters, setStarters] = useState<StarterOption[]>([]);
  const [recipeVersionId, setRecipeVersionId] = useState("");
  const [starterId, setStarterId] = useState("onboarding");
  const [title, setTitle] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceKind, setSourceKind] = useState("manual");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [generateWithAi, setGenerateWithAi] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    setWelcome(new URLSearchParams(window.location.search).get("welcome") === "1");
  }, []);

  const loadSources = useCallback(async (chosenSpace: string) => {
    if (!chosenSpace) return setSources([]);
    const response = await fetch(`/api/studio/sources?spaceId=${encodeURIComponent(chosenSpace)}`);
    if (!response.ok) return;
    const data = await response.json();
    setSources(data.sources ?? []);
    setSelected([]);
  }, []);

  const loadRecipes = useCallback(async (chosenSpace: string) => {
    if (!chosenSpace) return setRecipes([]);
    const response = await fetch(`/api/studio/recipes?spaceId=${encodeURIComponent(chosenSpace)}`);
    if (!response.ok) return;
    const data = await response.json();
    setRecipes(data.recipes ?? []);
    setStarters(data.starters ?? []);
    setRecipeVersionId("");
  }, []);

  useEffect(() => {
    void fetch("/api/spaces").then(async (response) => {
      if (response.status === 401) return router.push("/login");
      const data = await response.json();
      const available = data.spaces ?? [];
      setSpaces(available);
      const first = available[0]?.space.id ?? "";
      setSpaceId(first);
      await Promise.all([loadSources(first), loadRecipes(first)]);
    });
  }, [loadRecipes, loadSources, router]);

  async function uploadFile(file: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("generate", String(generateWithAi));
    try {
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? "The source could not be opened.");
      if (data.studioUrl) router.push(data.studioUrl);
      else if (data.courseId) router.push(`/studio/${data.courseId}`);
    } catch {
      setError("The upload did not finish. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addStarterRecipe() {
    const response = await fetch("/api/studio/recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "starter", spaceId, starterId, visibility: "private" }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Could not add starter recipe");
    await loadRecipes(spaceId);
    setRecipeVersionId(data.recipeVersionId);
  }

  async function addSource(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/studio/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spaceId, title: sourceTitle, kind: sourceKind, content: [{ title: sourceTitle, text: sourceContent }], sourceUrl: sourceUrl || undefined }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "Could not add source");
    setSourceTitle(""); setSourceContent(""); setSourceUrl("");
    await loadSources(spaceId);
  }

  async function createCourse(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const sourceVersionIds = creationMode === "sources" || creationMode === "recipe" ? selected : [];
    try {
      const response = await fetch("/api/studio/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: sourceVersionIds.length ? "sources" : "blank", spaceId, title, sourceVersionIds, recipeVersionId: creationMode === "recipe" && recipeVersionId ? recipeVersionId : undefined }) });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? "Could not create draft");
      router.push(`/studio/${data.courseId}`);
    } finally { setBusy(false); }
  }

  const showSources = creationMode === "sources" || creationMode === "recipe";
  const selectedSpace = spaces.find(({ space }) => space.id === spaceId)?.space;

  return (
    <div className="page-wrap">
      <div className="content-measure">
        {welcome && <section className="mb-5 rounded-[1.35rem] border border-teal/20 bg-teal/8 p-5" aria-label="First course onboarding"><p className="text-sm font-bold text-teal-deep">Welcome to BookQuest. Let’s make your first course.</p><ol className="mt-3 grid gap-2 text-xs text-ink-soft sm:grid-cols-3"><li><strong className="text-ink">1. Upload</strong> your material</li><li><strong className="text-ink">2. Edit</strong> the generated draft</li><li><strong className="text-ink">3. Share</strong> when it is ready</li></ol></section>}

        <header className="grid overflow-hidden rounded-[1.75rem] bg-pine text-white shadow-pop lg:grid-cols-[1.06fr_.94fr]">
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal">Create your first course</p><h1 className="display mt-3 text-[clamp(3rem,10vw,5.7rem)] leading-[0.9]">Turn your document into a course.</h1><p className="mt-5 max-w-xl text-base leading-7 text-white/75">Upload a book, PDF, notes, or training document. Turn it into an interactive course you can edit, study, and share.</p><div className="mt-7 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55"><span>Private by default</span><span>Fully editable</span><span>You choose when to share</span></div></div>
          <CourseWorld seed="creator-workshop" theme="workshop" progress={12} className="min-h-64 lg:min-h-[28rem]" />
        </header>

        <section className="relative z-10 mx-auto -mt-5 max-w-3xl rounded-[1.6rem] border border-line bg-card p-5 shadow-pop sm:-mt-8 sm:p-8" aria-labelledby="quick-create-heading">
          <div className="max-w-2xl"><p className="section-label">The fastest way to begin</p><h2 id="quick-create-heading" className="display mt-2 text-4xl">Choose one document</h2><p className="mt-3 text-sm leading-6 text-ink-soft">BookQuest opens it as an editable draft. Nothing is published automatically.</p></div>
          <label onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void uploadFile(file); }} className={`relative mt-6 flex min-h-60 cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed p-6 text-center transition-colors focus-within:ring-4 focus-within:ring-teal/15 ${dragging ? "border-teal bg-teal/5" : "border-line-deep bg-paper/45 hover:border-teal"}`}><input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.md,.txt,.markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} aria-label="Choose a book, PDF, notes, or training document" className="absolute inset-0 cursor-pointer opacity-0" /><span className="grid h-14 w-14 place-items-center rounded-full bg-ink text-white"><AppIcon name="source" className="h-6 w-6" /></span><strong className="display mt-5 text-3xl font-normal">{busy ? "Opening your document…" : "Drop your document here"}</strong><span className="mt-2 text-xs text-ink-soft">or tap to choose PDF, DOCX, PPTX, Markdown, or text</span></label>
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-sky/35 p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong className="block text-sm">AI-assisted editable draft</strong><span className="mt-1 block text-xs leading-5 text-ink-soft">{generateWithAi ? "On · uses one creation credit" : "Off · source-only draft, no credit used"}</span></div><label className="inline-flex min-h-11 items-center gap-3 rounded-full border border-line-deep bg-card px-4 text-sm font-semibold"><input type="checkbox" checked={generateWithAi} onChange={(event) => setGenerateWithAi(event.target.checked)} className="h-4 w-4" />{generateWithAi ? "On" : "Off"}</label></div>
          {error && <p role="alert" className="mt-5 rounded-xl bg-no-soft px-4 py-3 text-sm font-semibold text-no">{error}</p>}
        </section>

        <details className="panel mt-6">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-4 font-semibold"><span>More ways to create</span><span className="text-xs font-normal text-ink-soft">Blank course, saved sources, recipes, and destination</span></summary>
          <div className="mt-6 border-t border-line pt-6">
            <section aria-labelledby="creation-method-heading"><p className="section-label">Optional starting points</p><h2 id="creation-method-heading" className="display mt-2 text-4xl">Choose a different starting point</h2><div className="mt-5 grid gap-3 md:grid-cols-3">{creationMethods.filter((method) => method.id !== "ai").map((method) => <button key={method.id} type="button" onClick={() => setCreationMode(method.id)} aria-pressed={creationMode === method.id} className={`min-h-40 rounded-[1.35rem] border p-5 text-left transition-[transform,border-color,background] hover:-translate-y-0.5 ${creationMode === method.id ? "border-ink bg-ink text-white shadow-pop" : "border-line bg-card text-ink shadow-card"}`}><span className={`grid h-10 w-10 place-items-center rounded-full ${creationMode === method.id ? "bg-signal text-ink" : "bg-paper text-teal"}`}><AppIcon name={method.icon} className="h-5 w-5" /></span><span className="mt-6 block font-semibold">{method.title}</span><span className={`mt-2 block text-xs leading-5 ${creationMode === method.id ? "text-white/65" : "text-ink-soft"}`}>{method.description}</span></button>)}</div></section>
            <section className="mt-6 rounded-xl border border-line bg-paper/60 p-4" aria-labelledby="space-choice-heading"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-signal text-ink"><AppIcon name="spaces" className="h-4 w-4" /></span><div className="min-w-0 flex-1"><label id="space-choice-heading" htmlFor="creation-space" className="block text-xs font-bold uppercase tracking-[0.13em] text-ink-soft">Save course in</label><select id="creation-space" value={spaceId} onChange={(event) => { setSpaceId(event.target.value); void Promise.all([loadSources(event.target.value), loadRecipes(event.target.value)]); }} className="mt-1 w-full bg-transparent text-base font-semibold outline-none">{spaces.map(({ space }) => <option key={space.id} value={space.id}>{space.name}{spaces.length > 1 ? ` · ${space.type}` : ""}</option>)}</select></div></div>{selectedSpace && <p className="mt-3 pl-12 text-xs text-ink-soft">Your default is {selectedSpace.name}. Change it only when you are creating for another workspace.</p>}</section>
            {creationMode !== "ai" && <form onSubmit={createCourse} className="mt-6 space-y-6 rounded-[1.35rem] border border-line bg-card p-5 sm:p-7"><div><p className="section-label">{creationMethods.find((method) => method.id === creationMode)?.title}</p><h2 className="display mt-2 text-4xl">Name your course</h2><p className="mt-3 text-sm leading-6 text-ink-soft">You will enter Studio with full editorial control.</p></div><label className="block text-sm font-semibold">Course title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A clear title learners can remember" className="field mt-2" /></label>
            {showSources && <fieldset><legend className="text-sm font-semibold">{creationMode === "sources" ? "Choose one or more trusted sources" : "Optional source foundation"}</legend><div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">{sources.length === 0 && <p className="rounded-xl bg-paper p-4 text-sm text-ink-soft">No saved sources yet. Add text to the source library below, or continue with a blank recipe draft.</p>}{sources.map((source) => <label key={source.source_version_id} className="flex min-h-14 items-start gap-3 rounded-xl border border-line bg-ivory p-4 hover:border-line-deep"><input type="checkbox" checked={selected.includes(source.source_version_id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, source.source_version_id] : current.filter((id) => id !== source.source_version_id))} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-semibold">{source.title}</span><span className="text-xs capitalize text-ink-soft">{source.kind}</span></span></label>)}</div></fieldset>}
            {creationMode === "recipe" && <div className="rounded-[1.2rem] bg-sky/35 p-4 sm:p-5"><label className="block text-sm font-semibold">Teaching recipe<select value={recipeVersionId} onChange={(event) => setRecipeVersionId(event.target.value)} className="field mt-2"><option value="">Choose a recipe later</option>{recipes.map((recipe) => <option key={recipe.recipe_version_id} value={recipe.recipe_version_id}>{recipe.title} · {recipe.status}</option>)}</select></label><div className="mt-4 flex flex-col gap-2 sm:flex-row"><select value={starterId} onChange={(event) => setStarterId(event.target.value)} aria-label="Starter recipe" className="field min-w-0 flex-1">{starters.map((starter) => <option key={starter.id} value={starter.id}>{starter.title}</option>)}</select><button type="button" onClick={() => void addStarterRecipe()} className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-deep bg-card px-5 text-sm font-semibold">Add starter recipe</button></div></div>}
            <button disabled={busy || !spaceId || title.trim().length < 2 || (creationMode === "sources" && selected.length === 0)} className="btn-primary w-full">{busy ? "Opening Studio…" : creationMode === "sources" ? `Create from ${selected.length} source${selected.length === 1 ? "" : "s"}` : creationMode === "recipe" ? "Create recipe draft" : "Create blank draft"}<AppIcon name="arrow" className="h-4 w-4" /></button>
            </form>}
          </div>
        </details>

        <details className="panel mt-6"><summary className="flex min-h-11 items-center justify-between gap-4 text-sm font-semibold">Add text to the source library <span className="text-xs font-normal text-ink-soft">Optional</span></summary><form onSubmit={addSource} className="mt-5 space-y-4 border-t border-line pt-5"><div><h2 className="display text-3xl">Save a trusted text source</h2><p className="mt-2 text-xs leading-5 text-ink-soft">Paste approved notes, a transcript, or webpage text for reuse across several courses.</p></div><label className="block text-sm font-semibold">Source title<input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} className="field mt-2" /></label><label className="block text-sm font-semibold">Source kind<select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)} className="field mt-2"><option value="manual">Manual notes</option><option value="transcript">Transcript</option><option value="text">Plain text</option><option value="markdown">Markdown</option><option value="webpage">Approved webpage text</option></select></label>{sourceKind === "webpage" && <label className="block text-sm font-semibold">Original webpage URL<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} className="field mt-2" /></label>}<label className="block text-sm font-semibold">Source text<textarea value={sourceContent} onChange={(event) => setSourceContent(event.target.value)} rows={7} className="field mt-2" /></label><button disabled={!spaceId || sourceTitle.trim().length < 2 || !sourceContent.trim()} className="btn-teal">Save to source library</button></form></details>
      </div>
    </div>
  );
}
